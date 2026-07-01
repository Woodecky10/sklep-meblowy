# Ukrycie publicznej nawigacji i stopki na /admin

Data: 2026-07-01

## Problem

Root layout (`app/layout.tsx`) renderuje wokół WSZYSTKICH tras publiczny chrome:
`TopBar`, `Navbar`, `Footer`, `CookieBanner`, `CartToast`. Panel `/admin` też go
dostaje → górny pasek, navbar sklepu, stopka i baner cookies w panelu (baner
potrafi zasłaniać treść admina).

## Rozwiązanie

Kliencki „bramkarz" `HideOnAdmin` oparty na `usePathname`, ukrywający chrome na
trasach admina. Serwerowe komponenty przekazywane jako `children` (server
components jako dzieci client component — dozwolone), bez zmiany ich natury.

### app/_components/layout/HideOnAdmin.tsx ("use client")
```tsx
const pathname = usePathname();
if (/(^|\/de)\/admin(\/|$)/.test(pathname ?? "")) return null;
return <>{children}</>;
```
Obsługuje `/admin`, `/admin/...` oraz wariant z prefiksem `/de`.

### app/layout.tsx
- `<HideOnAdmin><TopBar/><Navbar/></HideOnAdmin>`
- `<main className="flex-1">{children}</main>` (bez zmian)
- `<HideOnAdmin><Footer/><CookieBanner/></HideOnAdmin>`
- Providery (Theme/Rate/Fabric/Cart) i `CartToast` bez zmian — admin używa
  motywu i formatowania cen; CartToast w adminie się nie pokazuje.

`usePathname` działa też w SSR → brak migotania na pierwszej klatce.

## Weryfikacja

- `npm run build` + lint + 278 testów jednostkowych.
- Playwright: na `/admin` brak publicznego navbara/stopki; na `/sklep` nadal
  obecne. Lokalnie + prod.

## Poza zakresem (YAGNI)

- Przenoszenie tras do route-groups (duży refaktor).
- Zmiany w samych TopBar/Navbar/Footer.
