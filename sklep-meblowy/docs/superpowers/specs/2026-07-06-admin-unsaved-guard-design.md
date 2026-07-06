# Guard niezapisanych zmian w panelu admina — spec

**Data:** 2026-07-06
**Status:** zatwierdzony projekt (brainstorming z użytkownikiem)

## Cel

Gdy administrator edytuje cokolwiek ręcznie wpisywanego w panelu (`/admin/**`) i
próbuje wyjść bez zapisania, panel pyta: **„Zostań" / „Zapisz i wyjdź" /
„Wyjdź bez zapisywania"**. Dotyczy każdej sekcji admina z ręcznym wprowadzaniem
danych (produkty — dodawanie i edycja, tkaniny, kategorie, kolekcje, slider,
kafelki, polecane, kody rabatowe, ustawienia, zamówienia — status/notatki).

## Zakres wyjść

| Wyjście | Zachowanie |
|---------|-----------|
| Klik w wewnętrzny link (sidebar, breadcrumb, listy, logo) | Blokada nawigacji + własny dialog 3-przyciskowy |
| Zamknięcie karty / odświeżenie / ręczny URL | Natywne ostrzeżenie przeglądarki (`beforeunload`) |
| Przycisk „wstecz" przeglądarki | **Poza zakresem** (decyzja użytkownika — blokowanie popstate w Next App Router jest zawodne) |

## Model śledzenia zmian (dirty)

Jednostka śledzenia = **formularz** lub **sekcja z atrybutem**:

1. **`<form>` (auto, zero zmian w edytorach):** zdarzenie `input`/`change`
   (capture, delegacja na `document`) z celem wewnątrz `<form>` → formularz
   dodany do zbioru brudnych. Zdarzenie `submit` na tym formularzu → usunięty.
   Obejmuje: ProductEditor (podstawy), NewProductForm, FabricsEditor,
   KategorieEditor, PromoEditor, CollectionsEditor, FeaturedEditor,
   TilesEditor, SliderEditor, OrderControls (status + notatki).
