"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import {
  invalidateFabricsCache,
  invalidateFabricGroupsCache,
  invalidateFabricPropertyDefsCache,
} from "@/app/_lib/fabrics";
import { invalidateFacetsCache } from "@/app/_lib/products";
import { sanitizeRichHtml } from "@/app/_lib/product-html";
import { fabricSlug } from "@/app/_lib/fabric-slug";
import {
  buildGroupSurchargeMap,
  rebuildFabricValuePrices,
  removeFabricFromVariants,
  remapFabricInVariants,
  type FabricLite,
} from "@/app/_lib/variants";
import type { ProductVariants } from "@/app/_lib/types";
import { parseFeaturedProductIds } from "@/app/_lib/fabric-featured-products";
import {
  FABRIC_PROPERTY_LABEL_MAX,
  fabricPropertiesPatch,
  filterKnownCodes,
  isFabricPropertyIcon,
  normalizePropertyCodes,
  propertyCodeSlug,
} from "@/app/_lib/fabric-properties";

export type ActionResult =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; error: string };

function sanitize(input: unknown, max = 200): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

function parseSort(input: unknown): number {
  const n = typeof input === "string" ? Number(input) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

// Wiersze koloru z JSON (`[{code, image}]`) → uporządkowane kody + mapa zdjęć.
// Kody: trim, dedupe, zachowana kolejność. image tylko gdy to URL http(s).
function parseColorRows(input: unknown): {
  colors: string[];
  color_images: Record<string, string>;
} {
  const colors: string[] = [];
  const color_images: Record<string, string> = {};
  if (typeof input !== "string") return { colors, color_images };
  let rows: unknown;
  try {
    rows = JSON.parse(input);
  } catch {
    return { colors, color_images };
  }
  if (!Array.isArray(rows)) return { colors, color_images };
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const rec = r as { code?: unknown; image?: unknown };
    const code = typeof rec.code === "string" ? rec.code.trim().slice(0, 60) : "";
    if (!code || seen.has(code)) continue;
    seen.add(code);
    colors.push(code);
    const image = typeof rec.image === "string" ? rec.image.trim() : "";
    if (/^https?:\/\//.test(image)) color_images[code] = image;
  }
  return { colors, color_images };
}

// Dopłata: pusta/NaN/ujemna → 0; inaczej liczba z 2 miejscami.
function parsePrice(input: unknown): number {
  if (typeof input !== "string" || input.trim() === "") return 0;
  const n = Number(input.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

// Opis z RichTextEditor: sanityzacja server-side; pusty → null.
function parseRichHtml(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const clean = sanitizeRichHtml(input).trim();
  return clean === "" ? null : clean;
}

// Walidacja serwerowa wybranych produktów: jedno zapytanie in(); zostają tylko
// istniejące id (kolejność zachowana). Przy błędzie zapytania zwraca ids bez
// zmian, żeby przejściowy błąd DB nie wyzerował wyboru admina.
async function validateFeaturedProducts(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return ids;
  const { data, error } = await supabase.from("products").select("id").in("id", ids);
  if (error) return ids;
  const known = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  return ids.filter((id) => known.has(id));
}

// Cienka skorupa nad czystymi helperami z fabric-properties.ts: jedyne, co robi
// sama, to round-trip do bazy po zbiór istniejących kodów.
// `null` = zapytania nie dało się wykonać; wołający przerywa zapis z błędem,
// zamiast po cichu wyczyścić zaznaczenia admina.
async function validateFabricPropertyCodes(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  raw: FormDataEntryValue[]
): Promise<string[] | null> {
  const wanted = normalizePropertyCodes(raw);
  if (wanted.length === 0) return [];
  const { data, error } = await supabase.from("fabric_property_defs").select("code");
  if (error) return null;
  const known = new Set(((data ?? []) as { code: string }[]).map((r) => r.code));
  return filterKnownCodes(wanted, known);
}

const PROPERTIES_READ_ERROR =
  "Nie udało się odczytać listy cech tkanin — spróbuj zapisać ponownie";

// Czy formularz w ogóle wyrenderował sekcję cech (ukryty marker). Brak markera
// = lista definicji była niedostępna, więc pusty `getAll("properties")` znaczy
// „nie wiem", a nie „admin odznaczył wszystko".
function propertiesSectionRendered(formData: FormData): boolean {
  return formData.get("properties_present") === "1";
}

// Ile zapisów produktów leci równolegle w jednej porcji. Zamienia setki
// sekwencyjnych round-tripów na kilka równoległych porcji, zdejmując ryzyko
// timeoutu funkcji serverless przy zmianie grupy dotykającej wielu produktów.
const PRODUCT_WRITE_CONCURRENCY = 20;

// Propagacja dopłat: przelicza value_prices opcji „Tkanina" we WSZYSTKICH
// produktach wg aktualnego katalogu (grupa + korekta). Zapisuje tylko
// faktycznie zmienione, w porcjach po PRODUCT_WRITE_CONCURRENCY równolegle.
// Wołane po każdej zmianie tkaniny/grupy — bez diffowania co się zmieniło
// (tanio i zawsze poprawnie; skala sklepu: setki produktów).
async function recomputeFabricSurchargesOnProducts(): Promise<{ updated: number }> {
  const supabase = await createAdminClient();
  const [{ data: fabricRows }, { data: groupRows }, { data: productRows }] = await Promise.all([
    supabase.from("fabrics").select("name, colors, price, group_id"),
    supabase.from("fabric_groups").select("id, surcharge"),
    supabase.from("products").select("id, variants").not("variants", "is", null),
  ]);
  const fabrics = (fabricRows ?? []) as FabricLite[];
  const surcharges = buildGroupSurchargeMap(
    (groupRows ?? []) as { id: string; surcharge: number }[]
  );

  // Faza 1 (czysta, bez I/O): policz produkty, które faktycznie się zmieniają.
  const changed: { id: string; variants: ProductVariants }[] = [];
  for (const row of productRows ?? []) {
    const p = row as { id: string; variants: ProductVariants | null };
    const res = rebuildFabricValuePrices(p.variants, fabrics, surcharges);
    if (res && res.changed) changed.push({ id: p.id, variants: res.variants });
  }

  const updated = await writeProductVariants(changed, "recomputeFabricSurcharges");
  if (updated > 0) {
    invalidateFacetsCache();
    revalidatePath("/sklep");
  }
  return { updated };
}

// Zapis wsadowy variants z ograniczoną współbieżnością. Błąd per produkt jest
// logowany i pomijany (licznik liczy tylko udane) — częściowy fail nie wywala
// całej akcji ani nie fałszuje liczby. Wspólne dla propagacji dopłat i dla
// usuwania tkaniny z produktów.
async function writeProductVariants(
  changed: { id: string; variants: ProductVariants }[],
  logTag: string
): Promise<number> {
  const supabase = await createAdminClient();
  let updated = 0;
  for (let i = 0; i < changed.length; i += PRODUCT_WRITE_CONCURRENCY) {
    const batch = changed.slice(i, i + PRODUCT_WRITE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (c) => {
        try {
          const { error } = await supabase
            .from("products")
            .update({ variants: c.variants } as never)
            .eq("id", c.id);
          if (error) {
            console.error(`[${logTag}] update ${c.id}:`, error.message);
            return false;
          }
          revalidatePath(`/produkt/${c.id}`);
          return true;
        } catch (e) {
          // Sieciowy/nieoczekiwany błąd pojedynczego zapisu nie może wywalić
          // całej porcji — logujemy i pomijamy (jak przy błędzie zapytania).
          console.error(`[${logTag}] update ${c.id} threw:`, e);
          return false;
        }
      })
    );
    updated += results.filter(Boolean).length;
  }
  return updated;
}

// Wycina usuwaną tkaninę z opcji „Tkanina" wszystkich produktów. Wołane PRZED
// usunięciem wiersza — potrzebuje nazwy i listy kolorów, żeby wiedzieć, które
// wartości do niej należą.
// Dociąga produkty do nowego stanu tkaniny po edycji: kolor wykreślony
// z katalogu znika z wariantów, a zmiana nazwy przepisuje wartości. Wołane
// PO zapisie wiersza, z nazwą i kolorami sprzed zapisu.
async function remapFabricOnProducts(
  poprzednia: { name: string; colors: string[] },
  aktualna: FabricLite
): Promise<{ updated: number }> {
  const supabase = await createAdminClient();
  const [{ data: productRows }, { data: fabricRows }] = await Promise.all([
    supabase.from("products").select("id, variants").not("variants", "is", null),
    supabase.from("fabrics").select("name, colors, price, group_id"),
  ]);
  // Ochrona przed tkaniną o nazwie zaczynającej się tak samo — porównujemy po
  // STAREJ nazwie, bo to ona występuje w wartościach produktów.
  const otherFabrics = ((fabricRows ?? []) as FabricLite[]).filter(
    (f) => f.name.trim() !== poprzednia.name.trim()
  );

  const changed: { id: string; variants: ProductVariants }[] = [];
  for (const row of productRows ?? []) {
    const p = row as { id: string; variants: ProductVariants | null };
    const res = remapFabricInVariants(p.variants, poprzednia, aktualna, otherFabrics);
    if (res && res.changed) changed.push({ id: p.id, variants: res.variants });
  }

  const updated = await writeProductVariants(changed, "remapFabricOnProducts");
  if (updated > 0) {
    invalidateFacetsCache();
    revalidatePath("/sklep");
  }
  return { updated };
}

async function removeFabricFromProducts(fabric: FabricLite): Promise<{ updated: number }> {
  const supabase = await createAdminClient();
  const [{ data: productRows }, { data: fabricRows }] = await Promise.all([
    supabase.from("products").select("id, variants").not("variants", "is", null),
    // Reszta katalogu = ochrona tkanin o nazwie zaczynającej się tak samo.
    supabase.from("fabrics").select("name, colors, price, group_id"),
  ]);
  const otherFabrics = ((fabricRows ?? []) as FabricLite[]).filter(
    (f) => f.name.trim() !== fabric.name.trim()
  );

  const changed: { id: string; variants: ProductVariants }[] = [];
  for (const row of productRows ?? []) {
    const p = row as { id: string; variants: ProductVariants | null };
    const res = removeFabricFromVariants(p.variants, fabric, otherFabrics);
    if (res && res.changed) changed.push({ id: p.id, variants: res.variants });
  }

  const updated = await writeProductVariants(changed, "removeFabricFromProducts");
  if (updated > 0) {
    invalidateFacetsCache();
    revalidatePath("/sklep");
  }
  return { updated };
}

export async function createFabric(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const name = sanitize(formData.get("name"));
  if (!name) return { ok: false, error: "Nazwa tkaniny jest wymagana" };
  const nameDe = emptyToNull(sanitize(formData.get("name_de")));
  const sortOrder = parseSort(formData.get("sort_order"));
  const { colors, color_images } = parseColorRows(formData.get("colors_json"));
  const price = parsePrice(formData.get("price"));
  const category = emptyToNull(sanitize(formData.get("category"), 100));
  const groupId = sanitize(formData.get("group_id"));
  if (!groupId) return { ok: false, error: "Wybierz grupę cenową" };
  const description = parseRichHtml(formData.get("description"));
  const descriptionDe = parseRichHtml(formData.get("description_de"));
  const shortInfo = emptyToNull(sanitize(formData.get("short_info"), 500));
  const shortInfoDe = emptyToNull(sanitize(formData.get("short_info_de"), 500));
  const rawFeatured = parseFeaturedProductIds(formData.get("featured_product_ids_json"));

  const supabase = await createAdminClient();
  const featuredProductIds = await validateFeaturedProducts(supabase, rawFeatured);
  // Niezaznaczony checkbox nie trafia do FormData — getAll zwraca same
  // zaznaczone kody, walidacja odsiewa kody spoza słownika cech.
  const properties = await validateFabricPropertyCodes(
    supabase,
    formData.getAll("properties")
  );
  if (properties === null) return { ok: false, error: PROPERTIES_READ_ERROR };
  // Nowa tkanina nie ma czego stracić — zawsze zapisujemy tablicę (pustą, gdy
  // sekcja cech się nie wyrenderowała).
  const { data: slugRows } = await supabase.from("fabrics").select("slug");
  const taken = new Set(
    ((slugRows ?? []) as { slug: string | null }[]).map((r) => r.slug ?? "")
  );
  const slug = fabricSlug(name, taken);

  const { error, data } = await supabase
    .from("fabrics")
    .insert({
      name, name_de: nameDe, sort_order: sortOrder, colors, color_images, price, category,
      group_id: groupId, slug, description, description_de: descriptionDe,
      short_info: shortInfo,
      short_info_de: shortInfoDe,
      properties,
      featured_product_ids: featuredProductIds,
    } as never)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: `Tkanina "${name}" już istnieje` };
    return { ok: false, error: error.message };
  }

  await recomputeFabricSurchargesOnProducts();
  invalidateFabricsCache();
  invalidateFacetsCache();
  revalidatePath("/admin/tkaniny");
  revalidatePath("/tkaniny");
  return { ok: true, message: `Tkanina "${name}" dodana`, data };
}

