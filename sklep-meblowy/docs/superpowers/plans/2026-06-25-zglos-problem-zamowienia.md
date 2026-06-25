# Zgłoś problem z zamówieniem (reklamacje) — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zalogowany klient może na stronie zamówienia zgłosić problem (kategoria + opis + 1–5 zdjęć, opcjonalnie konkretna pozycja); zgłoszenia trafiają do tabeli `order_issues` i panelu `/admin/reklamacje`.

**Architecture:** Nowa tabela `order_issues` (podpięta pod `orders`/`order_items`). Czyste helpery (walidacja, etykiety kategorii/pozycji) w `app/_lib/order-issues.ts` (testowalne, bez server-only). Server-owa warstwa danych w `app/_lib/order-issues-data.ts`. Akcje klienckie (`uploadIssuePhoto`, `submitOrderIssue`) w `app/konto/zamowienia/actions.ts` — wzorzec ownership jak `cancelOrder`. Modal kliencki `OrderIssueModal` (wzorzec `InquiryModal`) na `/konto/zamowienia/[id]`. Panel `/admin/reklamacje` wzorowany na `/admin/zapytania`.

**Tech Stack:** Next.js 16.2.4 (App Router), React 19.2.4, TypeScript 5, Supabase (`@supabase/supabase-js`), vitest 4, `browser-image-compression`.

## Global Constraints

- Wszystkie `npm`/`npx` z katalogu `sklep-meblowy/`. Testy: `npx vitest run <ścieżka>`; pełny `npm test`. Bramki przed commitem domykającym task z kodem: `npx tsc --noEmit` 0, `npm run lint` 0, odpowiednie testy zielone (+ `npm run build` dla tasków UI/route).
- UI storefront PL+DE (słownik `t.orderIssue.*`, wzorzec `t.inquiry.*`); panel admina PL.
- Migracje idempotentne (`if not exists`); człowiek odpala ręcznie w Supabase PO wdrożeniu. Następny numer = **38** (DB na 37).
- Kategorie (klucz w DB): `damage`, `missing`, `wrong`, `delivery`, `other`. Statusy: `new`, `read`, `replied`, `closed`.
- Dostępność przycisku: tylko statusy `paid`, `processing`, `shipped`, `delivered`. Tylko zalogowani.
- Zdjęcia: bucket `products` (istniejący, public) z prefiksem `order-issues/`; max 5; walidacja przez `validateImageUpload`.
- Bez maili do klienta. Insert/odczyt `order_issues` wyłącznie server-side (service role); brak polityki anon.
- Czyste funkcje NIE importują modułów server-only (`supabase/server` ciągnie `next/headers`). Pure w `order-issues.ts`; IO w `order-issues-data.ts` i akcjach.
- **OPS:** jedyna instancja Supabase = produkcyjna; `next dev` pisze do prod. NIE uruchamiać ręcznych testów mutujących na żywej bazie podczas implementacji.
- Praca na branchu `feat/zglos-problem-zamowienia` (utworzony, zawiera spec).

---

### Task 1: Migracja 38 + typy/stałe + czyste helpery (TDD)

**Files:**
- Create: `supabase/migrations/38_order_issues.sql`
- Create: `app/_lib/order-issues.ts`
- Test: `app/_lib/__tests__/order-issues.test.ts`

**Interfaces:**
- Consumes: `formatVariantLabel` z `@/app/_lib/variants`.
- Produces:
  - typy `OrderIssueStatus`, `OrderIssueCategory`, `OrderIssue`, `OrderIssueInput`, `OrderIssueValidation`
  - `ORDER_ISSUE_CATEGORIES: OrderIssueCategory[]`
  - `orderIssueCategoryLabel(category: string, locale: "pl" | "de"): string`
  - `orderItemLabel(productName: string, variantValues: Record<string,string> | null, locale: "pl" | "de"): string`
  - `validateOrderIssueInput(input: OrderIssueInput): OrderIssueValidation`

- [ ] **Step 1: Utwórz migrację**

`supabase/migrations/38_order_issues.sql`:
```sql
-- Migracja 38: zgłoszenia problemów z zamówieniem (reklamacje). Podpięte pod
-- orders (CASCADE) i opcjonalnie konkretną pozycję order_items (SET NULL).
create table if not exists public.order_issues (
  id             uuid primary key default uuid_generate_v4(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  order_item_id  uuid references public.order_items(id) on delete set null,
  category       text not null check (category in ('damage','missing','wrong','delivery','other')),
  message        text not null,
  photos         text[] not null default '{}',
  status         text not null default 'new' check (status in ('new','read','replied','closed')),
  customer_name  text,
  customer_email text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists order_issues_status_idx on public.order_issues (status, created_at desc);
create index if not exists order_issues_order_idx  on public.order_issues (order_id);

-- RLS: czytane/zapisywane wyłącznie server-side (service role omija RLS — wzorzec
-- jak fabrics/price_history). Brak polityki anon → żaden klient nie pisze wprost.
alter table public.order_issues enable row level security;
create policy "order_issues: admin all"
  on public.order_issues for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
```

- [ ] **Step 2: Napisz failing test**