2. **`[data-guard-section]` (5 edytorów bez `<form>`):** kontener sekcji
   dostaje `data-guard-section`, przycisk zapisu `data-guard-save`.
   `input`/`change` wewnątrz kontenera → sekcja brudna; klik w element
   `[data-guard-save]` wewnątrz kontenera → czysta. Dotyczy:
   - `app/admin/ustawienia/SettingsForm.tsx` (przycisk „Zapisz kurs")
   - `app/admin/produkty/[id]/VariantsEditor.tsx` („Zapisz warianty")
   - `app/admin/produkty/[id]/DescriptionSectionsEditor.tsx` („Zapisz sekcje")
   - `app/admin/produkty/[id]/TranslationEditor.tsx` („Zapisz tłumaczenie DE")
   - `app/admin/produkty/[id]/DescriptionFieldEditor.tsx` („Zapisz opis")

   `SizeGroupEditor` NIE jest sekcją — jego etykiety zapisują się same na
   blur (klik w link = blur = auto-zapis), a drugi input to wyszukiwarka
   produktów; kontener dostaje `data-guard-ignore`.

   **Kontener sekcji ma dokładnie JEDEN przycisk `data-guard-save`** (główny
   zapis stanu sekcji). Jeśli edytor zapisuje per wiersz, każdy wiersz jest
   osobnym kontenerem `data-guard-section` z własnym przyciskiem — granulacja
   ustalana per edytor w planie implementacji. Klik przycisku czyści swoją
   sekcję.

**Wykluczenia (brak fałszywych alarmów):**
- `input[type=file]` — uploady zapisują się same przy wyborze pliku;
- elementy wewnątrz `[data-guard-ignore]` — atrybut na formularzu wyszukiwarki
  w `app/admin/zamowienia/page.tsx` (wpisanie frazy nie jest „zmianą danych");
- formularz logout w `AdminShell` — nie ma pól tekstowych, nigdy nie będzie brudny;
- zdarzenia `input` z contenteditable (RichTextEditor) SĄ śledzone — cel
  zdarzenia leży wewnątrz `[data-guard-section]` sekcji opisów.

**Reset:** zmiana ścieżki (usePathname) czyści cały zbiór brudnych (jednostki
z poprzedniej strony już nie istnieją). Potwierdzenie „Wyjdź bez zapisywania"
też czyści przed nawigacją.

**Świadome uproszczenie:** dirty jest optymistyczne — submit/klik zapisu czyści
od razu, nie czekając na wynik akcji serwera (standard branżowy; błąd zapisu
pokazuje toast edytora). Zmiany niegenerujące `input`/`change` (np. przeciąganie
kolejności zdjęć) nie są śledzone w v1.

## Przechwytywanie linków

Delegowany listener `click` (capture) na `document`:
- znajdź `a[href]` przez `closest()`;
- ignoruj: modyfikatory (ctrl/meta/shift/alt), `target="_blank"`, `download`,
  `href` zewnętrzny (inny origin) lub kotwiczny `#`, prawy przycisk;
- jeśli zbiór brudnych niepusty → `preventDefault()` + `stopPropagation()`,
  zapamiętaj docelowy `href`, otwórz dialog.

`beforeunload`: gdy brudne — `e.preventDefault()` (natywny prompt przeglądarki).

## Dialog

Nowy komponent w pliku guarda, wzorowany na `ConfirmDialog`
(`useModal`, `role="alertdialog"`, `aria-describedby`, focus-trap, klik w tło
= „Zostań"). Teksty PL (panel admina jest tylko polski):
- Tytuł: **„Niezapisane zmiany"**
- Treść: **„Masz niezapisane zmiany. Co chcesz zrobić?"**
- Przyciski: **„Zostań"** (secondary), **„Zapisz i wyjdź"** (primary),
  **„Wyjdź bez zapisywania"** (destrukcyjny, czerwony akcent).

## „Zapisz i wyjdź"

1. Dla każdej brudnej jednostki: `form.requestSubmit()` (formularze — odpala
   walidację natywną i akcję edytora) lub `saveButton.click()` (sekcje —
   pierwszy `[data-guard-save]` w kontenerze).
2. Czekaj na zakończenie zapisów: pętla poll co 150 ms, max 10 s. Przed
   wyzwoleniem zapisu guard robi migawkę stanów `disabled` przycisków w
   jednostce; sygnał „trwa zapis" = przycisk, który był aktywny w migawce,
   a teraz jest `disabled` (edytory blokują przyciski na czas `useTransition`;
   migawka eliminuje przyciski disabled z innych powodów, np. „wybierz status").
   Warunek zakończenia: dwa kolejne odczyty bez takiej różnicy.
3. Po zakończeniu:
   - jeśli w DOM widoczny `[data-toast-type="error"]` → **zostań** (użytkownik
     widzi błąd; dialog zamknięty);
   - jeśli walidacja natywna zatrzymała submit (jednostka nadal brudna) →
     **zostań**;
   - inaczej → wyczyść zbiór, `router.push(zapamiętany href)`.
4. Timeout 10 s → zostań (bez nawigacji w ciemno).

Wymaga: `ToastView` w `app/admin/_shared.tsx` dostaje
`data-toast-type={toast.type}` (1 linia, wspólny plik wszystkich edytorów).

## Pliki

| Plik | Zmiana |
|------|--------|
| `app/admin/UnsavedChangesGuard.tsx` | **NOWY** — cała logika: delegacja zdarzeń, zbiór brudnych, przechwytywanie linków, beforeunload, dialog, zapisz-i-wyjdź |
| `app/admin/unsaved-guard-core.ts` | **NOWY** — czyste funkcje testowalne bez DOM-mocków: klasyfikacja zdarzeń (czy oznaczyć brudne), klasyfikacja linku (czy przechwycić), decyzja po zapisie (nawiguj/zostań) |
| `app/admin/AdminShell.tsx` | montaż `<UnsavedChangesGuard>` (1 linia) |
| `app/admin/_shared.tsx` | `data-toast-type` na ToastView (1 linia) |
| 6 edytorów bez form (lista wyżej) | `data-guard-section` na kontener + `data-guard-save` na przycisk(i) zapisu |
| `app/admin/zamowienia/page.tsx` | `data-guard-ignore` na formularzu wyszukiwarki |

## Testowanie

- **Vitest (unit):** `unsaved-guard-core` — czy zdarzenie oznacza brudne
  (form/sekcja/plik/ignore), czy link podlega przechwyceniu (wewnętrzny,
  modyfikatory, blank, kotwica, inny origin), decyzja po zapisie (błąd-toast /
  nadal brudne / czysto), reguły czyszczenia.
- **Playwright (lokalnie, build produkcyjny):** edycja pola produktu → klik
  w sidebar → dialog widoczny; „Zostań" → zostaje z wpisaną wartością;
  „Wyjdź bez zapisywania" → nawigacja, wartość porzucona; „Zapisz i wyjdź" →
  wartość zapisana w DB + nawigacja; wyszukiwarka zamówień → brak dialogu;
  submit „Zapisz" → potem klik linku → brak dialogu.

## Poza zakresem (świadomie)

- Przycisk „wstecz" przeglądarki (popstate).
- Zmiany bez zdarzeń input/change (drag-reorder zdjęć).
- Publiczna część sklepu (guard montowany tylko w AdminShell).
- Tłumaczenie dialogu na DE (panel admina jest polskojęzyczny).