export async function updateFabric(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };
  const name = sanitize(formData.get("name"));
  if (!name) return { ok: false, error: "Nazwa tkaniny jest wymagana" };
  const nameDe = emptyToNull(sanitize(formData.get("name_de")));
  const sortOrder = parseSort(formData.get("sort_order"));
  const { colors, color_images } = parseColorRows(formData.get("colors_json"));
  const price = parsePrice(formData.get("price"));
  const category = emptyToNull(sanitize(formData.get("category"), 100));
  const groupId = sanitize(formData.get("group_id"));
  if (!groupId) return { ok: false, error: "Wybierz grupę cenową" };
  const description = parseRichHtml(formData.get("description"));
  const descriptionDe = parseRichHtml(formData.get("description_de"));
  const shortInfo = emptyToNull(sanitize(formData.get("short_info"), 500));
  const shortInfoDe = emptyToNull(sanitize(formData.get("short_info_de"), 500));
  const rawFeatured = parseFeaturedProductIds(formData.get("featured_product_ids_json"));

  const supabase = await createAdminClient();
  const featuredProductIds = await validateFeaturedProducts(supabase, rawFeatured);
  // Niezaznaczony checkbox nie trafia do FormData — getAll zwraca same
  // zaznaczone kody, walidacja odsiewa kody spoza słownika cech.
  const properties = await validateFabricPropertyCodes(
    supabase,
    formData.getAll("properties")
  );
  if (properties === null) return { ok: false, error: PROPERTIES_READ_ERROR };

  // Stan SPRZED zapisu — po update'cie nie da się już odtworzyć, którą nazwą
  // i którymi kolorami produkty opisują tę tkaninę.
  const { data: przedRow, error: readError } = await supabase
    .from("fabrics")
    .select("name, colors")
    .eq("id", id)
    .single();
  if (readError) return { ok: false, error: readError.message };
  const poprzednia = przedRow as { name: string; colors: string[] };

  // Klucz `properties` trafia do payloadu TYLKO wtedy, gdy formularz pokazał
  // sekcję cech. Bez markera (niedostępny słownik) edycja tkaniny zostawia jej
  // dotychczasowe zaznaczenia w spokoju, zamiast nadpisać je pustą tablicą.
  const propertiesPatch = fabricPropertiesPatch(
    propertiesSectionRendered(formData),
    properties
  );
  const { error } = await supabase
    .from("fabrics")
    .update({
      name, name_de: nameDe, sort_order: sortOrder, colors, color_images, price, category,
      group_id: groupId, description, description_de: descriptionDe,
      short_info: shortInfo,
      short_info_de: shortInfoDe,
      ...propertiesPatch,
      featured_product_ids: featuredProductIds,
    } as never)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") return { ok: false, error: `Tkanina "${name}" już istnieje` };
    return { ok: false, error: error.message };
  }

  // Przemapowanie tylko wtedy, gdy zmieniła się TOŻSAMOŚĆ wartości (nazwa lub
  // lista kolorów) — inaczej zapis samego opisu czy grupy przeorywałby
  // wszystkie produkty bez powodu. Idzie PRZED przeliczeniem dopłat, żeby
  // recompute liczył ceny dla już poprawnych wartości.
  const tozsamoscZmieniona =
    poprzednia.name.trim() !== name.trim() ||
    JSON.stringify(poprzednia.colors ?? []) !== JSON.stringify(colors);
  const wycofane = tozsamoscZmieniona
    ? (await remapFabricOnProducts(poprzednia, { name, colors, price, group_id: groupId })).updated
    : 0;

  await recomputeFabricSurchargesOnProducts();
  invalidateFabricsCache();
  invalidateFacetsCache();
  revalidatePath("/admin/tkaniny");
  revalidatePath("/tkaniny");
  return {
    ok: true,
    message:
      wycofane > 0
        ? `Tkanina zapisana — zaktualizowano ${wycofane} ${plProducts(wycofane)}`
        : "Tkanina zapisana",
  };
}

