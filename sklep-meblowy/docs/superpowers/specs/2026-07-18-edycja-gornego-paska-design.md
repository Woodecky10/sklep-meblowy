# Spec: Edycja górnego paska — kontakt + baner promocyjny

Data: 2026-07-18
Status: zatwierdzony projekt (podejście A — rozszerzenie `store_settings`)

Cel: nietechniczny admin może z panelu zmienić **numer telefonu / email** (bez programisty) oraz włączyć/edytować **baner promocyjny** na samej górze strony.

Dwie części, oba przez rozszerzenie istniejącej jednowierszowej tabeli `store_settings` (jak `eur_rate`/motyw). Zero nowych tabel.

---

## Kontekst (stan obecny)

- **Górny pasek** (`app/_components/layout/TopBar.tsx`, serwerowy): po lewej email + telefon z configu `COMPANY` (`app/_lib/company.ts` — „jedno źródło prawdy", zaszyte w kodzie); po prawej **slogan** (już edytowalny: `site_texts` klucz `topbar_slogan`, PL/DE, karta w `/admin/strona-glowna`) + `LanguageSwitcher`.
- `COMPANY.phone` / `COMPANY.email` używane w: `TopBar`, `Footer`, `/kontakt`, `/regulamin` (telefon+email), `/prywatnosc` (email), `/zwroty` (email) — wszystkie komponenty/strony **serwerowe**.
- **`store_settings`** — jednowierszowa tabela globalnych ustawień (`.eq("id", true).single()`), trzyma `eur_rate`, `theme_preset`, `theme_overrides`, `font_pair`. Publiczny odczyt anon (RLS), zapis tylko admin (service role). Odczyt serwerowy przez `unstable_cache` z tagiem + fallback per wywołanie (wzorzec w `store-settings.ts` / `theme-settings.ts`).
- Layout ukrywa topbar/nawigację na `/admin` przez `HideOnAdmin`.

---

## Część 1: Kontakt edytowalny (jedno źródło prawdy)

### Model danych (migracja 56, addytywna)

Do `store_settings`:
```sql
alter table public.store_settings
  add column if not exists contact_phone text,
  add column if not exists contact_email text;
```
NULL = brak override → użyj wartości z `COMPANY`. Odczyt publiczny obejmuje nowe kolumny (RLS jest wierszowe, polityka `select` pokrywa wszystkie kolumny) — bez zmian w politykach.

### Helper `getContactInfo`

Nowy moduł `app/_lib/contact.ts` (server-only), wzorzec jak `getEurRate`:
```ts
export type ContactInfo = { phone: string | null; email: string };
export async function getContactInfo(): Promise<ContactInfo>;
```
- Cache: `unstable_cache` z tagiem `CONTACT_CACHE_TAG = "contact"`, `revalidate: 300`; wewnątrz bare anon client (bez cookies, jak eur_rate/theme).
- Zwraca `contact_phone ?? COMPANY.phone`, `contact_email ?? COMPANY.email` (puste/whitespace traktowane jak brak).
- Fallback per wywołanie: przy błędzie odczytu zwraca wartości z `COMPANY` (nie zamraża błędu w cache).
- `invalidateContactCache()` = `revalidateTag("contact")`.
- Czysta funkcja pomocnicza `pickContact(override, fallback)` wydzielona do testów (bez DB).

### Konsumenci

W każdym z tych plików: `const contact = await getContactInfo()` i podmiana `COMPANY.phone`→`contact.phone`, `COMPANY.email`→`contact.email` (zachowując istniejące formatowanie/`tel:`/`mailto:`/warunki `phone &&`):
- `app/_components/layout/TopBar.tsx`
- `app/_components/layout/Footer.tsx`
- `app/(legal)/kontakt/page.tsx`
- `app/(legal)/regulamin/page.tsx`
- `app/(legal)/prywatnosc/page.tsx`
- `app/(legal)/zwroty/page.tsx`

`COMPANY.phone`/`COMPANY.email` pozostają w configu jako fallback (i dla P24/faktur/structured-data poza zakresem tej zmiany — te dalej mogą używać `COMPANY`, bo to dane rejestrowe; zmieniamy tylko kontakt wyświetlany klientowi w wymienionych 6 miejscach).

---

## Część 2: Baner promocyjny

### Model danych (migracja 56, cd.)

```sql
alter table public.store_settings
  add column if not exists promo_enabled boolean not null default false,
  add column if not exists promo_text text,
  add column if not exists promo_text_de text,
  add column if not exists promo_link text,
  add column if not exists promo_color text not null default 'gold'
    check (promo_color in ('gold','navy','red'));
```

### Odczyt

W `app/_lib/promo.ts` (server-only), wzorzec jak theme:
```ts
export type PromoColor = "gold" | "navy" | "red";
export type PromoBannerData = {
  enabled: boolean;
  text: string | null;
  text_de: string | null;
  link: string | null;
  color: PromoColor;
};
export async function getPromoBanner(): Promise<PromoBannerData>;
```
- `unstable_cache`, tag `PROMO_CACHE_TAG = "promo"`, `revalidate: 300`, bare anon client; fallback per wywołanie → `{ enabled: false, ... }` przy błędzie (baner po prostu się nie pokaże).
- `normalizePromo(row)` czysta (waliduje kolor do dozwolonych, przycina, `enabled` tylko gdy jest niepusty tekst) — testowalna bez DB.
- `invalidatePromoCache()`.

### Komponent

- **Serwerowy** rodzic w `app/layout.tsx` (nad `<TopBar/>`, wewnątrz tego samego wrappera co topbar, żeby `HideOnAdmin` go ukrywał na `/admin`): `const promo = await getPromoBanner()`; renderuje `<PromoBanner data={promo} locale={locale} closeLabel={t.common.close} />`.
- **`app/_components/layout/PromoBanner.tsx`** ("use client"):
  - Jeśli `!data.enabled` lub brak tekstu dla locale (z fallbackiem PL) → `return null`.
  - Wybór tekstu: `locale === "de" ? (text_de?.trim() || text) : text`.
  - Dismiss: `localStorage["promo-dismissed"]` = `promoKey(text)` (krótki, deterministyczny hash treści PL — czysta funkcja, współdzielona/testowalna). Na mount: jeśli zapisany klucz === bieżący → `null`. X ustawia klucz i chowa. Zmiana tekstu przez admina → inny klucz → baner wraca. (Hydration-safe: pierwszy render pokazuje baner, `useEffect` czyta localStorage i ewentualnie chowa — bez migotania użyć `useState(false)`+efekt lub `visibility` gate; przyjmujemy prosty pattern „pokaż, po mount ukryj jeśli zdismissowany", spójny z resztą repo.)
  - Tło wg koloru: czysta mapa `PROMO_COLOR_CLASSES: Record<PromoColor, string>` (np. gold=złote tło+navy tekst, navy=navy+biały, red=`bg-red-600`+biały). Pełna szerokość, wyśrodkowany tekst, X po prawej.
  - Link: gdy `link` zaczyna się od `/` → `LocalizedLink` (prefiks `/de`); w innym wypadku `<a href target=_blank rel=noopener>`; brak linku → zwykły `<div>`. Cały baner klikalny (poza X).

### i18n

Tekst promo = wpisywany przez admina (PL/DE), bez słownika. Aria-label X: istniejący `t.common.close`. Etykiety karty admina — po polsku (hardkod, jak reszta panelu).

---

## Część 3: Admin — karta w `/admin/strona-glowna`

Nowa karta **„Górny pasek — kontakt i promocja"** (komponent `TopBarSettingsCard.tsx`, wzorzec `SiteTextsCard`):
- **Kontakt:** input „Telefon" (`contact_phone`), input „Email" (`contact_email`). Placeholder = obecna wartość domyślna z `COMPANY`; puste pole zapisane jako NULL = wartość domyślna. Podpis: „Puste = domyślny numer/email z konfiguracji. Zmiana działa w całym serwisie (pasek, stopka, kontakt, regulamin)."
- **Promocja:** checkbox „Pokaż baner promocyjny" (`promo_enabled`), input „Tekst promocji" (`promo_text`), input „Tekst promocji DE" (`promo_text_de`), input „Link (opcjonalnie)" (`promo_link`), select koloru (`promo_color`: Złoty / Navy / Czerwony).
- Zapis: server action `updateTopBarSettings(formData)` w `app/admin/strona-glowna/actions.ts`:
  - admin client → `update store_settings ... where id = true`;
  - walidacja: kolor ∈ {gold,navy,red} (inaczej `gold`), przycięcie tekstów (rozsądny limit, np. 300 zn. promo / 100 kontakt), puste stringi → NULL;
  - `enabled` zapisywane jako bool z checkboxa;
  - `invalidateContactCache()`, `invalidatePromoCache()`, `revalidatePath("/")` (layout).
- Osadzona na stronie `/admin/strona-glowna` obok istniejącej `SiteTextsCard`; dane wstępne z nowego uncached readera `getTopBarSettingsForAdmin(): Promise<{ contact_phone, contact_email, promo_enabled, promo_text, promo_text_de, promo_link, promo_color }>` (admin client, `maybeSingle`, bez cache — formularz po zapisie/refresh widzi świeży stan z DB). Placeholdery kontaktu (wartości domyślne z `COMPANY`) przekazywane do karty jako propsy z serwerowej strony.

---

## Testy

- **Unit — kontakt:** `pickContact(override, fallback)` — override niepusty → override; NULL/puste/whitespace → fallback (dla phone i email).
- **Unit — promo:** `normalizePromo(row)` — kolor spoza listy → `gold`; `enabled=true` ale pusty tekst → traktowany jako wyłączony (lub `enabled=false`); przycinanie; `link` pusty → null. `promoKey(text)` — deterministyczny, różny dla różnych tekstów, stabilny dla tego samego. `PROMO_COLOR_CLASSES` — każdy kolor mapuje na niepustą klasę.
- **Unit — akcja:** walidacja `updateTopBarSettings` (kolor z listy, puste→NULL, bool z checkboxa) — jeśli wydzielona czysta funkcja parsująca.
- **Migracja 56:** idempotentna (`add column if not exists`, `check` przez add-constraint bezpieczny na pustej kolumnie z defaultem).
- Istniejące testy (614) zielone; smoke ręczny PL + `/de`.

## Kryteria akceptacji

1. Admin w `/admin/strona-glowna` zmienia telefon → nowy numer widoczny na pasku, w stopce, na `/kontakt` i w regulaminie (PL i /de). Puste pole → wraca numer domyślny.
2. Admin zmienia email → analogicznie wszędzie.
3. Admin włącza baner z tekstem PL/DE, kolorem i linkiem → baner widoczny na górze każdej strony (poza `/admin`), we właściwym języku i kolorze, klikalny prowadzi pod link.
4. Klient zamyka baner (X) → znika i nie wraca po odświeżeniu; po zmianie tekstu przez admina → pokazuje się znów.
5. Wyłączenie banera (odznaczenie checkboxa) → baner znika ze strony.
6. Zero regresji: slogan po prawej, przełącznik języka, dane rejestrowe w dokumentach (NIP/adres) bez zmian.

## Poza zakresem

- Harmonogram promocji (od-do), wiele banerów naraz, licznik odliczający.
- Zmiana danych rejestrowych (`COMPANY.legalName/address/nip`) — to dane prawne, zostają w configu.
- Telefon/email w kontekstach P24/faktur/structured-data (dane rejestrowe) — dalej z `COMPANY`.
- Edycja sloganu (już istnieje) i tłumaczeń przez słownik.