`app/_lib/__tests__/order-issues.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  ORDER_ISSUE_CATEGORIES,
  orderIssueCategoryLabel,
  orderItemLabel,
  validateOrderIssueInput,
} from "../order-issues";

describe("orderIssueCategoryLabel", () => {
  it("zwraca etykietę PL/DE dla znanej kategorii", () => {
    expect(orderIssueCategoryLabel("damage", "pl")).toBe("Uszkodzenie / wada");
    expect(orderIssueCategoryLabel("damage", "de")).toBe("Beschädigung / Mangel");
  });
  it("nieznana kategoria → zwraca wejście bez zmian", () => {
    expect(orderIssueCategoryLabel("xxx", "pl")).toBe("xxx");
  });
  it("ma dokładnie 5 kategorii", () => {
    expect(ORDER_ISSUE_CATEGORIES).toEqual(["damage", "missing", "wrong", "delivery", "other"]);
  });
});

describe("orderItemLabel", () => {
  it("sama nazwa gdy brak wariantów", () => {
    expect(orderItemLabel("Sofa LUNA", null, "pl")).toBe("Sofa LUNA");
    expect(orderItemLabel("Sofa LUNA", {}, "pl")).toBe("Sofa LUNA");
  });
  it("nazwa + wariant gdy są wartości", () => {
    expect(orderItemLabel("Sofa LUNA", { Strona: "Lewa" }, "pl")).toBe("Sofa LUNA — Strona: Lewa");
  });
});

describe("validateOrderIssueInput", () => {
  it("odrzuca nieznaną kategorię", () => {
    expect(validateOrderIssueInput({ category: "x", message: "zepsute", photos: [], orderItemId: null }))
      .toEqual({ ok: false, error: "category" });
  });
  it("odrzuca za krótki opis", () => {
    expect(validateOrderIssueInput({ category: "damage", message: "hi", photos: [], orderItemId: null }))
      .toEqual({ ok: false, error: "message" });
  });
  it("odrzuca > 5 zdjęć", () => {
    const photos = ["a", "b", "c", "d", "e", "f"];
    expect(validateOrderIssueInput({ category: "damage", message: "zepsute", photos, orderItemId: null }))
      .toEqual({ ok: false, error: "photos" });
  });
  it("przyjmuje poprawne i trimuje/normalizuje", () => {
    const res = validateOrderIssueInput({ category: "damage", message: "  zepsute rogi  ", photos: ["u1"], orderItemId: "" });
    expect(res).toEqual({ ok: true, value: { category: "damage", message: "zepsute rogi", photos: ["u1"], orderItemId: null } });
  });
});
```

- [ ] **Step 3: Uruchom test — FAIL**

Run: `npx vitest run app/_lib/__tests__/order-issues.test.ts`
Expected: FAIL — moduł `../order-issues` nie istnieje.

- [ ] **Step 4: Utwórz `app/_lib/order-issues.ts`**

```ts
// Czysta logika reklamacji (order_issues) — bez zależności server-only, testowalne.
// Server-owa warstwa danych jest w order-issues-data.ts; akcje w konto/zamowienia/actions.ts.
import { formatVariantLabel } from "./variants";

export type OrderIssueStatus = "new" | "read" | "replied" | "closed";
export type OrderIssueCategory = "damage" | "missing" | "wrong" | "delivery" | "other";

export const ORDER_ISSUE_CATEGORIES: OrderIssueCategory[] = [
  "damage",
  "missing",
  "wrong",
  "delivery",
  "other",
];

export type OrderIssue = {
  id: string;
  order_id: string;
  order_item_id: string | null;
  category: OrderIssueCategory;
  message: string;
  photos: string[];
  status: OrderIssueStatus;
  customer_name: string | null;
  customer_email: string;
  created_at: string;
  updated_at: string;
};

const CATEGORY_LABELS: Record<OrderIssueCategory, { pl: string; de: string }> = {
  damage: { pl: "Uszkodzenie / wada", de: "Beschädigung / Mangel" },
  missing: { pl: "Brak elementu", de: "Fehlendes Teil" },
  wrong: { pl: "Otrzymano zły produkt", de: "Falsches Produkt erhalten" },
  delivery: { pl: "Problem z dostawą", de: "Lieferproblem" },
  other: { pl: "Inne", de: "Sonstiges" },
};

// Etykieta kategorii wg locale; nieznana wartość przechodzi bez zmian.
export function orderIssueCategoryLabel(category: string, locale: "pl" | "de"): string {
  const c = CATEGORY_LABELS[category as OrderIssueCategory];
  return c ? c[locale] : category;
}

// Etykieta pozycji zamówienia do selecta w modalu (nazwa + ewentualny wariant).
export function orderItemLabel(
  productName: string,
  variantValues: Record<string, string> | null,
  locale: "pl" | "de"
): string {
  if (!variantValues || Object.keys(variantValues).length === 0) return productName;
  return `${productName} — ${formatVariantLabel(variantValues, locale)}`;
}

export type OrderIssueInput = {
  category: string;
  message: string;
  photos: string[];
  orderItemId: string | null;
};

export type OrderIssueValidation =
  | {
      ok: true;
      value: { category: OrderIssueCategory; message: string; photos: string[]; orderItemId: string | null };
    }
  | { ok: false; error: "category" | "message" | "photos" };

// Czysta walidacja payloadu zgłoszenia (używana przez submitOrderIssue + testy).
export function validateOrderIssueInput(input: OrderIssueInput): OrderIssueValidation {
  if (!ORDER_ISSUE_CATEGORIES.includes(input.category as OrderIssueCategory)) {
    return { ok: false, error: "category" };
  }
  const message = (input.message ?? "").trim();
  if (message.length < 5) return { ok: false, error: "message" };
  if (!Array.isArray(input.photos) || input.photos.length > 5) return { ok: false, error: "photos" };
  if (input.photos.some((p) => typeof p !== "string" || !p)) return { ok: false, error: "photos" };
  return {
    ok: true,
    value: {
      category: input.category as OrderIssueCategory,
      message: message.slice(0, 2000),
      photos: input.photos,
      orderItemId: input.orderItemId || null,
    },
  };
}
```

- [ ] **Step 5: Uruchom test — PASS**