// Usunięcie z katalogu wycina tkaninę TAKŻE z wariantów produktów, które ją
// oferowały. Inaczej wartość zostawała w products.variants bez odpowiednika
// w katalogu i lądowała na karcie produktu w koszu „Pozostałe" — bez zdjęcia,
// bez strony tkaniny i z zamrożoną dopłatą. Produkty czyścimy PRZED usunięciem
// wiersza: dopasowanie potrzebuje nazwy tkaniny, a przy nieudanym kasowaniu
// zostaje stan „jest w katalogu, nie ma w produktach" — odwracalny z panelu,
// w przeciwieństwie do sierot po usuniętej tkaninie.
export async function deleteFabric(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const supabase = await createAdminClient();
  const { data: fabricRow, error: readError } = await supabase
    .from("fabrics")
    .select("name, colors, price, group_id")
    .eq("id", id)
    .single();
  if (readError) return { ok: false, error: readError.message };

  const { updated } = await removeFabricFromProducts(fabricRow as FabricLite);

  const { error } = await supabase.from("fabrics").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateFabricsCache();
  invalidateFacetsCache();
  revalidatePath("/admin/tkaniny");
  revalidatePath("/tkaniny");
  return {
    ok: true,
    message:
      updated > 0
        ? `Tkanina usunięta — wycofana też z ${updated} ${plProducts(updated)}`
        : "Tkanina usunięta",
  };
}

