# Spec: Edytor WYSIWYG dla pojedynczego pola opisu (PL + DE)

**Data:** 2026-06-22
**Status:** zaakceptowany (brainstorming) → do planu TDD
**Powiązany:** rozszerzenie funkcji z `2026-06-22-edytor-wysiwyg-opisow-produktu-design.md`

## Kontekst i problem

Edytor WYSIWYG `RichTextEditor` (TipTap) został wdrożony dla **3 pól sekcji** opisu
(własna sekcja PL, override sekcji z BL, sekcja DE) i scalony do `main`. Weryfikacja
runtime ujawniła jedno powiązane pole **poza** tym zakresem: **pojedyncze pole opisu**
(`products.description` / `products.description_de`), które:

- jest renderowane na karcie produktu jako **fallback** — tylko gdy produkt **nie ma
  sekcji** (`app/produkt/[id]/page.tsx:279-296`, przez `sanitizeProductHtml` +
  `dangerouslySetInnerHTML`); na /de przez `pickLocalized(description, description_de)`
  (`app/_lib/localize.ts:68`);
- **DE (`description_de`)** jest edytowalne w panelu — ale przez **surową `<textarea>`**
  („Opis (DE)", `TranslationEditor.tsx:219-227`) z podpowiedzią „HTML dozwolony" → ten
  sam problem „pisz HTML ręcznie / myślniki zlewają się w jedną linię";
- **PL (`description`)** jest renderowane, ale **nie jest edytowalne** w panelu —
  `updateProductBasics` świadomie je pomija (`actions.ts:141-143`), bo PL autoruje się
  przez sekcje. Dla produktów natywnych `description=""` (`new-product.ts:61`), więc
  fallback PL i tak się nie pokazuje — pole jest legacy (BL-era).

Decyzja właściciela: objąć to pojedyncze pole tym samym edytorem **w obu językach**
(parytet), świadomie akceptując, że PL zyskuje drugą — fallbackową — ścieżkę autorowania.

## Cel i zakres

### Cel
Pojedynczy opis produktu (PL i DE) edytuje się tym samym WYSIWYG-iem co sekcje —
zero ręcznego HTML — a jego treść renderuje się poprawnie (fallback przy braku sekcji).

### W zakresie
- **PL:** nowy blok edycji „Opis produktu" w `ProductEditor` (komponent
  `DescriptionFieldEditor`) + nowa akcja zapisu `updateProductDescription`.
- **DE:** zamiana textarea „Opis (DE)" → `RichTextEditor` w `TranslationEditor`.
- **sanitize-on-save** dla obu pól (`description`, `description_de`).
- **Hinty** wyjaśniające semantykę fallbacku (pokazywany tylko gdy brak sekcji).

### Poza zakresem (świadomie)
- **Render bez zmian** — semantyka fallbacku zostaje (wariant A z brainstormingu;
  odrzucony wariant B = pokazywanie opisu zawsze jako „lead" nad sekcjami, bo to
  zmiana layoutu sklepu i decyzja produktowa poza tym zakresem).
- Brak migracji bazy. Brak zmian w `RichTextEditor` (reuse). Brak zmian whitelisty.
- `updateProductBasics` zostaje bez zmian (nadal pomija `description` — opis ma
  własny zapis, spójnie ze zdjęciami/sekcjami/wariantami).

## Architektura

### 1. PL — komponent `DescriptionFieldEditor` (nowy)
Plik: **`app/admin/produkty/[id]/DescriptionFieldEditor.tsx`** (`"use client"`).
Wzorzec jak `DescriptionSectionsEditor`: własny stan + dirty-tracking + `useTransition`
+ toast + przycisk „Zapisz opis". Props:
```ts
{ productId: string; initial: string; onToast: (t: Toast) => void; }
```
- Stan `value` (HTML), `baseline` (do dirty), render `<RichTextEditor value onChange ariaLabel placeholder>`.
- `dirty = value !== baseline`; po sukcesie zapisu `baseline = value`.
- Przycisk „Zapisz opis" wywołuje `updateProductDescription(productId, value)`.
- Hint: „Pokazywany na karcie produktu tylko gdy nie dodasz sekcji opisu poniżej."
- Renderowany w `ProductEditor` **nad** `<DescriptionSectionsEditor>`.

