# Menu edytowalne z panelu — linki własne — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pozycja menu może wskazywać albo podstronę CMS, albo trasę zaszytą w kodzie — dzięki czemu Tkaniny, O nas i Kontakt trafiają do headera i dają się przestawiać z `/admin/podstrony`.

**Architecture:** `menu_items` dostaje kolumnę `href` w relacji XOR z `page_id` (dokładnie jedno z dwóch niepuste). Czysty moduł `_lib/menu.ts` wylicza adres jako `href ?? '/' + page.slug`, więc `NavStrip` i `MobileMenu` nie zmieniają się wcale — renderują generyczne `{id, href, label}`, których dziś nikt im nie podaje. Panel dostaje przełącznik trybu w formularzu dodawania, z `<select>` karmionym rejestrem znanych tras zamiast wolnego pola na adres.

**Tech Stack:** Next.js (App Router, server actions), Supabase/Postgres (RLS + check constraints), vitest, Playwright, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-07-menu-linki-wlasne-design.md`

## Global Constraints

- **To NIE jest Next.js, który znasz.** Przed pisaniem kodu przeczytaj właściwy przewodnik w `node_modules/next/dist/docs/` (wymóg `AGENTS.md`).
- **`href` przyjmuje wyłącznie ścieżki wewnętrzne:** musi zaczynać się od `/`, nie może zaczynać się od `//`, nie może zawierać schematu. Powód: `LocalizedLink` dokleja prefiks `/de`, a wolne pole na `https://` w nawigacji to open redirect.
- **Etykieta linku własnego jest wymagana i niepusta** — nie ma tytułu strony, z którego dałoby się ją wziąć awaryjnie.
- **Komunikaty błędów po polsku** — widzi je administratorka w toaście (wzorzec `validatePageSlug`).
- **Linki zewnętrzne są poza zakresem.** Nie dodawaj obsługi `target`/`rel`.
- **Nie usuwaj kodu DE.** `label_de` wypełniamy mimo zamrożonego `/de`.
- **Playwright wyłącznie na buildzie** (`npm run build` + `npm start`), nigdy na `next dev` — dev pada po pierwszym teście.
- **Lokalny `npm run dev` czyta produkcyjną bazę Supabase.** Każda migracja i każdy zapis z panelu dotyka żywych danych.
- **Migracje nie aplikują się automatycznie** — po merge’u trzeba je puścić ręcznie przez MCP `apply_migration`.

## Kolejność i bezpieczeństwo produkcji

Migracja (Task 2) idzie **przed** kodem panelu, bo bez kolumny `href` nie da się przetestować niczego lokalnie. Jest to bezpieczne i warto wiedzieć dlaczego:

Wdrożony dziś na produkcji `prepareMenuItems` filtruje `r.page !== null && r.page.published`. Zasiane wiersze mają `page_id = null`, więc join zwraca `page: null` i **stary kod odrzuca je w całości**. Trzy nowe pozycje są niewidoczne dla klientów aż do deployu Taska 1. Nie ma okna, w którym produkcja pokazuje połowicznie wdrożoną funkcję.

## Struktura plików

| Plik | Odpowiedzialność | Zadanie |
|---|---|---|
| `app/_lib/menu.ts` | czysta logika: typ wiersza, rejestr tras, walidacja `href`, `prepareMenuItems` | 1 |
| `app/_lib/__tests__/menu.test.ts` | testy powyższego | 1 |
| `supabase/migrations/71_menu_items_custom_links.sql` | schemat, RLS, zasiew trzech pozycji | 2 |
| `app/_lib/menu-server.ts` | `MENU_SELECT` musi pobierać nową kolumnę | 2 |
| `app/admin/podstrony/actions.ts` | `addMenuItem` (tryb linku), `updateMenuItemLabel` (walidacja etykiety) | 3 |
| `app/admin/podstrony/MenuCard.tsx` | przełącznik trybu, podgląd `href`, plakietka szkicu | 4 |

`NavStrip.tsx`, `MobileMenu.tsx`, `Navbar.tsx`, `Footer.tsx` — **nie tykamy**.

---

### Task 1: Czysta logika menu — rejestr tras, walidacja, wyliczanie adresu

**Files:**
- Modify: `app/_lib/menu.ts`
- Test: `app/_lib/__tests__/menu.test.ts`

**Interfaces:**
- Consumes: `RESERVED_SLUGS` z `app/_lib/pages.ts:11` (tylko w teście niezmiennika).
- Produces:
  - `type MenuItemRow` — `page_id: string | null`, nowe pole `href: string | null`
  - `MENU_ROUTES: readonly { href: string; label: string }[]`
  - `MENU_HREF_MAX: number`
  - `validateMenuHref(href: string): { ok: true } | { ok: false; error: string }`
  - `prepareMenuItems(rows, location, locale)` — sygnatura bez zmian, zmienia się zachowanie

- [ ] **Step 1: Rozszerz fabrykę w istniejącym teście o nowe pole**

W `app/_lib/__tests__/menu.test.ts` dopisz `href: null` do fabryki `row` (linia ~9), między `page_id` a `label`:

```ts
const row = (over: Partial<MenuItemRow>): MenuItemRow => ({
  id: "i1",
  location: "navbar",
  page_id: "p1",
  href: null,
  label: null,
  label_de: null,
  sort_order: 0,
  visible: true,
  page: { slug: "pielegnacja", title: "Pielęgnacja", title_de: null, published: true },
  ...over,
});
```

