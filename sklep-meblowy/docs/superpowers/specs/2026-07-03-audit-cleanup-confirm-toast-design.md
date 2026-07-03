# Audit cleanup — dialogi confirm + toasty + martwy kod — design

Data: 2026-07-03. Zatwierdzone przez użytkownika („zrób wszystko"). Domyka LOW-owe pozostałości audytu 2026-06-11.

## Kontekst i problem

Audyt 2026-06-11 zostawił trzy LOW-owe wątki (potwierdzone cross-checkiem 2026-07-03):
- **16× natywny `confirm()`** (potwierdzenia usuwania/nieodwracalne) — blokujące, niespójne z design systemem.
- **4× natywny `window.alert`** (informacyjne, admin) — jw.
- **Martwy `app/_lib/secure-compare.ts`** (+ test) — 0 importerów (trasy cron, dla których powstał, usunięte).

Konsolidacja duplikatów `_shared` **poza zakresem** (top-level `admin/_shared` już istnieje; pozostałe duplikaty mają inny `inputClass` → scalanie = ryzyko wizualne, zerowa wartość dla użytkownika).

## Cel

Spójne, stylowane, dostępne potwierdzenia i powiadomienia zamiast natywnych okien przeglądarki — z minimalnym tarciem migracyjnym w 16 miejscach.

## Nie-cele (YAGNI)

- Konsolidacja `_shared` / ujednolicenie `inputClass`.
- Zmiana `window.prompt` w `RichTextEditor` (wejście URL linku) — natywny prompt zostaje (osobny, rzadki, poza zakresem).
- Dotykanie `CartToast` (osobny, sprzężony z koszykiem) ani admin-owego `ToastView`.

## Architektura

### 1. Promise-owy `useConfirm` + jeden `ConfirmDialog`
- **`app/_context/ConfirmContext.tsx`** — `ConfirmProvider` trzyma stan (open + opcje + resolver), renderuje **jeden** `ConfirmDialog`, i eksponuje hook `useConfirm()` zwracający funkcję:
  ```ts
  confirm(opts: {
    message: string;
    title?: string;         // domyślnie "Potwierdź"
    confirmLabel?: string;  // domyślnie "Potwierdź" (danger: "Usuń")
    cancelLabel?: string;   // domyślnie "Anuluj"
    danger?: boolean;       // czerwony przycisk potwierdzenia
  }): Promise<boolean>
  ```
  Wywołanie ustawia stan + zwraca Promise; klik „Potwierdź" → `resolve(true)`, „Anuluj"/Escape/tło/X → `resolve(false)`.
- **`ConfirmProvider` montowany w `app/layout.tsx`** (obok `ToastProvider`) → `useConfirm()` działa w każdym komponencie klienckim (sklep i admin renderują się w tym layoucie).
- **`app/_components/ui/ConfirmDialog.tsx`** — zbudowany na istniejącym `Modal` (`_components/ui/Modal.tsx`) + `useModal` (scroll-lock/focus-trap/Escape już są). Body: treść + `[Anuluj] [Potwierdź]`; `danger` → przycisk potwierdzenia czerwony.

### 2. Migracja 16× `confirm()` (drop-in)
`useConfirm()` zwraca bezpośrednio funkcję `confirm` (analogicznie do `useToast()` → `showToast`).
Wzorzec: `if (!window.confirm(msg)) return; <akcja>` → handler `async`, `const confirm = useConfirm()`, `if (!(await confirm({ message, danger: true }))) return; <akcja>`.
- **Klienckie (2), zlokalizowane:** `CancelOrderButton.tsx` (komunikat z dict `c.confirm`), `ReviewForm.tsx` (dict `c.confirmDelete`). Etykiety przycisków z dict (PL/DE).
- **Admin (14), PL:** InquiriesList, FabricsEditor, FeaturedEditor, OrderControls (usuń zamówienie), SliderEditor, KategorieEditor, TilesEditor, CollectionsEditor, PromoEditor, DeleteProductButton, ReklamacjeList, DescriptionSectionsEditor, SizeGroupEditor (scalenie grup), VariantsEditor. Komunikaty przenosimy 1:1 z obecnych `confirm(...)`.

### 3. Migracja 4× `window.alert` → toast
Globalny `useToast()` (`app/_context/ToastContext.tsx`, `showToast(message, "error")`) — tak jak już zmigrowany `WishlistButton`:
- `DeleteProductButton.tsx:40`, `RichTextEditor.tsx:97,99,136`.

### 4. Usunięcie martwego kodu
Usuń `app/_lib/secure-compare.ts` + `app/_lib/__tests__/secure-compare.test.ts`.

## Przypadki brzegowe

- Podwójny `confirm()` naraz: dialog jest singletonem — nowe wywołanie w trakcie otwartego rozwiązuje poprzedni Promise jako `false` i pokazuje nowy („ostatni wygrywa"). W praktyce rzadkie (akcje w `useTransition`/disabled).
- Zamknięcie bez wyboru (Escape/tło/X) = `resolve(false)` (jak „Anuluj").
- `danger` domyślnie dla usuwania; scalenie grup (SizeGroupEditor) i anulowanie zamówienia — `danger: true` (nieodwracalne).
- Dialog kliencki musi być zlokalizowany (PL/DE) tam, gdzie komunikat pochodzi z dict; admin PL-only.
- `useConfirm`/`useToast` rzucają poza providerem — providery są w root layout, więc OK.

## Testy

- Provider/dialog/migracje to komponenty klienckie — zgodnie ze wzorcem repo **bez unit-testów**; weryfikacja: lint + istniejące testy + build.
- **Wizualnie (Playwright):** zrzut otwartego `ConfirmDialog` przed wdrożeniem — wygląd + czerwony przycisk `danger` + że kliknięcie „Potwierdź"/„Anuluj" zwraca poprawny wynik (smoke jednego klienckiego, np. usuwanie recenzji).
- Smoke: kilka potwierdzeń (kliencki + admin) faktycznie wykonuje/anuluje akcję.

## Pliki dotknięte

- **Nowe:** `app/_context/ConfirmContext.tsx`; `app/_components/ui/ConfirmDialog.tsx`.
- **Edycja:** `app/layout.tsx` (mount `ConfirmProvider`); 16 komponentów z `confirm()` (lista wyżej); 2 komponenty z `alert` (DeleteProductButton, RichTextEditor); ew. słowniki (etykiety „Potwierdź"/„Anuluj"/„Usuń" PL/DE, jeśli brak).
- **Usunięte:** `app/_lib/secure-compare.ts`, `app/_lib/__tests__/secure-compare.test.ts`.
- **Bez zmian:** `_shared` (konsolidacja poza zakresem), `CartToast`, admin `ToastView`, `window.prompt` w RichTextEditor.