### 2. Akcja `updateProductDescription` (nowa)
W `app/admin/produkty/actions.ts`:
```ts
export async function updateProductDescription(
  productId: string,
  html: string
): Promise<ActionResult>
```
- `requireAdmin()`; walidacja `productId` + `typeof html === "string"`.
- Zapis `description: sanitizeProductHtml(html)` (sanitize-on-save).
- `revalidatePath('/admin/produkty/[id]')`, `/produkt/[id]`, `/sklep`.
- Zwraca `ActionResult` (`{ ok, message }` / `{ ok:false, error }`).

### 3. DE — zamiana w `TranslationEditor`
Pole „Opis (DE)" (`TranslationEditor.tsx:219-227`): `<textarea value={descriptionDe}
onChange=...>` → `<RichTextEditor value={descriptionDe} onChange={setDescriptionDe}
ariaLabel="Niemiecki opis produktu" placeholder="Niemiecki opis produktu" />`.
Hint traci „HTML dozwolony" → „Pokazywany na /de tylko gdy brak sekcji DE."
Zapis bez zmian strukturalnych (idzie przez istniejące `saveProductDe`), patrz pkt 4.

### 4. sanitize-on-save DE
`saveProductDe` (`actions.ts:474-511`) dziś zapisuje `description_de` przez zwykły
`sanitize()` (trim+slice). Zmiana: `description_de: sanitizeProductHtml(fields.description_de ?? "")`
— bo to teraz bogaty HTML z edytora. (Sekcje DE już są sanityzowane przez
`sanitizeSectionsHtml` z poprzedniego slice'u — bez zmian.)

## Przepływ danych
- Format bez zmian: HTML string w `products.description` / `products.description_de`.
- Render bez zmian: `page.tsx:279-296` (fallback, gdy brak sekcji) + `sanitizeProductHtml`.
- Zapis: PL → `updateProductDescription` (sanitize); DE → `saveProductDe` (sanitize).
- Brak migracji.

## Przypadki brzegowe
- **Legacy `description` z BL** (możliwe h4 / złożony HTML): po wczytaniu do edytora
  normalizuje się do H2/H3 + whitelista; zapis utrwala wersję znormalizowaną — to
  świadome oczyszczenie (render i tak sanityzuje). Akceptowalne.
- **Pusty edytor → `""`** (`normalizeEditorHtml`) → `description` = `""` → fallback się
  nie renderuje (`trim().length > 0` w `page.tsx`). Spójne.
- **Produkt z sekcjami:** pojedynczy opis się nie renderuje (fallback). Hint to
  komunikuje, żeby admin nie był zaskoczony.
- **DE bez zmian dla nie-tekstu:** `description_de` to zawsze string; brak guardów tablicowych.

## Testy
- Brak nowej czystej logiki do testu jednostkowego — sanityzacja to istniejący,
  otestowany `sanitizeProductHtml`; nowa akcja to cienkie opakowanie (requireAdmin +
  sanitize + update), nieftestowane jednostkowo w tym repo (wzorzec jak inne akcje).
- Bramki: `npx tsc --noEmit` (0) · `npm run lint` (0) · `npm test` (zielony, bez regresji)
  · `npm run build` (Turbopack OK).
- Smoke ręczny: `/admin/produkty/[id]` → „Opis produktu" (PL) napisz listę → „Zapisz opis";
  produkt BEZ sekcji → `/produkt/[id]` pokazuje sformatowany opis; produkt Z sekcjami →
  opis ukryty (fallback). DE analogicznie na `/de/produkt/[id]`.

## Stan obecny kodu (dla implementującego)
- Render fallback: `app/produkt/[id]/page.tsx:279-296` (single description, gdy brak sekcji).
- Lokalizacja: `app/_lib/localize.ts:68` (`pickLocalized(description, description_de)`).
- PL nieedytowalne: `app/admin/produkty/actions.ts:141-143` (`updateProductBasics` pomija `description`).
- DE textarea: `app/admin/produkty/[id]/TranslationEditor.tsx:219-227` („Opis (DE)").
- DE zapis: `app/admin/produkty/actions.ts:474-511` (`saveProductDe`, `description_de` ~489).
- Komponent edytora: `app/admin/produkty/[id]/RichTextEditor.tsx` (props `value/onChange/ariaLabel/placeholder?`).
- Sanitizer: `app/_lib/product-html.ts` (`sanitizeProductHtml`).
- Wzorzec bloku self-save: `DescriptionSectionsEditor.tsx` (stan/baseline/dirty/toast/przycisk).

## Dalsze kroki
Po akceptacji speca → plan TDD (`writing-plans`): akcja `updateProductDescription` →
komponent `DescriptionFieldEditor` + wpięcie w `ProductEditor` → zamiana pola DE +
sanitize-on-save DE → bramki jakości + smoke.