- [ ] **Step 2: Dopisz testy linków własnych**

Na końcu `describe("prepareMenuItems", …)` dodaj:

```ts
  it("link własny: renderuje swój href i etykietę, mimo page = null", () => {
    const rows = [row({ id: "tkaniny", page_id: null, href: "/tkaniny", label: "Tkaniny", page: null })];
    expect(prepareMenuItems(rows, "navbar", "pl")).toEqual([
      { id: "tkaniny", href: "/tkaniny", label: "Tkaniny" },
    ]);
  });
  it("link własny: etykieta DE z fallbackiem na PL", () => {
    const rows = [
      row({ id: "a", page_id: null, href: "/o-nas", label: "O nas", label_de: "Über uns", page: null }),
      row({ id: "b", sort_order: 1, page_id: null, href: "/kontakt", label: "Kontakt", page: null }),
    ];
    expect(prepareMenuItems(rows, "navbar", "de").map((i) => i.label)).toEqual(["Über uns", "Kontakt"]);
  });
  it("link własny bez etykiety wypada (baza tego broni, kod nie ufa)", () => {
    const rows = [row({ id: "pusty", page_id: null, href: "/tkaniny", label: "   ", page: null })];
    expect(prepareMenuItems(rows, "navbar", "pl")).toEqual([]);
  });
  it("linki własne i podstrony mieszają się w jednej lokacji, po sort_order", () => {
    const rows = [
      row({ id: "link", sort_order: 1, page_id: null, href: "/tkaniny", label: "Tkaniny", page: null }),
      row({ id: "strona", sort_order: 0 }),
    ];
    expect(prepareMenuItems(rows, "navbar", "pl").map((i) => i.href)).toEqual([
      "/pielegnacja",
      "/tkaniny",
    ]);
  });
  it("link własny niewidoczny dalej wypada", () => {
    const rows = [row({ id: "x", visible: false, page_id: null, href: "/tkaniny", label: "T", page: null })];
    expect(prepareMenuItems(rows, "navbar", "pl")).toEqual([]);
  });
```

Dodaj też dwa nowe bloki `describe` (import `MENU_ROUTES`, `validateMenuHref`, `MENU_HREF_MAX` z `@/app/_lib/menu` i `RESERVED_SLUGS` z `@/app/_lib/pages`):

```ts
describe("MENU_ROUTES", () => {
  // Ten test jest powodem, dla którego rejestr w ogóle istnieje: literówka
  // w ścieżce ma się wywalić tutaj, a nie jako pozycja menu wiodąca w 404.
  it("każda trasa z rejestru jest prawdziwym segmentem top-level", () => {
    for (const r of MENU_ROUTES) {
      expect(r.href.startsWith("/")).toBe(true);
      expect(RESERVED_SLUGS.has(r.href.slice(1))).toBe(true);
    }
  });
  it("bez duplikatów i z niepustymi etykietami", () => {
    const hrefs = MENU_ROUTES.map((r) => r.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(MENU_ROUTES.every((r) => r.label.trim() !== "")).toBe(true);
  });
});

describe("validateMenuHref", () => {
  it("przepuszcza ścieżki wewnętrzne", () => {
    expect(validateMenuHref("/tkaniny").ok).toBe(true);
    expect(validateMenuHref("/o-nas").ok).toBe(true);
  });
  it("odrzuca pusty, za długi i bez wiodącego ukośnika", () => {
    expect(validateMenuHref("").ok).toBe(false);
    expect(validateMenuHref("/" + "a".repeat(MENU_HREF_MAX)).ok).toBe(false);
    expect(validateMenuHref("tkaniny").ok).toBe(false);
  });
  it("odrzuca wyjścia poza sklep", () => {
    expect(validateMenuHref("//evil.com").ok).toBe(false);
    expect(validateMenuHref("https://evil.com").ok).toBe(false);
    expect(validateMenuHref("/\\evil.com").ok).toBe(false);
    expect(validateMenuHref("javascript:alert(1)").ok).toBe(false);
  });
  it("komunikaty błędów są konkretne, nie ogólnikowe", () => {
    expect(validateMenuHref("")).toEqual({ ok: false, error: "Adres jest wymagany" });
    expect(validateMenuHref("https://evil.com")).toEqual({
      ok: false,
      error: "Adres musi zaczynać się od „/”",
    });
    expect(validateMenuHref("//evil.com")).toEqual({
      ok: false,
      error: "Adres nie może prowadzić poza sklep",
    });
  });
});
```

- [ ] **Step 3: Uruchom testy i potwierdź, że padają**

Run: `npm test -- menu`
Expected: FAIL — `MENU_ROUTES is not exported`, `validateMenuHref is not a function`, oraz błędy typów na `href` w fabryce.

- [ ] **Step 4: Rozszerz typ wiersza w `app/_lib/menu.ts`**

Podmień `MenuItemRow` (linia 19) — `page_id` staje się nullowalne, dochodzi `href`:

```ts
export type MenuItemRow = {
  id: string;
  location: string;
  // XOR: dokładnie jedno z page_id/href jest niepuste (constraint
  // menu_items_target_xor, migracja 71).
  page_id: string | null;
  href: string | null;
  label: string | null;
  label_de: string | null;
  sort_order: number;
  visible: boolean;
  // Nested select page:pages(...) — null gdy relacja nie wróciła ALBO gdy to
  // link własny (nie ma czego joinować).
  page: {
    slug: string;
    title: string;
    title_de: string | null;
    published: boolean;
  } | null;
};
```