Run: `npx vitest run app/_lib/__tests__/order-issues.test.ts`
Expected: PASS (wszystkie bloki).

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add supabase/migrations/38_order_issues.sql app/_lib/order-issues.ts app/_lib/__tests__/order-issues.test.ts
git commit -m "feat(reklamacje): migracja 38 order_issues + czyste helpery (walidacja, etykiety)"
```

---

### Task 2: Warstwa danych `order-issues-data.ts` (server)

**Files:**
- Create: `app/_lib/order-issues-data.ts`

**Interfaces:**
- Consumes: `createAdminClient`, typy z `order-issues.ts`.
- Produces:
  - `type AdminOrderIssue = OrderIssue & { order_number: number | null; order_status: string | null; item_name: string | null }`
  - `getAllOrderIssues(): Promise<AdminOrderIssue[]>`
  - `getNewOrderIssuesCount(): Promise<number>`

- [ ] **Step 1: Utwórz `app/_lib/order-issues-data.ts`**

```ts
// Server-owa warstwa danych order_issues (panel admina). Czyste helpery w order-issues.ts.
import { createAdminClient } from "./supabase/server";
import type { OrderIssue } from "./order-issues";

export type AdminOrderIssue = OrderIssue & {
  order_number: number | null;
  order_status: string | null;
  item_name: string | null;
};

type Row = OrderIssue & {
  order: { order_number: number | null; status: string | null } | null;
  item: { product: { name: string } | null } | null;
};

// Lista wszystkich zgłoszeń, najnowsze pierwsze, z kontekstem zamówienia + nazwą pozycji.
export async function getAllOrderIssues(): Promise<AdminOrderIssue[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("order_issues")
    .select(
      `*, order:orders(order_number, status), item:order_items(product:products(name))`
    )
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    order_id: r.order_id,
    order_item_id: r.order_item_id,
    category: r.category,
    message: r.message,
    photos: r.photos ?? [],
    status: r.status,
    customer_name: r.customer_name,
    customer_email: r.customer_email,
    created_at: r.created_at,
    updated_at: r.updated_at,
    order_number: r.order?.order_number ?? null,
    order_status: r.order?.status ?? null,
    item_name: r.item?.product?.name ?? null,
  }));
}

