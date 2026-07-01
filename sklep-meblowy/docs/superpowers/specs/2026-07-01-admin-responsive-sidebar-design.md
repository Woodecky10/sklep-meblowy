# Responsywny panel admina: zwijany sidebar + drobne poprawki

Data: 2026-07-01

## Problem

- `app/admin/layout.tsx`: sidebar to statyczny `<aside class="w-64 shrink-0">`
  bez breakpointów → na tablecie/telefonie zabiera 256 px i miażdży treść.
- Select zmiany statusu (`OrderControls`) używa `inputCls` (`w-full`) → na
  szerszej karcie rozciąga się na całość, wygląda źle.
- Padding treści `px-8` stały — na mobile za ciasno.

Panel publiczny ma już wzorzec responsywny (`MobileMenu.tsx`: `lg:hidden`
hamburger + drawer + useState).

## Zakres

### 1. Zwijany sidebar
- Wydzielić prezentację do klienckiego `app/admin/AdminShell.tsx`.
  `layout.tsx` zostaje serwerowy (pobiera usera + `newIssues`), przekazuje
  `userEmail`, `newIssues`, `children` do `AdminShell`.
- `NAV_ITEMS` (z ikonami) przenieść do `AdminShell` (klient). `signOut` (server
  action) importowany i użyty w `<form action={signOut}>` w kliencie (dozwolone).
- **lg+**: sidebar statyczny jak dziś (`hidden lg:flex`, `w-64`).
- **< lg**: górny pasek (`lg:hidden`, `sticky top-0 z-30`) z logo + hamburger.
  Sidebar jako drawer: `fixed inset-y-0 left-0 z-50 w-64 transition-transform
  ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static`.
  Backdrop `lg:hidden fixed inset-0 bg-black/40 z-40` (klik zamyka).
- Zamknięcie drawera: klik w link, klik w backdrop, zmiana ścieżki
  (`usePathname` w efekcie). Hamburger swap ikony (menu/X) jak w MobileMenu.

### 2. Padding treści responsywny
`max-w-6xl mx-auto px-8 py-10` → `px-4 sm:px-6 lg:px-8 py-6 lg:py-10`.

### 3. Status — koniec rozciągania
Select statusu w `OrderControls`: `w-full sm:w-64` (pełna szerokość na mobile,
rozsądna na desktopie). Badge'y bez zmian. Sprawdzić pozostałe selecty.

## Uwagi

- Żadna strona admina nie zakłada sztywnego `ml-`/`pl-` pod sidebar (sprawdzone)
  — drawer/overlay nic nie zepsuje.
- Dostępność: hamburger `aria-label`, `aria-expanded`; drawer zamykalny.

## Testy / weryfikacja

- Build + lint + istniejące 278 testów zielone.
- To zmiany CSS/layout — bez nowej czystej logiki do testu jednostkowego.
- Ręcznie: sprawdzić wąski viewport (drawer, hamburger, backdrop) i szeroki
  (sidebar statyczny bez zmian).

## Poza zakresem (YAGNI)

- Zapamiętywanie stanu zwinięcia na desktopie (sidebar na lg+ zawsze widoczny).
- Przeprojektowanie nawigacji/treści stron admina.