- [ ] **Step 5: Dodaj rejestr tras i walidację**

Wstaw pod `isMenuLocation` w `app/_lib/menu.ts`:

```ts
// Trasy zaszyte w kodzie, które wolno podlinkować w menu. Świadomie WĘŻSZY
// zbiór niż RESERVED_SLUGS z pages.ts: tamten wylicza wszystkie segmenty
// top-level (także /api, /checkout, /konto, /og), a tu wchodzą tylko strony
// mające sens jako pozycja menu. Dopisanie nowej trasy w app/ wymaga dopisania
// jej TUTAJ — test niezmiennika pilnuje, że ścieżka naprawdę istnieje.
export const MENU_ROUTES: readonly { href: string; label: string }[] = [
  { href: "/sklep", label: "Sklep" },
  { href: "/tkaniny", label: "Tkaniny" },
  { href: "/probki", label: "Próbki tkanin" },
  { href: "/o-nas", label: "O nas" },
  { href: "/kontakt", label: "Kontakt" },
  { href: "/dostawa", label: "Dostawa" },
  { href: "/zwroty", label: "Zwroty" },
  { href: "/regulamin", label: "Regulamin" },
  { href: "/prywatnosc", label: "Prywatność" },
] as const;

export const MENU_HREF_MAX = 200;

// Małe litery, cyfry, myślnik i ukośnik. Backslash celowo POZA klasą —
// przeglądarki normalizują /\evil.com do //evil.com, czyli do adresu
// zewnętrznego.
const MENU_HREF_RE = /^\/[a-z0-9\-/]*$/;

// Komunikaty PO POLSKU — widzi je administratorka w toaście (wzorzec
// validatePageSlug). Tylko ścieżki wewnętrzne: LocalizedLink dokleja prefiks
// /de, więc adres zewnętrzny dałby „/de/https://…", a wolne pole na https://
// w nawigacji to gotowy open redirect.
export function validateMenuHref(
  href: string
): { ok: true } | { ok: false; error: string } {
  if (!href) return { ok: false, error: "Adres jest wymagany" };
  if (href.length > MENU_HREF_MAX) {
    return { ok: false, error: `Adres może mieć najwyżej ${MENU_HREF_MAX} znaków` };
  }
  if (!href.startsWith("/")) {
    return { ok: false, error: "Adres musi zaczynać się od „/”" };
  }
  // MUSI iść przed regexem: „//" przechodzi przez klasę znaków, a jest
  // adresem protokołowo-względnym, czyli wyjściem poza sklep.
  if (href.startsWith("//")) {
    return { ok: false, error: "Adres nie może prowadzić poza sklep" };
  }
  if (!MENU_HREF_RE.test(href)) {
    return {
      ok: false,
      error: "Adres może zawierać tylko małe litery, cyfry, myślniki i ukośniki",
    };
  }
  return { ok: true };
}
```

- [ ] **Step 6: Przepisz `prepareMenuItems`**

Podmień ciało funkcji (od `return rows` w linii ~49). Zaktualizuj też komentarz nad funkcją:

```ts
// Renderują się wyłącznie pozycje widoczne. Podstrona CMS musi być dodatkowo
// OPUBLIKOWANA (cofnięcie publikacji chowa link automatycznie); link własny
// wskazuje trasę z kodu, więc nie ma czego sprawdzać. Etykieta: własna
// (label_de→label per pole) wygrywa nad tytułem strony (title_de→title).
export function prepareMenuItems(
  rows: MenuItemRow[] | null,
  location: MenuLocation,
  locale: Locale
): LocalizedMenuItem[] {
  if (rows === null) return [];
  const pick = (deCol: string | null, plCol: string | null) =>
    locale === "de" && deCol && deCol.trim() ? deCol : plCol;
  return rows
    .filter(
      (r) =>
        r.location === location &&
        r.visible &&
        (r.href !== null || (r.page !== null && r.page.published))
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((r) => {
      const custom = pick(r.label_de, r.label);
      // Link własny: etykieta jest jedynym źródłem nazwy (constraint
      // menu_items_href_needs_label pilnuje jej w bazie).
      if (r.href !== null) {
        return { id: r.id, href: r.href, label: (custom ?? "").trim() };
      }
      const page = r.page!;
      const label =
        custom && custom.trim()
          ? custom
          : pick(page.title_de, page.title) ?? page.title;
      return { id: r.id, href: `/${page.slug}`, label };
    })
    // Pozycja bez nazwy byłaby klikalna, ale niewidoczna. Baza tego broni,
    // kod i tak nie ufa danym.
    .filter((item) => item.label !== "");
}
```

- [ ] **Step 7: Uruchom testy i potwierdź, że przechodzą**

Run: `npm test -- menu`
Expected: PASS, wszystkie bloki (`isMenuLocation`, `prepareMenuItems`, `MENU_ROUTES`, `validateMenuHref`).

- [ ] **Step 8: Sprawdź, że nie rozjechały się typy w reszcie repo**

Run: `npx tsc --noEmit`
Expected: błędy WYŁĄCZNIE w `app/_lib/menu-server.ts` i `app/admin/podstrony/MenuCard.tsx` (brak pola `href` w obiekcie) — te naprawiają Task 2 i Task 4. Jeśli wyskoczy cokolwiek innego, zatrzymaj się i zgłoś.

- [ ] **Step 9: Commit**

```bash
git add app/_lib/menu.ts app/_lib/__tests__/menu.test.ts
git commit -m "feat(menu): rejestr tras, walidacja href i XOR page_id/href w czystej logice"
```

