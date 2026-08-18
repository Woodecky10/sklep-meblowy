"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { invalidateCollectionsCache } from "@/app/_lib/collections";

export type ActionResult =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; error: string };

function sanitize(input: unknown, max = 500): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

// Slugifikacja (kebab-case PL — bez polskich diakrytyków, bez spacji)
function toSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ============================================================
// CREATE
// ============================================================
export async function createCollection(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const label = sanitize(formData.get("label"), 200);
  if (!label) return { ok: false, error: "Nazwa kolekcji jest wymagana" };

  const slugInput = sanitize(formData.get("slug"), 80);
  const slug = slugInput ? toSlug(slugInput) : toSlug(label);
  if (!slug) return { ok: false, error: "Nie udało się wygenerować sluga" };

  const description = emptyToNull(sanitize(formData.get("description"), 1000));
  const labelDe = emptyToNull(sanitize(formData.get("label_de"), 200));
  const descriptionDe = emptyToNull(sanitize(formData.get("description_de"), 1000));

  const supabase = await createAdminClient();

  // Nowa kolekcja ląduje na KOŃCU listy (jak createTile w /admin/kafelki).
  // Bez tego insert bierze default 0 z migracji 66 i kolekcja wskakuje na
  // szczyt panelu, a gdy dostanie aktywne produkty — na pierwszą pozycję
  // strony głównej, spychając ręcznie ustawioną szóstą kolekcję pod kreskę
  // "poniżej dopiero po rozwinięciu".
  const { data: maxRow } = await supabase
    .from("collections")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1;

  const { error, data } = await supabase
    .from("collections")
    .insert({
      slug,
      label,
      label_de: labelDe,
      description,
      description_de: descriptionDe,
      sort_order: nextOrder,
    } as never)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: `Kolekcja "${slug}" już istnieje` };
    return { ok: false, error: error.message };
  }

  invalidateCollectionsCache();
  revalidatePath("/admin/kolekcje");
  return { ok: true, message: `Kolekcja "${label}" utworzona`, data };
}

// ============================================================
// UPDATE — tylko label + description (slug niezmienny po utworzeniu)
// ============================================================
export async function updateCollection(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const label = sanitize(formData.get("label"), 200);
  if (!label) return { ok: false, error: "Nazwa kolekcji jest wymagana" };

  const description = emptyToNull(sanitize(formData.get("description"), 1000));

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("collections")
    .update({ label, description } as never)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  invalidateCollectionsCache();
  revalidatePath("/admin/kolekcje");
  revalidatePath("/sklep");
  return { ok: true, message: "Kolekcja zapisana" };
}

// ============================================================
// DELETE
// ============================================================
// Produkty należące do kolekcji NIE są kasowane — FK ON DELETE SET NULL
// odepnie je automatycznie.
export async function deleteCollection(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateCollectionsCache();
  revalidatePath("/admin/kolekcje");
  revalidatePath("/sklep");
  return { ok: true, message: "Kolekcja usunięta" };
}

// ============================================================
// setCollectionProducts — przypisz dokładnie tę listę produktów do kolekcji
// ============================================================
// 1. Wszystkie podane productIds dostają collection_id = collectionId.
// 2. Wszystkie INNE produkty obecnie należące do tej kolekcji (które nie są
//    w nowej liście) — odpinają się (collection_id = null).
// Atomowo na poziomie kolekcji.
// Zapis kolejności produktów w kolekcji (migracja 75). Kolejność niesie sama
// tablica `productIds` — panel oddaje ją w tej, którą admin ułożył przeciąganiem.
//
// ⚠️ To DRUGIE wywołanie RPC, nie część transakcji z przypisaniem. Świadomie:
// pad między nimi zostawia przypisania zapisane, a kolejność starą — czyli
// widok sprzed zmiany, który naprawia kolejny zapis. To jest jakościowo inna
// sytuacja niż audyt LOW #14/#15 (tam rozjeżdżały się metadane z przypisaniami
// i dane znikały klientowi z oczu). Gdyby kiedyś kolejność zaczęła znaczyć
// więcej, wzorzec do naśladowania jest w save_collection: jedna funkcja SQL
// robiąca oba UPDATE-y.
async function persistCollectionProductOrder(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  productIds: string[]
): Promise<string | null> {
  if (productIds.length === 0) return null;
  const { error } = await supabase.rpc("reorder_collection_products", {
    p_ids: productIds,
  });
  return error ? `Zapis kolejności: ${error.message}` : null;
}