// Odmiana „produktu/produktów" w komunikacie po usunięciu tkaniny.
function plProducts(n: number): string {
  return n === 1 ? "produktu" : "produktów";
}

// Edycja grupy cenowej (nazwy + kwota). Kod (code) i liczba grup są stałe — v1
// bez dodawania/usuwania. Po zapisie przelicza dopłaty we wszystkich produktach.
export async function updateFabricGroup(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id grupy" };
  const name = sanitize(formData.get("name"), 100);
  if (!name) return { ok: false, error: "Nazwa grupy jest wymagana" };
  const nameDe = emptyToNull(sanitize(formData.get("name_de"), 100));
  const surcharge = parsePrice(formData.get("surcharge"));

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("fabric_groups")
    .update({ name, name_de: nameDe, surcharge } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const { updated } = await recomputeFabricSurchargesOnProducts();
  invalidateFabricGroupsCache();
  invalidateFabricsCache();
  invalidateFacetsCache();
  revalidatePath("/admin/tkaniny");
  revalidatePath("/tkaniny");
  return { ok: true, message: `Grupa zapisana — przeliczono ${updated} produkt(ów)` };
}

// ——— Cechy tkanin (słownik fabric_property_defs, migracja 64) ———————————————
// Zestaw cech jest edytowalny w panelu; w kodzie zostaje tylko biblioteka
// ikonek. `code` powstaje raz, ze slugu nazwy, i jest NIEZMIENNY — tkaniny
// trzymają kod, więc zmiana kodu odpięłaby cechę od wszystkich tkanin.

export async function createFabricProperty(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const label = sanitize(formData.get("label"), FABRIC_PROPERTY_LABEL_MAX);
  if (!label) return { ok: false, error: "Nazwa cechy jest wymagana" };
  const labelDe = emptyToNull(sanitize(formData.get("label_de"), FABRIC_PROPERTY_LABEL_MAX));
  const icon = formData.get("icon");
  // Ikonka to klucz z biblioteki w kodzie — cokolwiek innego odrzucamy tutaj,
  // żeby do bazy nie trafił klucz, którego karta produktu nie umie narysować.
  if (!isFabricPropertyIcon(icon)) return { ok: false, error: "Wybierz ikonkę" };
  const sortOrder = parseSort(formData.get("sort_order"));

  const supabase = await createAdminClient();
  const { data: codeRows } = await supabase.from("fabric_property_defs").select("code");
  const taken = new Set(((codeRows ?? []) as { code: string }[]).map((r) => r.code));
  const code = propertyCodeSlug(label, taken);

  const { error } = await supabase
    .from("fabric_property_defs")
    .insert({ code, label, label_de: labelDe, icon, sort_order: sortOrder } as never);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Taka cecha już istnieje" };
    return { ok: false, error: error.message };
  }

  invalidateFabricPropertyDefsCache();
  revalidatePath("/admin/tkaniny");
  return { ok: true, message: `Cecha "${label}" dodana` };
}