---

### Task 2: Migracja 71 — schemat, RLS, zasiew

**Files:**
- Create: `supabase/migrations/71_menu_items_custom_links.sql`
- Modify: `app/_lib/menu-server.ts:12` (stała `MENU_SELECT`)

**Interfaces:**
- Consumes: `MenuItemRow` z Taska 1 (kolumna `href` musi wejść do `MENU_SELECT`, inaczej pole zawsze przyjdzie jako `undefined`).
- Produces: kolumna `menu_items.href`, constrainty `menu_items_target_xor` i `menu_items_href_needs_label`, indeks `menu_items_location_href_idx`, trzy zasiane wiersze `navbar`.

- [ ] **Step 1: Napisz migrację**

Utwórz `supabase/migrations/71_menu_items_custom_links.sql`:

```sql
-- supabase/migrations/71_menu_items_custom_links.sql
-- Linki własne w menu (spec 2026-08-07). Pozycja menu wskazuje ALBO podstronę
-- CMS (page_id), ALBO trasę zaszytą w kodzie (href). /tkaniny, /o-nas
-- i /kontakt to pliki w app/, nie wiersze w pages — bez tej zmiany nie da się
-- ich dodać do menu z panelu.

alter table public.menu_items alter column page_id drop not null;
alter table public.menu_items add column if not exists href text;

-- Dokładnie jedno z dwóch. Wiersz bez celu i wiersz z dwoma celami są tak samo
-- bez sensu, a XOR wyklucza oba jednym warunkiem.
alter table public.menu_items drop constraint if exists menu_items_target_xor;
alter table public.menu_items
  add constraint menu_items_target_xor
  check ((page_id is not null) <> (href is not null));

-- Link własny nie ma tytułu strony, z którego wziąłby etykietę awaryjną.
alter table public.menu_items drop constraint if exists menu_items_href_needs_label;
alter table public.menu_items
  add constraint menu_items_href_needs_label
  check (page_id is not null or (label is not null and btrim(label) <> ''));

-- Ten sam adres dwa razy w jednej lokacji to pomyłka. NULL-e są w unique index
-- wzajemnie różne, więc indeks nie przeszkadza wierszom wskazującym podstrony
-- (dokładnie ta sama własność, dzięki której menu_items_location_page_idx
-- nie przeszkadza linkom własnym).
create unique index if not exists menu_items_location_href_idx
  on public.menu_items (location, href);

-- Odczyt anonimowy: warunek „istnieje opublikowana strona" wyciąłby każdy link
-- własny, bo on żadnej strony nie ma. Aplikacja czyta service_role, więc to
-- porządek na ścieżce REST, nie zmiana zachowania sklepu.
drop policy if exists menu_items_read on public.menu_items;
create policy menu_items_read on public.menu_items
  for select using (
    visible
    and (
      href is not null
      or exists (
        select 1 from public.pages p
        where p.id = menu_items.page_id and p.published
      )
    )
  );

-- Zasiew trzech pozycji headera, o które chodziło w zgłoszeniu. Idempotentny
-- dzięki menu_items_location_href_idx. Pozycje zostają w pełni edytowalne —
-- można je przestawić, przemianować albo usunąć z panelu.
insert into public.menu_items (location, page_id, href, label, label_de, sort_order, visible)
values
  ('navbar', null, '/tkaniny', 'Tkaniny', 'Stoffe',   0, true),
  ('navbar', null, '/o-nas',   'O nas',   'Über uns', 1, true),
  ('navbar', null, '/kontakt', 'Kontakt', 'Kontakt',  2, true)
on conflict (location, href) do nothing;
```

- [ ] **Step 2: Dopisz kolumnę do zapytania serwerowego**

W `app/_lib/menu-server.ts` linia 12 — bez tego `href` nigdy nie dojdzie do `prepareMenuItems`:

```ts
const MENU_SELECT =
  "id, location, page_id, href, label, label_de, sort_order, visible, page:pages(slug, title, title_de, published)";
```

- [ ] **Step 3: Zaaplikuj migrację**

Użyj MCP `apply_migration` (nazwa: `menu_items_custom_links`, treść pliku z kroku 1). Automat w tym repo nie odpala — to jedyna droga.