// Liczba nowych zgłoszeń (badge w nawigacji admina).
export async function getNewOrderIssuesCount(): Promise<number> {
  const supabase = await createAdminClient();
  const { count } = await supabase
    .from("order_issues")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  return count ?? 0;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 błędów.

- [ ] **Step 3: Commit**

```bash
git add app/_lib/order-issues-data.ts
git commit -m "feat(reklamacje): warstwa danych getAllOrderIssues/getNewOrderIssuesCount"
```

---

### Task 3: Akcje klienckie — `uploadIssuePhoto` + `submitOrderIssue`

**Files:**
- Modify: `app/konto/zamowienia/actions.ts` (dopisać na końcu)

**Interfaces:**
- Consumes: `createClient`/`createAdminClient`, `getLocale`, `validateImageUpload`, `validateOrderIssueInput`.
- Produces:
  - `uploadIssuePhoto(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }>`
  - `submitOrderIssue(formData: FormData): Promise<{ ok: true; message: string } | { ok: false; error: string }>`

- [ ] **Step 1: Dopisz importy w `app/konto/zamowienia/actions.ts`**

Na górze pliku dodaj (obok istniejących importów):
```ts
import { randomUUID } from "node:crypto";
import { validateImageUpload } from "@/app/_lib/image-upload";
import { validateOrderIssueInput } from "@/app/_lib/order-issues";
```

- [ ] **Step 2: Dopisz akcje na końcu `app/konto/zamowienia/actions.ts`**

```ts
// ============================================================
// uploadIssuePhoto — upload zdjęcia do zgłoszenia (gated na zalogowanego usera)
// ============================================================
// Istniejący uploadProductImage wymaga requireAdmin; tu wystarczy zalogowany
// klient. Upload idzie service-rolem do bucketa "products" pod prefiksem
// order-issues/. Walidacja pliku przez wspólny validateImageUpload (bez SVG).
export type UploadIssuePhotoResult = { ok: true; url: string } | { ok: false; error: string };

export async function uploadIssuePhoto(formData: FormData): Promise<UploadIssuePhotoResult> {
  const de = (await getLocale()) === "de";
  const tr = (pl: string, deTxt: string) => (de ? deTxt : pl);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: tr("Musisz być zalogowany", "Sie müssen angemeldet sein") };

  const valid = validateImageUpload(formData.get("photo"));
  if (!valid.ok) return { ok: false, error: valid.error };

  const path = `order-issues/${Date.now()}-${randomUUID()}.${valid.ext}`;
  const admin = await createAdminClient();
  const { error } = await admin.storage
    .from("products")
    .upload(path, valid.file, { contentType: valid.contentType, cacheControl: "3600", upsert: false });
  if (error) return { ok: false, error: tr("Upload nieudany — spróbuj ponownie", "Upload fehlgeschlagen — bitte erneut versuchen") };

  const {
    data: { publicUrl },
  } = admin.storage.from("products").getPublicUrl(path);
  return { ok: true, url: publicUrl };
}

// ============================================================
// submitOrderIssue — zgłoszenie problemu z zamówieniem
// ============================================================
// Ownership jak cancelOrder: ładujemy WŁASNE zamówienie (filtr user_id z sesji).
// Insert service-rolem. Walidacja payloadu czystą validateOrderIssueInput.
export type SubmitOrderIssueResult = { ok: true; message: string } | { ok: false; error: string };

export async function submitOrderIssue(formData: FormData): Promise<SubmitOrderIssueResult> {
  const de = (await getLocale()) === "de";
  const tr = (pl: string, deTxt: string) => (de ? deTxt : pl);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: tr("Musisz być zalogowany", "Sie müssen angemeldet sein") };

  const orderId = String(formData.get("order_id") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const message = String(formData.get("message") ?? "");
  const orderItemId = String(formData.get("order_item_id") ?? "").trim() || null;
  let photos: string[] = [];
  try {
    const raw = formData.get("photos");
    const parsed = raw ? JSON.parse(String(raw)) : [];
    if (Array.isArray(parsed)) photos = parsed.filter((p) => typeof p === "string");
  } catch {
    photos = [];
  }

  const v = validateOrderIssueInput({ category, message, photos, orderItemId });
  if (!v.ok) {
    const msg =
      v.error === "category"
        ? tr("Wybierz kategorię problemu", "Bitte wählen Sie eine Problemkategorie")
        : v.error === "message"
          ? tr("Opis jest za krótki (min 5 znaków)", "Die Beschreibung ist zu kurz (mind. 5 Zeichen)")
          : tr("Maksymalnie 5 zdjęć", "Maximal 5 Fotos");
    return { ok: false, error: msg };
  }

  const admin = await createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, user_id, status")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();
  if (!order) {
    return { ok: false, error: tr("Zamówienie nie istnieje lub nie należy do Ciebie", "Bestellung existiert nicht oder gehört nicht Ihnen") };
  }
  const allowed = ["paid", "processing", "shipped", "delivered"];
  if (!allowed.includes((order as { status: string }).status)) {
    return { ok: false, error: tr("Dla tego zamówienia nie można zgłosić problemu", "Für diese Bestellung kann kein Problem gemeldet werden") };
  }

  if (v.value.orderItemId) {
    const { data: item } = await admin
      .from("order_items")
      .select("id")
      .eq("id", v.value.orderItemId)
      .eq("order_id", orderId)
      .single();
    if (!item) return { ok: false, error: tr("Nieprawidłowa pozycja zamówienia", "Ungültige Bestellposition") };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await admin.from("order_issues").insert({
    order_id: orderId,
    order_item_id: v.value.orderItemId,
    category: v.value.category,
    message: v.value.message,
    photos: v.value.photos,
    customer_email: user.email ?? "",
    customer_name: (profile as { full_name: string | null } | null)?.full_name ?? null,
  } as never);
  if (error) {
    return { ok: false, error: tr("Nie udało się wysłać zgłoszenia — spróbuj później", "Die Meldung konnte nicht gesendet werden — bitte später erneut versuchen") };
  }

  revalidatePath(`/konto/zamowienia/${orderId}`);
  return {
    ok: true,
    message: tr(
      "Dziękujemy — zajmiemy się zgłoszeniem i skontaktujemy się z Tobą.",
      "Vielen Dank — wir kümmern uns um Ihre Meldung und melden uns bei Ihnen."
    ),
  };
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 błędów.

- [ ] **Step 4: Commit**

```bash
git add app/konto/zamowienia/actions.ts
git commit -m "feat(reklamacje): akcje uploadIssuePhoto + submitOrderIssue (ownership + walidacja)"
```

---

### Task 4: Słownik `t.orderIssue` + wyniesienie `compressIfNeeded`

**Files:**
- Create: `app/_lib/image-compress.ts`
- Modify: `app/admin/produkty/[id]/_shared.tsx` (usuń lokalne `compressIfNeeded`, re-eksportuj z `_lib`)
- Modify: `app/_lib/dictionaries/pl.ts` (typ `PlShape` + obiekt `pl`)
- Modify: `app/_lib/dictionaries/de.ts` (obiekt `de`)

**Interfaces:**
- Produces: `compressIfNeeded(file: File): Promise<File>` (z `@/app/_lib/image-compress`); `t.orderIssue.*` w słowniku.

- [ ] **Step 1: Wynieś `compressIfNeeded` do `app/_lib/image-compress.ts`**

```ts
// Kompresja zdjęcia jeśli >800 KB (web worker, nie blokuje UI). Fallback: oryginał.
// Wspólne dla edytorów admina (VariantsEditor/ProductEditor) i modala reklamacji.
export async function compressIfNeeded(file: File): Promise<File> {
  if (file.size < 800 * 1024) return file;
  try {
    const imageCompression = (await import("browser-image-compression")).default;
    return await imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 2400,
      useWebWorker: true,
      fileType: file.type === "image/png" ? "image/jpeg" : file.type,
      initialQuality: 0.82,
    });
  } catch (err) {
    console.error("Kompresja nieudana:", err);
    return file;
  }
}
```

- [ ] **Step 2: W `app/admin/produkty/[id]/_shared.tsx` zastąp lokalną definicję re-eksportem**

Usuń całą funkcję `export async function compressIfNeeded(...) {...}` (linie ~63-81, wraz z komentarzem) i dodaj na górze pliku (pod `"use client";`):
```ts
export { compressIfNeeded } from "@/app/_lib/image-compress";
```
(Istniejące importy `compressIfNeeded` z `./_shared` w VariantsEditor/ProductEditor działają bez zmian — re-eksport zachowuje API.)

- [ ] **Step 3: Dodaj typ `orderIssue` w `PlShape` (`pl.ts`)**

W `app/_lib/dictionaries/pl.ts`, w typie `PlShape`, bezpośrednio po bloku `inquiry: { ... };` (kończy się ~linia 243) dodaj:
```ts
  orderIssue: {
    triggerButton: string;
    dialogAria: string;
    eyebrow: string;
    heading: string;
    categoryLabel: string;
    itemLabel: string;
    wholeOrder: string;
    messageLabel: string;
    messageHint: string;
    messagePlaceholder: string;
    photosLabel: string;
    photosHint: string;
    addPhoto: string;
    uploading: string;
    sentTitle: string;
    submit: string;
    submitting: string;
    cancel: string;
    privacyNote: string;
  };