export async function setCollectionProducts(
  collectionId: string,
  productIds: string[]
): Promise<ActionResult> {
  await requireAdmin();
  if (!collectionId) return { ok: false, error: "Brak id kolekcji" };

  const supabase = await createAdminClient();

  // Assign + unassign w JEDNEJ transakcji (RPC) — koniec częściowego stanu
  // przy padzie między krokami (audyt LOW #15). Pusta lista = odpina wszystko.
  const { error } = await supabase.rpc("set_collection_products", {
    p_collection_id: collectionId,
    p_product_ids: productIds,
  });
  if (error) return { ok: false, error: `Zapis przypisań: ${error.message}` };

  const orderError = await persistCollectionProductOrder(supabase, productIds);
  if (orderError) return { ok: false, error: orderError };

  invalidateCollectionsCache();
  revalidatePath("/admin/kolekcje");
  revalidatePath("/sklep");
  return { ok: true, message: `Przypisano ${productIds.length} produktów` };
}

// ============================================================
// saveCollection — metadane + przypisania w JEDNEJ transakcji (#14)
// ============================================================
// Edytor zapisywał kolekcję dwoma osobnymi server actions (updateCollection +
// setCollectionProducts) — pad między nimi zostawiał metadane zapisane, a
// przypisania nie. RPC save_collection robi oba UPDATE atomowo.
export async function saveCollection(
  formData: FormData,
  productIds: string[]
): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const label = sanitize(formData.get("label"), 200);
  if (!label) return { ok: false, error: "Nazwa kolekcji jest wymagana" };

  const description = emptyToNull(sanitize(formData.get("description"), 1000));
  const labelDe = emptyToNull(sanitize(formData.get("label_de"), 200));
  const descriptionDe = emptyToNull(sanitize(formData.get("description_de"), 1000));

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("save_collection", {
    p_id: id,
    p_label: label,
    p_label_de: labelDe,
    p_description: description,
    p_description_de: descriptionDe,
    p_product_ids: productIds,
  });
  if (error) return { ok: false, error: error.message };

  const orderError = await persistCollectionProductOrder(supabase, productIds);
  if (orderError) return { ok: false, error: orderError };

  invalidateCollectionsCache();
  revalidatePath("/admin/kolekcje");
  revalidatePath("/sklep");
  return { ok: true, message: "Kolekcja zapisana" };
}

// ============================================================
// Kolejność na stronie głównej (spec 2026-07-31)
// ============================================================
// Atomowy reorder przez RPC — pętla UPDATE po jednym wierszu przy padzie
// w połowie zostawia kolekcje z pomieszanymi numerami (jak reorderTiles).
export async function reorderCollections(
  order: { id: string; sort_order: number }[]
): Promise<ActionResult> {
  await requireAdmin();

  if (!Array.isArray(order) || order.length === 0) {
    return { ok: false, error: "Pusta lista kolejności" };
  }

  // Odrzucamy całe żądanie, gdy którekolwiek id jest puste. reorder_collections
  // przenumerowuje DOKŁADNIE to, co dostanie, więc samo `.filter(Boolean)`
  // przestawiłoby podzbiór kolekcji (reszta zostaje ze starymi numerami), a
  // akcja i tak zwróciłaby ok:true z "Kolejność zapisana" — cicha, częściowa
  // zmiana kolejności zameldowana jako sukces.
  const ids = order.map((o) => o.id).filter(Boolean);
  if (ids.length !== order.length) {
    return { ok: false, error: "Lista kolejności zawiera puste id — nic nie zapisano" };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("reorder_collections", { p_ids: ids });
  if (error) return { ok: false, error: `Reorder zawiódł: ${error.message}` };

  invalidateCollectionsCache();
  revalidatePath("/admin/kolekcje");
  revalidatePath("/");
  return { ok: true, message: "Kolejność zapisana" };
}

// Ptaszek "pokazuj na stronie głównej" — zapis od razu, osobno od formularza
// edycji. Metadane kolekcji idą przez save_collection(uuid,text,text,uuid[])
// o ustalonej sygnaturze; dopisanie tam pola wymagałoby zmiany funkcji
// używanej też przez inną ścieżkę.
export async function toggleCollectionOnHome(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const show = formData.get("show") === "1";

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("collections")
    .update({ show_on_home: show } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateCollectionsCache();
  revalidatePath("/admin/kolekcje");
  revalidatePath("/");
  return {
    ok: true,
    message: show ? "Kolekcja wróciła na stronę główną" : "Kolekcja ukryta ze strony głównej",
  };
}