**Uwaga:** connected project = **produkcja**. To jest bezpieczne (patrz „Kolejność i bezpieczeństwo produkcji" na górze planu), ale rób to świadomie.

- [ ] **Step 4: Zweryfikuj stan bazy**

Uruchom przez MCP `execute_sql`:

```sql
select location, href, label, label_de, sort_order, visible, page_id
from menu_items order by location, sort_order;
```

Expected: dokładnie trzy wiersze `navbar` — `/tkaniny`, `/o-nas`, `/kontakt` — każdy z `page_id = null` i `visible = true`.

Sprawdź też, że constraint faktycznie broni:

```sql
insert into menu_items (location, page_id, href, label) values ('navbar', null, '/x', null);
```

Expected: BŁĄD `menu_items_href_needs_label`. Jeśli wiersz się wstawił — zatrzymaj się, constraint nie wszedł.

- [ ] **Step 5: Potwierdź, że produkcja się nie zmieniła**

Wejdź na `https://www.mollien.pl` i sprawdź header. Expected: dalej tylko Meble i Nasze realizacje — wdrożony kod odrzuca wiersze z `page: null`. Trzy nowe pozycje pojawią się dopiero po deployu Taska 1.

Nie odpytuj tego adresu w pętli — Vercel rzuca 403 per IP na kilka minut.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/71_menu_items_custom_links.sql app/_lib/menu-server.ts
git commit -m "feat(menu): migracja 71 - kolumna href, RLS i zasiew Tkaniny/O nas/Kontakt"
```

---

### Task 3: Server actions — dodawanie linku własnego

**Files:**
- Modify: `app/admin/podstrony/actions.ts:158-188` (`addMenuItem`), `:190-208` (`updateMenuItemLabel`)

**Interfaces:**
- Consumes: `validateMenuHref`, `MENU_HREF_MAX` z Taska 1; kolumna `href` z Taska 2.
- Produces: `addMenuItem` czyta z `FormData` pole `kind` o wartości `"page"` (domyślnie) albo `"href"`; w trybie `"href"` czyta `href` i `label`. Task 4 musi wysyłać dokładnie te nazwy pól.

- [ ] **Step 1: Rozszerz import**

W `app/admin/podstrony/actions.ts` linia 11:

```ts
import { isMenuLocation, validateMenuHref, MENU_HREF_MAX } from "@/app/_lib/menu";
```

- [ ] **Step 2: Przepisz `addMenuItem` na dwa tryby**

Podmień całą funkcję (linie 158-188):

```ts
export async function addMenuItem(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const location = sanitize(formData.get("location"), 20);
  if (!isMenuLocation(location)) return { ok: false, error: "Nieznana lokalizacja menu" };
  // Brak pola = stary formularz podstrony (wstecznie zgodne).
  const kind = sanitize(formData.get("kind"), 10) || "page";

  // Wspólny XOR: albo podstrona, albo adres — nigdy oba, nigdy żadne.
  let target: { page_id: string; href: null } | { page_id: null; href: string };
  let label: string | null = null;
  let labelDe: string | null = null;

  if (kind === "href") {
    const href = sanitize(formData.get("href"), MENU_HREF_MAX).toLowerCase();
    const valid = validateMenuHref(href);
    if (!valid.ok) return { ok: false, error: valid.error };
    label = sanitize(formData.get("label"), 100);
    if (!label) return { ok: false, error: "Link własny musi mieć etykietę" };
    labelDe = emptyToNull(sanitize(formData.get("label_de"), 100));
    target = { page_id: null, href };
  } else {
    const pageId = sanitize(formData.get("page_id"), 40);
    if (!UUID_RE.test(pageId)) return { ok: false, error: "Wybierz stronę" };
    target = { page_id: pageId, href: null };
  }

  const supabase = await createAdminClient();
  const { data: maxRows } = await supabase
    .from("menu_items")
    .select("sort_order")
    .eq("location", location)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder =
    ((maxRows?.[0] as { sort_order: number } | undefined)?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("menu_items").insert({
    location,
    ...target,
    label,
    label_de: labelDe,
    sort_order: nextOrder,
    visible: true,
  } as never);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: kind === "href" ? "Ten link już jest w tym menu" : "Ta strona już jest w tym menu",
      };
    }
    if (error.code === "23503") return { ok: false, error: "Ta strona już nie istnieje" };
    return { ok: false, error: error.message };
  }
  revalidateMenu();
  return { ok: true, message: "Dodano do menu" };
}
```

- [ ] **Step 3: Nie pozwól wyczyścić etykiety linku własnego**

W `updateMenuItemLabel` (linia 190) wstaw sprawdzenie po `createAdminClient()`, przed `update`:

```ts
  const supabase = await createAdminClient();
  // Link własny bez etykiety byłby klikalny, ale niewidoczny. Baza odrzuci to
  // constraintem — sprawdzamy wcześniej, żeby administratorka dostała
  // komunikat po polsku zamiast surowego błędu Postgresa.
  const { data: existing } = await supabase
    .from("menu_items")
    .select("href")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Nie znaleziono pozycji menu" };
  const label = sanitize(formData.get("label"), 100);
  if ((existing as { href: string | null }).href !== null && !label) {
    return { ok: false, error: "Link własny musi mieć etykietę" };
  }
```

...i użyj wyliczonego `label` w `update` zamiast czytać `FormData` drugi raz:

```ts
    .update({
      label: emptyToNull(label),
      label_de: emptyToNull(sanitize(formData.get("label_de"), 100)),
      updated_at: new Date().toISOString(),
    } as never)
```

- [ ] **Step 4: Sprawdź typy i lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: błędy tylko w `MenuCard.tsx` (Task 4). Zero błędów w `actions.ts`.

- [ ] **Step 5: Commit**

```bash
git add app/admin/podstrony/actions.ts
git commit -m "feat(menu): akcja dodawania linku wlasnego + ochrona etykiety"
```

---

### Task 4: Panel — przełącznik trybu w karcie „Menu"

**Files:**
- Modify: `app/admin/podstrony/MenuCard.tsx`

**Interfaces:**
- Consumes: `addMenuItem` z Taska 3 (pola `kind`, `href`, `label`, `label_de`, `location`); `MENU_ROUTES` z Taska 1.
- Produces: nic dla dalszych zadań.

- [ ] **Step 1: Rozszerz importy**

```ts
import {
  MENU_LOCATIONS,
  MENU_ROUTES,
  type MenuItemRow,
  type MenuLocation,
} from "@/app/_lib/menu";
```

- [ ] **Step 2: Popraw nieaktualny opis lokacji**

`LOCATION_META.navbar.desc` (linia 28) opisuje limit 4 pozycji, którego nie ma od czasu zawijania do drugiego rzędu:

```ts
  navbar: {
    name: "Menu główne",
    desc: "Linki obok kategorii u góry strony. Gdy nie mieszczą się w jednym rzędzie, zawijają się do następnego.",
  },
