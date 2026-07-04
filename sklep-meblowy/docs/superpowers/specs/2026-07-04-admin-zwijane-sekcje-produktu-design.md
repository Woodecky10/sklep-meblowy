# Zwijane sekcje edytora produktu (admin) — design

Data: 2026-07-04. Zatwierdzone przez użytkownika.

## Kontekst i problem

Edytor produktu (`/admin/produkty/[id]`, komponent `ProductEditor`) to jedna
długa strona z sześcioma sekcjami-kartami jedna pod drugą:

1. Podstawowe dane (inline w `ProductEditor`)
2. Zdjęcia produktu (inline w `ProductEditor`)
3. Warianty (`VariantsEditor` — dwie gałęzie renderu: warianty wył./wł.)
4. Opis (`DescriptionFieldEditor`)
5. Sekcje opisu (`DescriptionSectionsEditor`)
6. Tłumaczenie DE (`TranslationEditor`)

Sekcje Warianty i Sekcje opisu bywają bardzo długie → dużo przewijania, gdy
admin pracuje tylko nad jedną z nich. „Dodawanie produktu" to mały formularz
`/admin/produkty/nowy` (nazwa/cena/kategoria), który po utworzeniu przekierowuje
DO tego edytora — więc to tu odczuwalne jest przewijanie.

Panel jest dla nietechnicznej osoby — UX musi zostać trywialnie prosty.

## Decyzja produktowa (odpowiedź użytkownika)

Każda sekcja zwijana przez kliknięcie nagłówka. **Stan zapamiętywany** w
przeglądarce (localStorage) **per sekcja, wspólnie dla wszystkich produktów**:
co admin zwinie, zostaje zwinięte także po odświeżeniu i przy kolejnych
produktach. Pierwsze wejście (pusty localStorage) = wszystko rozwinięte.

## Podejście (wybrane: A)

Wspólny komponent `CollapsibleSection` renderujący standardową kartę + klikalny
nagłówek z chevronem + zwijaną treść. Wszystkie 6 sekcji refaktorowane, żeby go
używały. Pełna kontrola nad zachowaniem „klik w tytuł zwija, klik w przycisk
akcji w nagłówku (np. «+ Dodaj zdjęcia») NIE zwija".

Odrzucone: **B** — natywne `<details>/<summary>`. Zwijanie bez JS, ale
zapamiętywanie stanu i tak wymaga JS, przyciski akcji w `<summary>` wymagają
blokowania propagacji kliknięcia, a stylowanie pod obecny wygląd karty jest
bardziej upierdliwe. Przewaga „bez JS" znika.

## Moduł: persystencja (czysta logika, testowalna)

Nowy `app/_lib/section-collapse.ts` (czyste funkcje, bez React — obok innych
testowalnych modułów jak `corner-side.ts`; test trafia do `app/_lib/__tests__/`,
gdzie vitest szuka testów):

- `COLLAPSE_KEY_PREFIX = "admin.produkt.sekcja."` — prefiks klucza localStorage.
- `readCollapsed(storageKey: string): boolean` — czyta `localStorage[prefix+key]`;
  `"1"` → zwinięte (true), cokolwiek innego / brak / brak `window` → rozwinięte
  (false). Nigdy nie rzuca (try/catch — prywatny tryb, wyłączony storage).
- `writeCollapsed(storageKey: string, collapsed: boolean): void` — zapis `"1"`/`"0"`;
  błędy połykane (try/catch).

Wydzielenie do czystego modułu pozwala pokryć logikę unit-testami w środowisku
node (mock `globalThis.localStorage`), zgodnie z konwencją repo (brak jsdom).

## Komponent `CollapsibleSection`

W `app/admin/produkty/[id]/_shared.tsx` (już importowany przez `ProductEditor`
i wszystkie pod-edytory — `Field`, `IconBtn`, `inputClass`, `Toast`).

Propsy:
- `title: string` — tekst nagłówka (dawne `<h2>`).
- `storageKey: string` — klucz persystencji (patrz tabela niżej).
- `headerAside?: React.ReactNode` — opcjonalne akcje po prawej stronie nagłówka
  (np. przycisk uploadu, badge statusu), renderowane POZA przyciskiem zwijania.
- `bodyClassName?: string` — klasy kontenera treści (domyślnie `flex flex-col gap-5`);
  pozwala zachować różne odstępy sekcji (gap-4/5/6).
- `children: React.ReactNode` — treść sekcji (chowana gdy zwinięte).

Render:
- Zewnętrzny `<section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5">`
  (identyczny wygląd jak dziś).