```

- [ ] **Step 4: Dodaj wartości PL w obiekcie `pl` (`pl.ts`)**

W obiekcie `export const pl`, po bloku `inquiry: { ... },` (kończy się ~linia 508) dodaj:
```ts
  orderIssue: {
    triggerButton: "Zgłoś problem",
    dialogAria: "Zgłoszenie problemu z zamówieniem",
    eyebrow: "Reklamacja",
    heading: "Zgłoś problem z zamówieniem",
    categoryLabel: "Czego dotyczy problem?",
    itemLabel: "Której pozycji dotyczy?",
    wholeOrder: "Całe zamówienie",
    messageLabel: "Opis problemu",
    messageHint: "Opisz krótko co się stało.",
    messagePlaceholder: "Narożnik dotarł z uszkodzonym rogiem — załączam zdjęcia.",
    photosLabel: "Zdjęcia (opcjonalnie, max 5)",
    photosHint: "Zdjęcie uszkodzenia bardzo przyspiesza rozpatrzenie.",
    addPhoto: "+ Dodaj zdjęcie",
    uploading: "Wgrywam...",
    sentTitle: "Zgłoszenie wysłane ✓",
    submit: "Wyślij zgłoszenie",
    submitting: "Wysyłam...",
    cancel: "Anuluj",
    privacyNote: "Twoje dane i zdjęcia wykorzystamy wyłącznie do rozpatrzenia tego zgłoszenia.",
  },
```

- [ ] **Step 5: Dodaj wartości DE w obiekcie `de` (`de.ts`)**

W `app/_lib/dictionaries/de.ts`, po bloku `inquiry: { ... },` (kończy się ~linia 256) dodaj:
```ts
  orderIssue: {
    triggerButton: "Problem melden",
    dialogAria: "Problem mit der Bestellung melden",
    eyebrow: "Reklamation",
    heading: "Problem mit der Bestellung melden",
    categoryLabel: "Worum geht es?",
    itemLabel: "Welche Position betrifft es?",
    wholeOrder: "Gesamte Bestellung",
    messageLabel: "Problembeschreibung",
    messageHint: "Beschreiben Sie kurz, was passiert ist.",
    messagePlaceholder: "Das Ecksofa kam mit einer beschädigten Ecke an — Fotos im Anhang.",
    photosLabel: "Fotos (optional, max. 5)",
    photosHint: "Ein Foto des Schadens beschleunigt die Bearbeitung erheblich.",
    addPhoto: "+ Foto hinzufügen",
    uploading: "Wird hochgeladen...",
    sentTitle: "Meldung gesendet ✓",
    submit: "Meldung senden",
    submitting: "Wird gesendet...",
    cancel: "Abbrechen",
    privacyNote: "Ihre Daten und Fotos verwenden wir ausschließlich zur Bearbeitung dieser Meldung.",
  },
```

- [ ] **Step 6: Bramki**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 0 błędów tsc/lint; testy zielone (de.ts zgodne z `PlShape` — brak brakujących kluczy).

- [ ] **Step 7: Commit**

```bash
git add app/_lib/image-compress.ts app/admin/produkty/[id]/_shared.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts
git commit -m "feat(reklamacje): slownik t.orderIssue + wyniesienie compressIfNeeded do _lib"
```

---

### Task 5: `OrderIssueModal` + wpięcie w stronę zamówienia

**Files:**
- Create: `app/_components/ui/OrderIssueModal.tsx`
- Modify: `app/konto/zamowienia/[id]/page.tsx`

**Interfaces:**
- Consumes: `submitOrderIssue`/`uploadIssuePhoto` (Task 3), `compressIfNeeded` (Task 4), `ORDER_ISSUE_CATEGORIES`/`orderIssueCategoryLabel`/`orderItemLabel` (Task 1), `t.orderIssue.*` (Task 4), `useModal`, `useClientLocale`, `getDictionary`.
- Produces: `OrderIssueModal` (default export) z props `{ orderId: string; items: { id: string; label: string }[] }`.

- [ ] **Step 1: Utwórz `app/_components/ui/OrderIssueModal.tsx`**

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { submitOrderIssue, uploadIssuePhoto } from "@/app/konto/zamowienia/actions";
import { compressIfNeeded } from "@/app/_lib/image-compress";
import {
  ORDER_ISSUE_CATEGORIES,
  orderIssueCategoryLabel,
} from "@/app/_lib/order-issues";
import { useModal } from "@/app/_lib/useModal";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";

// Modal "Zgłoś problem z zamówieniem" — przycisk + formularz (kategoria, pozycja,
// opis, 1-5 zdjęć). Wzorzec jak InquiryModal. Wysyła przez submitOrderIssue.
export default function OrderIssueModal({
  orderId,
  items,
}: {
  orderId: string;
  items: { id: string; label: string }[];
}) {
  const locale = useClientLocale();
  const t = getDictionary(locale);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [result, setResult] = useState<
    { ok: true; message: string } | { ok: false; error: string } | null
  >(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setTimeout(() => {
      setResult(null);
      setPhotos([]);
    }, 200);
  }
  useModal(open, { onClose: close, containerRef: dialogRef, trapFocus: true });

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (photos.length >= 5) return;
    setUploading(true);
    try {
      const toSend = await compressIfNeeded(file);
      const fd = new FormData();
      fd.set("photo", toSend, toSend.name);
      const res = await uploadIssuePhoto(fd);
      if (res.ok) setPhotos((prev) => [...prev, res.url]);
      else setResult({ ok: false, error: res.error });
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-3 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
      >
        {t.orderIssue.triggerButton}
      </button>

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={t.orderIssue.dialogAria}
          onClick={close}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col gap-5 p-6 my-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-1">
                  {t.orderIssue.eyebrow}
                </p>
                <h2 className="font-display text-2xl font-bold text-[var(--fg)] leading-tight">
                  {t.orderIssue.heading}
                </h2>
              </div>
              <button
                onClick={close}
                aria-label={t.common.close}
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {result?.ok ? (
              <div className="p-5 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-xl">
                <p className="text-sm text-emerald-800 dark:text-emerald-200 font-semibold mb-1">
                  {t.orderIssue.sentTitle}
                </p>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">{result.message}</p>
                <button
                  onClick={close}
                  className="mt-4 px-5 py-2 text-xs font-sans uppercase tracking-widest border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors"
                >
                  {t.common.close}
                </button>
              </div>
            ) : (
              <form
                action={(fd) => {
                  fd.set("photos", JSON.stringify(photos));
                  startTransition(async () => setResult(await submitOrderIssue(fd)));
                }}
                className="flex flex-col gap-4"
              >
                <input type="hidden" name="order_id" value={orderId} />

                <Field label={t.orderIssue.categoryLabel} required>
                  <select name="category" required defaultValue="" className={inputCls}>
                    <option value="" disabled>
                      —
                    </option>
                    {ORDER_ISSUE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {orderIssueCategoryLabel(cat, locale)}
                      </option>
                    ))}
                  </select>
                </Field>

                {items.length > 0 && (
                  <Field label={t.orderIssue.itemLabel}>
                    <select name="order_item_id" defaultValue="" className={inputCls}>
                      <option value="">{t.orderIssue.wholeOrder}</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                <Field label={t.orderIssue.messageLabel} required hint={t.orderIssue.messageHint}>
                  <textarea
                    name="message"
                    required
                    minLength={5}
                    maxLength={2000}
                    rows={4}
                    placeholder={t.orderIssue.messagePlaceholder}
                    className={`${inputCls} resize-y`}
                  />
                </Field>

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
                    {t.orderIssue.photosLabel}
                  </span>
                  {photos.length > 0 && (
                    <ul className="grid grid-cols-4 gap-2">
                      {photos.map((url, i) => (
                        <li key={url} className="relative aspect-square rounded-lg overflow-hidden border border-[var(--border)]">
                          <Image src={url} alt={`Zdjęcie ${i + 1}`} fill sizes="100px" className="object-cover" />
                          <button
                            type="button"
                            onClick={() => setPhotos((prev) => prev.filter((u) => u !== url))}
                            aria-label="Usuń zdjęcie"
                            className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white text-xs"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {photos.length < 5 && (
                    <label className="self-start px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors cursor-pointer">
                      {uploading ? t.orderIssue.uploading : t.orderIssue.addPhoto}
                      <input type="file" accept="image/*" disabled={uploading} onChange={onPickPhoto} className="hidden" />
                    </label>
                  )}
                  <span className="text-[11px] text-[var(--muted)]">{t.orderIssue.photosHint}</span>
                </div>

                {result && !result.ok && (
                  <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={pending || uploading}
                    className="flex-1 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
                  >
                    {pending ? t.orderIssue.submitting : t.orderIssue.submit}
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    disabled={pending}
                    className="px-5 py-3 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
                  >
                    {t.orderIssue.cancel}
                  </button>
                </div>

                <p className="text-xs text-[var(--muted)] leading-snug">{t.orderIssue.privacyNote}</p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const inputCls =
  "w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-[var(--muted)]">{hint}</span>}
    </label>
  );
}
```