// Edycja podpisów, ikonki i kolejności. `code` świadomie poza zakresem update'u.
export async function updateFabricProperty(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id cechy" };
  const label = sanitize(formData.get("label"), FABRIC_PROPERTY_LABEL_MAX);
  if (!label) return { ok: false, error: "Nazwa cechy jest wymagana" };
  const labelDe = emptyToNull(sanitize(formData.get("label_de"), FABRIC_PROPERTY_LABEL_MAX));
  const icon = formData.get("icon");
  if (!isFabricPropertyIcon(icon)) return { ok: false, error: "Wybierz ikonkę" };
  const sortOrder = parseSort(formData.get("sort_order"));

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("fabric_property_defs")
    .update({ label, label_de: labelDe, icon, sort_order: sortOrder } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateFabricPropertyDefsCache();
  revalidatePath("/admin/tkaniny");
  // Zmiana nazwy/ikonki jest widoczna dla klienta tak samo jak usunięcie cechy.
  revalidatePath("/tkaniny");
  return { ok: true, message: `Cecha "${label}" zapisana` };
}

// Usunięcie cechy kasuje też jej zaznaczenia w tkaninach (panel pyta o zgodę
// i pokazuje licznik). Kolejność jest istotna: NAJPIERW odpięcie od tkanin,
// POTEM kasowanie definicji. Odwrotna kolejność przy częściowej awarii
// zostawiłaby w tkaninach kody bez definicji (renderują się nieszkodliwie,
// ale mylą admina i nie da się ich odznaczyć z panelu).
export async function deleteFabricProperty(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id cechy" };
  const code = sanitize(formData.get("code"), 100);
  if (!code) return { ok: false, error: "Brak kodu cechy" };

  const supabase = await createAdminClient();
  // PostgREST nie umie `set properties = array_remove(properties, $1)` bez
  // funkcji RPC, więc odczytujemy tylko tkaniny zawierające kod (operator cs)
  // i zapisujemy każdej odfiltrowaną tablicę. Tkanin są dziesiątki, nie tysiące.
  const { data: fabricRows, error: readErr } = await supabase
    .from("fabrics")
    .select("id, properties")
    .contains("properties", [code]);
  if (readErr) return { ok: false, error: readErr.message };

  let cleaned = 0;
  for (const row of (fabricRows ?? []) as { id: string; properties: string[] | null }[]) {
    const next = (row.properties ?? []).filter((c) => c !== code);
    const { error } = await supabase
      .from("fabrics")
      .update({ properties: next } as never)
      .eq("id", row.id);
    // Błąd przerywa akcję PRZED skasowaniem definicji — cecha zostaje spójna,
    // admin widzi komunikat i może spróbować ponownie.
    if (error) return { ok: false, error: error.message };
    cleaned++;
  }

  const { error } = await supabase.from("fabric_property_defs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateFabricPropertyDefsCache();
  invalidateFabricsCache();
  revalidatePath("/admin/tkaniny");
  revalidatePath("/tkaniny");
  return {
    ok: true,
    message: `Cecha usunięta — odpięta od ${cleaned} tkanin(y)`,
  };
}