- Wiersz nagłówka: `<button type="button" aria-expanded={!collapsed} onClick={toggle}>`
  z chevronem (SVG, obrót 90° gdy rozwinięte) + `<h2 className="font-display text-xl font-semibold text-[var(--fg)]">{title}</h2>`;
  po prawej `{headerAside}` (jeśli podane). Przycisk zajmuje obszar tytułu, aside jest
  osobnym, klikalnym elementem — klik w akcję nie propaguje do toggle.
  Refaktorując sekcję: cała dotychczasowa zawartość wiersza nagłówka OPRÓCZ `<h2>`
  (przyciski/akcje/status stojące dziś obok tytułu) przechodzi do `headerAside`;
  jeśli sekcja ma tylko `<h2>` (Opis, Podstawowe dane), `headerAside` pomijamy.
- Treść: `<div className={collapsed ? "hidden" : bodyClassName}>{children}</div>`
  — ciało **ukrywane przez CSS** (`display:none`), NIE odmontowywane. Dzięki temu
  niekontrolowane pola `defaultValue` w „Podstawowe dane" NIE tracą niezapisanych
  wpisów przy zwinięciu/rozwinięciu (odmontowanie by je wyzerowało). `bodyClassName`
  (domyślnie `flex flex-col gap-5`) pozwala zachować różne odstępy sekcji (gap-4/5/6).

Stan:
- `const [collapsed, setCollapsed] = useState(false)` — SSR-safe (rozwinięte).
- `useEffect(() => setCollapsed(readCollapsed(storageKey)), [storageKey])` — po
  zamontowaniu ustawia zapamiętany stan.
- `toggle` = `setCollapsed(v => { const n=!v; writeCollapsed(storageKey,n); return n; })`.
- Świadoma konsekwencja: sekcja z zapisem „zwinięte" mignie rozwinięta przez
  jedną klatkę zanim `useEffect` ją zwinie. Akceptowalne w adminie (decyzja
  użytkownika). `useLayoutEffect` wyeliminowałby mignięcie — nie robimy (YAGNI).

## Refaktor sekcji (te same klucze wszędzie)

| Sekcja | storageKey | Plik | Uwagi |
|---|---|---|---|
| Podstawowe dane | `podstawowe` | `ProductEditor.tsx` | inline |
| Zdjęcia produktu | `zdjecia` | `ProductEditor.tsx` | „+ Dodaj zdjęcia" → `headerAside`; opis pod nagłówkiem zostaje w treści |
| Warianty | `warianty` | `VariantsEditor.tsx` | 2 gałęzie renderu (wył./wł.) → OBIE ten sam `storageKey` |
| Opis | `opis` | `DescriptionFieldEditor.tsx` | |
| Sekcje opisu | `sekcje-opisu` | `DescriptionSectionsEditor.tsx` | ew. akcje nagłówka → `headerAside` |
| Tłumaczenie DE | `tlumaczenie-de` | `TranslationEditor.tsx` | ew. status/akcje → `headerAside` |

Refaktor mechaniczny: zamiana `<section class="...karta..."> <h2>Tytuł</h2> ...`
na `<CollapsibleSection title="Tytuł" storageKey="..." headerAside={...}> ... </CollapsibleSection>`.
Treść sekcji bez zmian.

## Testy

- Nowy `app/_lib/__tests__/section-collapse.test.ts`:
  - `readCollapsed`: `"1"` → true; `"0"`/brak klucza/pusty → false; brak
    `localStorage` (undefined) → false, nie rzuca; wyjątek przy odczycie → false.
  - `writeCollapsed`: zapisuje `"1"`/`"0"` pod `prefix+key`; wyjątek połknięty.
  - Mock `globalThis.localStorage` prostą mapą w `beforeEach`.
- UI: weryfikacja na dev serverze (klik nagłówka zwija/rozwija; odświeżenie
  zachowuje stan; drugi produkt dziedziczy zwinięcia). Opcjonalny spec
  Playwright `e2e/admin-collapse.spec.ts` (wymaga `.env.e2e` z kontem admina —
  uruchamialny gdy dane są dostępne).

## Nie-cele (YAGNI)

- Przycisk „zwiń/rozwiń wszystkie".
- Zapamiętywanie stanu per konkretny produkt (świadomie wspólne dla wszystkich).
- Animacja rozwijania (max-height transition) — proste pokazanie/schowanie.
- Zwijanie na innych stronach admina (tylko edytor produktu).
- Zmiany w formularzu `/admin/produkty/nowy` (mały, bez problemu przewijania).

## Znane konsekwencje (zaakceptowane)

- Jednoklatkowe mignięcie rozwiniętej sekcji przy wczytaniu, gdy zapamiętana jako
  zwinięta (patrz „Stan").
- Stan współdzielony między przeglądarkami/urządzeniami NIE jest synchronizowany
  (localStorage jest lokalny) — zgodne z intencją (preferencja widoku, nie dane).

## Gałąź i wdrożenie

- Implementacja na gałęzi `feat/admin-zwijane-sekcje` od `main`.
- Przed pisaniem kodu: przeczytać odpowiednie docsy w
  `node_modules/next/dist/docs/` (AGENTS.md: wersja Next ma breaking changes).
- Po implementacji: weryfikacja na dev, merge do `main`, push (deploy prod).