- [ ] **Step 2: Wepnij sekcję w `app/konto/zamowienia/[id]/page.tsx`**

Dodaj import (obok innych komponentów ui):
```ts
import OrderIssueModal from "@/app/_components/ui/OrderIssueModal";
import { orderItemLabel } from "@/app/_lib/order-issues";
```
Po linii `const delivery = deliveryView(order);` (ok. linia 115) dodaj:
```ts
  const canReportIssue = ["paid", "processing", "shipped", "delivered"].includes(order.status);
  const issueItems = (order.items ?? []).map((it) => ({
    id: it.id,
    label: orderItemLabel(
      (it.product ? localizeProduct(it.product, locale) : null)?.name ?? c.product,
      it.variant_values ?? null,
      locale
    ),
  }));
```
Następnie w JSX, PRZED zamykającym `</div>` całej strony (po sekcji „likedTitle"/ReorderButton, ok. linia 313), dodaj:
```tsx
      {canReportIssue && (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
          <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-1">
            {c.issueHeading}
          </h3>
          <p className="text-sm text-[var(--muted)] mb-5">{c.issueDesc}</p>
          <OrderIssueModal orderId={order.id} items={issueItems} />
        </div>
      )}
```
Oraz dodaj do obu obiektów `c` (DE i PL) pola nagłówka karty — w gałęzi DE:
```ts
        issueHeading: "Stimmt etwas mit der Bestellung nicht?",
        issueDesc: "Melden Sie ein Problem — wir melden uns und helfen bei der Lösung.",
```
w gałęzi PL:
```ts
        issueHeading: "Coś nie tak z zamówieniem?",
        issueDesc: "Zgłoś problem — odezwiemy się i pomożemy go rozwiązać.",
```
(Nagłówek karty trzymamy w lokalnym `c` strony — spójnie z resztą tej strony, która całą treść ma w `c`. Modal i tak ma własne `t.orderIssue.*`.)

- [ ] **Step 3: Bramki + build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: 0 błędów; testy zielone; build przechodzi (trasa `/konto/zamowienia/[id]`).

- [ ] **Step 4: Commit**

```bash
git add app/_components/ui/OrderIssueModal.tsx app/konto/zamowienia/[id]/page.tsx
git commit -m "feat(reklamacje): OrderIssueModal + sekcja na stronie zamowienia"
```

---

### Task 6: Panel admina `/admin/reklamacje` + nawigacja

**Files:**
- Create: `app/admin/reklamacje/page.tsx`
- Create: `app/admin/reklamacje/ReklamacjeList.tsx`
- Create: `app/admin/reklamacje/actions.ts`
- Modify: `app/admin/layout.tsx`

**Interfaces:**
- Consumes: `getAllOrderIssues`/`getNewOrderIssuesCount` (Task 2), `AdminOrderIssue`, `orderIssueCategoryLabel` (Task 1), `requireAdmin`, `createAdminClient`.
- Produces: `setOrderIssueStatus`/`deleteOrderIssue` actions; strona `/admin/reklamacje`; nav link.

- [ ] **Step 1: Utwórz `app/admin/reklamacje/actions.ts`**

(wzorzec `app/admin/zapytania/actions.ts`)
```ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import type { OrderIssueStatus } from "@/app/_lib/order-issues";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const ALLOWED_STATUSES: OrderIssueStatus[] = ["new", "read", "replied", "closed"];

export async function setOrderIssueStatus(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as OrderIssueStatus;
  if (!id) return { ok: false, error: "Brak id" };
  if (!ALLOWED_STATUSES.includes(status)) return { ok: false, error: "Nieprawidłowy status" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("order_issues").update({ status } as never).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/reklamacje");
  return { ok: true, message: `Status zmieniony na "${status}"` };
}

export async function deleteOrderIssue(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Brak id" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("order_issues").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/reklamacje");
  return { ok: true, message: "Zgłoszenie usunięte" };
}
```

- [ ] **Step 2: Utwórz `app/admin/reklamacje/page.tsx`**

```tsx
import { requireAdmin } from "@/app/_lib/admin";
import { getAllOrderIssues } from "@/app/_lib/order-issues-data";
import ReklamacjeList from "./ReklamacjeList";

export const metadata = { title: "Reklamacje — Admin" };

export default async function AdminOrderIssuesPage() {
  await requireAdmin();
  const issues = await getAllOrderIssues();
  return <ReklamacjeList initialIssues={issues} />;
}
```

- [ ] **Step 3: Utwórz `app/admin/reklamacje/ReklamacjeList.tsx`**

(wzorzec `InquiriesList` + kategoria/pozycja/link do zamówienia/zdjęcia)
```tsx
"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { setOrderIssueStatus, deleteOrderIssue } from "./actions";
import type { AdminOrderIssue } from "@/app/_lib/order-issues-data";
import type { OrderIssueStatus } from "@/app/_lib/order-issues";
import { orderIssueCategoryLabel } from "@/app/_lib/order-issues";

const STATUS_LABELS: Record<OrderIssueStatus, string> = {
  new: "Nowe",
  read: "Przeczytane",
  replied: "Odpowiedziane",
  closed: "Zamknięte",
};
const STATUS_COLORS: Record<OrderIssueStatus, string> = {
  new: "bg-[var(--color-gold)] text-[var(--color-navy)]",
  read: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  replied: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  closed: "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
};

type Toast = { type: "success" | "error"; message: string } | null;

export default function ReklamacjeList({ initialIssues }: { initialIssues: AdminOrderIssue[] }) {
  const [issues, setIssues] = useState<AdminOrderIssue[]>(initialIssues);
  const [filter, setFilter] = useState<OrderIssueStatus | "all">("all");
  const [toast, setToast] = useState<Toast>(null);

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 3000);
  }

  const filtered = filter === "all" ? issues : issues.filter((i) => i.status === filter);
  const counts: Record<OrderIssueStatus | "all", number> = {
    all: issues.length,
    new: issues.filter((i) => i.status === "new").length,
    read: issues.filter((i) => i.status === "read").length,
    replied: issues.filter((i) => i.status === "replied").length,
    closed: issues.filter((i) => i.status === "closed").length,
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">Mollien</p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Reklamacje</h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
          Zgłoszenia problemów z zamówieniami wysłane przez klientów z poziomu konta. Zmień
          status po obsłudze, żeby śledzić co załatwione.
        </p>
      </div>

      {toast && (
        <div
          role="status"
          className={`fixed top-24 right-6 z-50 max-w-sm px-5 py-3 rounded-xl shadow-2xl text-sm ${
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "new", "read", "replied", "closed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 text-xs font-sans uppercase tracking-widest rounded-full border transition-colors ${
              filter === s
                ? "bg-[var(--color-navy)] text-white border-[var(--color-navy)]"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
            }`}
          >
            {s === "all" ? "Wszystkie" : STATUS_LABELS[s]} <span className="opacity-60">({counts[s]})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[var(--muted)] border border-dashed border-[var(--border)] rounded-2xl">
          <p className="font-display text-lg">Brak reklamacji w tym filtrze</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((issue) => (
            <Row
              key={issue.id}
              issue={issue}
              onChangeStatus={async (status) => {
                const fd = new FormData();
                fd.set("id", issue.id);
                fd.set("status", status);
                const res = await setOrderIssueStatus(fd);
                if (res.ok) {
                  showToast({ type: "success", message: res.message ?? "Zapisano" });
                  setIssues((prev) => prev.map((x) => (x.id === issue.id ? { ...x, status } : x)));
                } else showToast({ type: "error", message: res.error });
              }}
              onDelete={async () => {
                const fd = new FormData();
                fd.set("id", issue.id);
                const res = await deleteOrderIssue(fd);
                if (res.ok) {
                  showToast({ type: "success", message: res.message ?? "Usunięto" });
                  setIssues((prev) => prev.filter((x) => x.id !== issue.id));
                } else showToast({ type: "error", message: res.error });
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  issue,
  onChangeStatus,
  onDelete,
}: {
  issue: AdminOrderIssue;
  onChangeStatus: (s: OrderIssueStatus) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [pendingDelete, startDeleteTransition] = useTransition();
  const date = new Date(issue.created_at).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" });

  return (
    <li className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`px-2 py-0.5 text-[10px] font-sans font-bold uppercase tracking-widest rounded-full ${STATUS_COLORS[issue.status]}`}>
              {STATUS_LABELS[issue.status]}
            </span>
            <span className="px-2 py-0.5 text-[10px] font-sans font-bold uppercase tracking-widest rounded-full bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)]">
              {orderIssueCategoryLabel(issue.category, "pl")}
            </span>
            <span className="text-xs text-[var(--muted)]">{date}</span>
          </div>
          <p className="font-display text-base font-semibold text-[var(--fg)]">
            <Link href={`/admin/zamowienia/${issue.order_id}`} className="hover:text-[var(--color-gold)]">
              Zamówienie {issue.order_number ? `#${issue.order_number}` : issue.order_id.slice(0, 8).toUpperCase()}
            </Link>
            {issue.item_name && <span className="text-[var(--muted)] font-normal"> · {issue.item_name}</span>}
            {!issue.item_name && <span className="text-[var(--muted)] font-normal"> · całe zamówienie</span>}
          </p>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Od: <strong className="text-[var(--fg)]">{issue.customer_name || "(brak imienia)"}</strong> ·{" "}
            <a href={`mailto:${issue.customer_email}`} className="text-[var(--color-gold)] hover:underline">
              {issue.customer_email}
            </a>
          </p>
        </div>
      </div>

      <p className="text-sm text-[var(--fg)] whitespace-pre-wrap leading-relaxed bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3">
        {issue.message}
      </p>

      {issue.photos.length > 0 && (
        <ul className="grid grid-cols-5 gap-2">
          {issue.photos.map((url, i) => (
            <li key={url} className="relative aspect-square rounded-lg overflow-hidden border border-[var(--border)]">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <Image src={url} alt={`Zdjęcie ${i + 1}`} fill sizes="120px" className="object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={issue.status}
          onChange={(e) => startTransition(() => onChangeStatus(e.target.value as OrderIssueStatus))}
          disabled={pending}
          className="px-3 py-1.5 text-xs font-sans bg-[var(--bg)] border border-[var(--border)] rounded-full text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] cursor-pointer disabled:opacity-50"
        >
          <option value="new">Nowe</option>
          <option value="read">Przeczytane</option>
          <option value="replied">Odpowiedziane</option>
          <option value="closed">Zamknięte</option>
        </select>
        <a
          href={`mailto:${issue.customer_email}?subject=${encodeURIComponent("Re: reklamacja zamówienia")}`}
          className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
        >
          Odpowiedz emailem
        </a>
        <button
          onClick={() => {
            if (!window.confirm("Usunąć to zgłoszenie? Tej operacji nie da się cofnąć.")) return;
            startDeleteTransition(() => onDelete());
          }}
          disabled={pendingDelete}
          className="ml-auto px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
        >
          Usuń
        </button>
      </div>
    </li>
  );
}
```

- [ ] **Step 4: Link + licznik w nawigacji (`app/admin/layout.tsx`)**

`NAV_ITEMS` jest statyczne, a layout jest async server component. Dodaj dynamiczny licznik:
- Dodaj import:
```ts
import { getNewOrderIssuesCount } from "@/app/_lib/order-issues-data";
```
- W `NAV_ITEMS` po pozycji „Zapytania" dodaj:
```ts
  { href: "/admin/reklamacje", label: "Reklamacje", icon: ComplaintsIcon },
```
- W `AdminLayout`, po `const user = await requireAdmin();` dodaj:
```ts
  const newIssues = await getNewOrderIssuesCount();
```
- W renderze pozycji nawigacji (mapowanie `NAV_ITEMS`) dodaj badge tylko dla reklamacji. Zamień zawartość `<Link>`:
```tsx
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-6 py-3 text-sm font-sans text-[var(--fg)] hover:bg-[var(--bg)] hover:text-[var(--color-gold)] transition-colors"
            >
              <item.icon />
              <span className="flex-1">{item.label}</span>
              {item.href === "/admin/reklamacje" && newIssues > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[var(--color-gold)] text-[var(--color-navy)]">
                  {newIssues}
                </span>
              )}
            </Link>
```
- Dodaj komponent ikony (obok innych `*Icon`):
```tsx
function ComplaintsIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}
```

- [ ] **Step 5: Bramki + build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: 0 błędów; testy zielone; build przechodzi z trasą `/admin/reklamacje`.

- [ ] **Step 6: Commit**

```bash
git add app/admin/reklamacje/page.tsx app/admin/reklamacje/ReklamacjeList.tsx app/admin/reklamacje/actions.ts app/admin/layout.tsx
git commit -m "feat(reklamacje): panel /admin/reklamacje + link/licznik w nawigacji"
```

---

## Po wdrożeniu (poza planem kodu)

- Odpalić migrację `38_order_issues.sql` w Supabase (instancja produkcyjna).
- Bucket `products` już istnieje (public) — zdjęcia idą pod prefiks `order-issues/`; brak nowej konfiguracji.
- Push przez konto Woodecky10 (patrz pamięć `git-push-woodecky10`).
- Weryfikacja behawioralna: zalogowany klient na opłaconym zamówieniu → „Zgłoś problem" → kategoria+opis+zdjęcie → wysyłka; zgłoszenie widoczne w `/admin/reklamacje` z linkiem do zamówienia i miniaturami.

## Mapowanie wymagań spec → taski

- Tabela `order_issues` + RLS: Task 1.
- Czyste helpery (walidacja, etykiety): Task 1 (+ testy).
- Warstwa danych admina: Task 2.
- Upload zdjęć (gated) + submit z ownership + walidacją: Task 3.
- i18n `t.orderIssue` + współdzielona kompresja: Task 4.
- Modal klienta + sekcja na stronie zamówienia (gate na status, opcjonalna pozycja): Task 5.
- Panel `/admin/reklamacje` + status + zdjęcia + link do zamówienia + licznik: Task 6.
- Brak maili: w całości (żadna wysyłka). Bucket reuse: Task 3.