```

- [ ] **Step 3: Pokaż właściwy adres w wierszu pozycji**

`displayLabel` (linia 130) — link własny ma etykietę zawsze, podstrona może jej nie mieć:

```ts
  function displayLabel(item: MenuItemRow): string {
    return (
      (item.label && item.label.trim()) ||
      item.page?.title ||
      (item.href ? item.href : "(strona usunięta)")
    );
  }
```

Wiersz z adresem (linia 210) — dziś na sztywno `/{slug}`:

```tsx
                        <p className="text-xs text-[var(--muted)] font-mono">
                          {item.href ?? `/${item.page?.slug ?? "?"}`}
                        </p>
```

Plakietka „strona-szkic" (linia 167) ma dotyczyć tylko podstron — jest już poprawnie zawężona przez `item.page !== null && !item.page.published`, więc **nie zmieniaj jej**.

- [ ] **Step 4: Przepisz `AddItemForm` na dwa tryby**

Podmień cały komponent (linie 257-303):

```tsx
function AddItemForm({
  location,
  pages,
  onResult,
}: {
  location: MenuLocation;
  pages: PageRow[];
  onResult: (r: ActionResult) => void;
}) {
  const [kind, setKind] = useState<"page" | "href">("page");
  const [pageId, setPageId] = useState("");
  const [href, setHref] = useState("");
  const [label, setLabel] = useState("");
  const [adding, startTransition] = useTransition();

  // Wybór trasy podpowiada etykietę, ale tylko dopóki administratorka nie
  // wpisze własnej — nadpisywanie jej tekstu byłoby wrogie.
  function chooseRoute(value: string) {
    setHref(value);
    const known = MENU_ROUTES.find((r) => r.href === value);
    if (known && (label === "" || MENU_ROUTES.some((r) => r.label === label))) {
      setLabel(known.label);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("location", location);
    fd.set("kind", kind);
    if (kind === "page") {
      if (!pageId) return;
      fd.set("page_id", pageId);
    } else {
      if (!href || !label.trim()) return;
      fd.set("href", href);
      fd.set("label", label.trim());
    }
    startTransition(async () => {
      onResult(await addMenuItem(fd));
      setPageId("");
      setHref("");
      setLabel("");
    });
  }

  const disabled =
    adding || (kind === "page" ? !pageId : !href || label.trim() === "");

  // Jeden przycisk dla obu trybów — różnią się polami nad nim, nie akcją.
  const submitButton = (
    <button
      type="submit"
      disabled={disabled}
      className="px-4 py-2.5 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors disabled:opacity-50"
    >
      {adding ? "Dodaję..." : "+ Dodaj"}
    </button>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex gap-2">
        {(["page", "href"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`px-3 py-1.5 text-xs font-sans uppercase tracking-widest rounded-full border transition-colors ${
              kind === k
                ? "border-[var(--color-gold)] text-[var(--color-gold)]"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)]"
            }`}
          >
            {k === "page" ? "Podstrona" : "Link własny"}
          </button>
        ))}
      </div>

      {kind === "page" ? (
        <div className="flex items-end gap-2 flex-wrap">
          <Field label="Dodaj stronę do menu" className="flex-1 min-w-[220px]">
            <select value={pageId} onChange={(e) => setPageId(e.target.value)} className={inputCls}>
              <option value="">— wybierz stronę —</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.published ? "" : " (szkic)"}
                </option>
              ))}
            </select>
          </Field>
          {submitButton}
        </div>
      ) : (
        <div className="flex items-end gap-2 flex-wrap">
          <Field label="Strona sklepu" className="flex-1 min-w-[200px]">
            <select value={href} onChange={(e) => chooseRoute(e.target.value)} className={inputCls}>
              <option value="">— wybierz stronę —</option>
              {MENU_ROUTES.map((r) => (
                <option key={r.href} value={r.href}>
                  {r.label} ({r.href})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Etykieta w menu" className="flex-1 min-w-[160px]">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={100}
              className={inputCls}
            />
          </Field>
          {submitButton}
        </div>
      )}
      {kind === "href" && (
        <p className="text-xs text-[var(--muted)]">
          Stałe strony sklepu (Tkaniny, O nas, Kontakt) — te, których nie ma na
          liście podstron, bo są częścią kodu, a nie treścią do edycji.
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 5: Sprawdź typy, lint i testy**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: wszystko czyste, zero błędów.

- [ ] **Step 6: Commit**

```bash
git add app/admin/podstrony/MenuCard.tsx
git commit -m "feat(menu): przelacznik podstrona/link wlasny w karcie Menu"
```

---

### Task 5: Weryfikacja wizualna i domknięcie

**Files:**
- Brak zmian w kodzie (chyba że weryfikacja coś wykaże).

**Interfaces:**
- Consumes: całość Tasków 1-4.

- [ ] **Step 1: Zbuduj i uruchom aplikację**

```bash
npm run build && npm start
```

Expected: build przechodzi. **Nie używaj `next dev` do zrzutów** — pada po pierwszym teście Playwrighta.

Jeśli `next dev` chodził wcześniej, ubij port 3000 i skasuj `.next` przed buildem — build przy żywym devie psuje jego cache.

- [ ] **Step 2: Zrzut headera na desktopie**

Przez MCP Playwrighta, w tej kolejności:

1. `browser_resize` → 1440 × 900
2. `browser_navigate` → `http://localhost:3000`
3. `browser_take_screenshot`

Expected — pasek w kolejności:

```
Meble ▾   Nasze realizacje ▾   TKANINY   O NAS   KONTAKT
```

- [ ] **Step 3: Sprawdź, że linki prowadzą, gdzie trzeba**

Kliknij kolejno TKANINY, O NAS, KONTAKT.
Expected: `/tkaniny`, `/o-nas`, `/kontakt`, każda ze statusem 200 i własną treścią. Żadnego 404.

- [ ] **Step 4: Zrzut menu mobilnego**

Zmień szerokość okna na 390, otwórz hamburger.
Expected: te same trzy pozycje pod listą kategorii, oddzielone kreską. `MobileMenu` nie był zmieniany — to test tego założenia, nie formalność.

- [ ] **Step 5: Przejdź ścieżkę panelu na żywo**

Wejdź na `/admin/podstrony` (sesja z `e2e/.auth/admin.json`, dane w `.env.e2e`). Sprawdź:

1. karta „Menu" pokazuje trzy pozycje z adresami `/tkaniny`, `/o-nas`, `/kontakt`;
2. strzałka „wyżej" przestawia pozycję i zmiana utrzymuje się po odświeżeniu;
3. switch widoczności chowa pozycję z headera;
4. tryb „Link własny" → wybór `/dostawa` podpowiada etykietę „Dostawa" i dodaje pozycję;
5. wyczyszczenie etykiety linku własnego daje czerwony toast „Link własny musi mieć etykietę".

**Uwaga:** to jest produkcyjna baza. Po punkcie 4 **usuń dodaną pozycję `/dostawa`**, a po punktach 2-3 przywróć stan wyjściowy.

- [ ] **Step 6: Uzupełnij sekcję STAN WYKONANIA i zacommituj**

Wpisz w sekcji na dole tego planu, co zostało zweryfikowane na żywo, a co nie.

```bash
git add docs/superpowers/plans/2026-08-07-menu-linki-wlasne.md
git commit -m "docs(menu): stan wykonania po weryfikacji"
```

- [ ] **Step 7: Otwórz PR**

```bash
git push -u origin feat/menu-linki-wlasne
gh pr create --title "Menu: linki wlasne edytowalne z panelu (Tkaniny, O nas, Kontakt)" --body "$(cat <<'EOF'
Header pokazuje teraz Meble, Nasze realizacje, Tkaniny, O nas i Kontakt.

Dwie pierwsze pozycje zawsze pochodzily z drzewa kategorii. Pozostale trzy to
trasy zaszyte w kodzie (app/tkaniny, app/(legal)/o-nas, app/(legal)/kontakt),
a menu_items.page_id byl NOT NULL i wskazywal na tabele pages - wiec nie dalo
sie ich dodac z panelu. Stad zgloszenie "w stopce sa, ale w panelu ich nie ma".

Zmiany:
- migracja 71: kolumna href w relacji XOR z page_id, constraint wymuszajacy
  etykiete dla linku wlasnego, rozszerzona polityka RLS, zasiew trzech pozycji
- rejestr znanych tras w _lib/menu.ts zamiast wolnego pola na adres, z testem
  pilnujacym, ze kazda sciezka istnieje naprawde
- walidacja href: tylko sciezki wewnetrzne (LocalizedLink dokleja /de, a wolne
  pole na https:// w nawigacji to open redirect)
- panel: przelacznik Podstrona / Link wlasny w karcie "Menu"

NavStrip i MobileMenu bez zmian - przyjmowaly generyczne {id, href, label},
ktorych nikt im nie podawal.

Migracja 71 jest juz zaaplikowana na produkcji (automat w tym repo nie odpala).
Bylo to bezpieczne przed deployem: wdrozony kod filtrowal zasiane wiersze, bo
maja page: null.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Push wymaga konta `Woodecky10` — domyślne `mwlo1403` dostaje 403. Deploy = merge PR do `main`.

---

## STAN WYKONANIA

Sekcja przenosi stan między komputerami i sesjami — `.superpowers/sdd/` jest gitignorowany, więc to jedyny nośnik. Uzupełniaj na bieżąco.

- **Task 1** — ZROBIONY (`8cc222e..4e960a6`). Przegląd znalazł błąd krytyczny: `prepareMenuItems`
  sprawdzał `r.href !== null`, a runtime dostarcza `undefined` (select nie pobierał wtedy kolumny,
  a `menu-server.ts` rzutuje przez `as unknown as`). Skutkiem był omijany warunek `published`
  i puste adresy. Naprawione helperem `linkHref`, który traktuje wiersz jako link własny tylko
  gdy `href` jest niepustym stringiem przechodzącym `validateMenuHref` — czyli walidacja działa
  też w miejscu renderu, nie tylko przy zapisie.
- **Task 2** — ZROBIONY (`ae5828b`). **Migracja 71 ZAAPLIKOWANA na produkcji** przez MCP.
  Zweryfikowane: 3 wiersze zasiane, celowo błędny INSERT odbity przez `menu_items_href_needs_label`,
  polityka RLS nie rozluźnia widoczności szkiców.
- **Task 3** — ZROBIONY (`df2986c..e5bf5ba`). Poprawka: odczyt sprawdzający istnienie wiersza
  nie gubi już błędu bazy. Decyzja właściciela: analogiczny `maxRows` w `addMenuItem` zostaje
  nietknięty (poza zakresem tej zmiany).
- **Task 4** — ZROBIONY (`bec0235`). Dwa znaleziska Important plan-mandated — patrz niżej.
- **Task 5** — **OKROJONY decyzją właściciela (presja czasu).** Wykonany: `npm run build` (przeszedł).
  **POMINIĘTE: cała weryfikacja wizualna** — zrzuty headera na desktopie i mobile oraz przeklikanie
  panelu na żywo.

**Czego NIE sprawdzono na żywo (dług do spłacenia):**
- Gałąź `pageLinks` w `NavStrip.tsx` **nigdy nie renderowała się z danymi** — `menu_items` było
  puste od zawsze. Testy pokrywają logikę wyliczania pozycji, nie wygląd paska.
- Nie potwierdzono wizualnie kolejności pozycji w headerze ani działania przełącznika trybu
  w panelu.
- Nie przeklikano ścieżki: dodanie linku własnego → przestawienie → ukrycie → usunięcie.

**Rozstrzygnięcia podjęte przy planowaniu:**
- Rejestr `MENU_ROUTES` jest wyselekcjonowanym podzbiorem `RESERVED_SLUGS`, pilnowanym testem
  niezmiennika — literówka w ścieżce pada na `npm test`, a nie na produkcji.
- Zasiew idzie w migracji, nie ręcznym klikaniem, a stary kod filtruje zasiane wiersze
  (`page: null`), więc produkcja nie pokazywała ich przed deployem.

## DO POPRAWY — zaległość świadomie zmergowana

Zmergowane do `main` 2026-08-07 z tymi dwiema usterkami w środku. Obie dotyczą **wygody
pracy w panelu**, nie tego, co widzi klient w sklepie — dlatego nie blokowały wdrożenia.
Obie są odziedziczone z kodu podanego w tym planie, nie z pomyłki wykonawcy.

Wszystko poniżej jest samowystarczalne — do zrobienia bez wracania do tej rozmowy.

### 1. Formularz czyści pola także po NIEUDANEJ próbie dodania

**Plik:** `app/admin/podstrony/MenuCard.tsx`, w `AddItemForm`, funkcja `submit`.

**Kiedy boli:** przy pierwszym wejściu w kartę „Menu". Wszystkie trzy trasy z zasiewu
(`/tkaniny`, `/o-nas`, `/kontakt`) już istnieją, więc próba dodania którejkolwiek zwraca
„Ten link już jest w tym menu" — i w tym momencie wybrana trasa oraz wpisana etykieta
znikają, mimo że nic się nie zapisało.

**Jest:**

```tsx
startTransition(async () => {
  onResult(await addMenuItem(fd));
  setPageId("");
  setHref("");
  setLabel("");
});
```

**Ma być:**

```tsx
startTransition(async () => {
  const res = await addMenuItem(fd);
  onResult(res);
  // Czyścimy dopiero po sukcesie — inaczej odbita próba (np. duplikat linku)
  // kasuje wpisane dane i trzeba je wystukać od nowa.
  if (res.ok) {
    setPageId("");
    setHref("");
    setLabel("");
  }
});
```

### 2. Podpowiadanie etykiety może nadpisać tekst wpisany ręcznie

**Plik:** `app/admin/podstrony/MenuCard.tsx`, funkcja `chooseRoute`.

**Na czym polega:** warunek rozpoznaje „ta etykieta była podpowiedziana" przez sprawdzenie,
czy jej wartość znajduje się na liście kanonicznych nazw z `MENU_ROUTES`. To przybliżenie,
nie fakt — ręcznie wpisana etykieta, która przypadkiem zgadza się z jedną z dziewięciu nazw
(np. wpisane „Kontakt" przy wybranej innej trasie), zostanie po cichu nadpisana przy zmianie
trasy w selekcie. Prawdopodobieństwo niskie, ale to realna utrata danych wejściowych.

**Kierunek poprawki:** śledzić pochodzenie zamiast porównywać wartość — flaga (`useRef`)
ustawiana przy podpowiedzi i kasowana przy każdej ręcznej edycji pola etykiety. Nadpisujemy
tylko wtedy, gdy flaga mówi, że bieżąca wartość pochodzi z podpowiedzi.

### Czego dodatkowo NIE zweryfikowano (patrz sekcja wyżej)

Przy poprawianiu powyższych warto przy okazji domknąć pominiętą weryfikację wizualną —
zwłaszcza to, że gałąź `pageLinks` w `NavStrip.tsx` nigdy nie renderowała się z danymi.
Sposób: `npm run build` + `npm start`, potem Playwright na 1440 i 390 px. **Nie na `next dev`** —
pada po pierwszym teście.

**Rozstrzygnięcia podjęte przy planowaniu:**
- Rejestr `MENU_ROUTES` jest wyselekcjonowanym podzbiorem `RESERVED_SLUGS`, pilnowanym testem niezmiennika — literówka w ścieżce pada na `npm test`, a nie na produkcji.
- Zasiew idzie w migracji, nie ręcznym klikaniem, a stary kod filtruje zasiane wiersze (`page: null`), więc produkcja nie pokazuje ich przed deployem.

**Świadomie poza zakresem:**
- Linki zewnętrzne (wymagają decyzji o `target`/`rel`).
- `Footer.tsx:29` dalej trzyma własną, zaszytą listę linków zamiast czytać `menu_items`.
