# Maile transakcyjne — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sklep wysyła cztery maile transakcyjne (potwierdzenie zakupu, przesyłka w drodze, anulowanie, powiadomienie dla właścicielki) w kolorach czytanych z motywu sklepu, plus szablon HTML pod mail weryfikacyjny Supabase Auth.

**Architecture:** Nowy katalog `app/_lib/mail/` — leniwy klient Resend (brak klucza = tryb no-op), `sendMail` które nigdy nie rzuca, branding czytany ze `store_settings` przez istniejący `theme.ts`, oraz szablony jako komponenty `@react-email/components` renderowane do HTML przy wysyłce. Wysyłka zaczepiona wyłącznie w miejscach chronionych compare-and-swapem, więc idempotencja nie wymaga nowej tabeli.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase (service role), Resend, `@react-email/components`, vitest.

**Spec:** `docs/superpowers/specs/2026-07-28-maile-transakcyjne-design.md`

## Global Constraints

- **To NIE jest Next.js z treningu.** Wersja 16 ma breaking changes — przed kodem Server Component/Action sprawdź `node_modules/next/dist/docs/` (wymóg `AGENTS.md`).
- **Gotcha Turbopack:** `export type { X }` w pliku z `"use server"` wysypuje runtime. Żaden plik w `app/_lib/mail/` nie ma `"use server"` — nie dodawaj go.
- **Wysyłka nigdy nie rzuca.** Każdy błąd maila to `console.error` + `return false`. Zakup, webhook i akcja admina muszą przejść nawet gdy Resend padnie. Webhook Stripe **musi** zwrócić 200, inaczej Stripe ponawia event.
- **Brak `RESEND_API_KEY` to poprawny stan**, nie błąd — tryb „nie wysyłaj". Dzięki temu kod działa na produkcji przed założeniem konta i nie strzela mailami z lokalnego deva.
- **Żadnego adresu na sztywno w kodzie.** `MAIL_FROM`, `MAIL_REPLY_TO`, `MAIL_ADMIN_TO` wyłącznie ze `process.env`. Adresy nie są jeszcze rozstrzygnięte.
- **Maile używają tokenów `light`** z `resolveThemeTokens`. Dark mode w mailu jest nieprzewidywalny — nie próbujemy.
- **Kolory tylko jako literalne hexy, inline.** Zmienne CSS i klasy Tailwinda nie działają w kliencie pocztowym.
- **Panel admina i mail #4 są PL-only.** Maile do klienta PL/DE wg `orders.currency`.
- Bramki po każdym zadaniu: `npx tsc --noEmit` (0 błędów), `npm run lint` (0 błędów; 4 istniejące ostrzeżenia w `variants.ts` są znane i dozwolone), `npm test`, `npm run build`. Wszystko z katalogu `sklep-meblowy/`.
- Po przełączeniu gałęzi `rm -rf .next` przed buildem — stale cache daje phantom błędy.

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `app/_lib/mail/client.ts` | Konstrukcja klienta Resend z env. Brak klucza → `null`. |
| `app/_lib/mail/send.ts` | `sendMail()` — jedyne wyjście na świat. Try/catch, log, nigdy nie rzuca. |
| `app/_lib/mail/locale.ts` | `mailLocale(currency)` — język maila z waluty zamówienia. |
| `app/_lib/mail/branding.ts` | Paleta + stacki fontów. Czysta `brandingFromRaw` + IO `getMailBranding`. |
| `app/_lib/mail/status-notify.ts` | `shouldNotifyCustomer(status)` — które przejścia statusu wysyłają mail. |
| `app/_lib/mail/templates/_Layout.tsx` | Wspólna rama: nagłówek, stopka z danymi firmy, kolory, fonty. |
| `app/_lib/mail/templates/OrderConfirmation.tsx` | Mail #1 — potwierdzenie zakupu (klient). |
| `app/_lib/mail/templates/AdminNewOrder.tsx` | Mail #4 — nowe zamówienie (właścicielka, PL). |
| `app/_lib/mail/templates/OrderShipped.tsx` | Mail #2 — przesyłka w drodze (klient). |
| `app/_lib/mail/templates/OrderCancelled.tsx` | Mail #3 — anulowanie (klient). |
| `app/_lib/mail/templates/AuthConfirm.tsx` | Źródło HTML dla panelu Supabase (nie wysyłane z kodu). |
| `app/_lib/mail/notify-order.ts` | Złożenie całości: pobierz zamówienie → zbuduj HTML → wyślij. Wołane z webhooka, checkoutu i akcji admina. |
| `scripts/preview-mail.mjs` | Renderuje szablony do plików HTML do podglądu w przeglądarce. |
| `app/_lib/__tests__/mail-*.test.ts` | Testy czystej logiki (locale, branding, status-notify, sendMail). |

Modyfikowane: `app/api/webhook/route.ts`, `app/api/checkout/route.ts`, `app/admin/zamowienia/actions.ts`, `.env.example`, `package.json`, `.gitignore`.

---

### Task 1: Fundament wysyłki — klient, sendMail, env

**Files:**
- Create: `app/_lib/mail/client.ts`, `app/_lib/mail/send.ts`
- Test: `app/_lib/__tests__/mail-send.test.ts`
- Modify: `package.json` (dependency `resend`), `.env.example`

**Interfaces:**
- Consumes: nic (pierwsze zadanie).
- Produces: `getResend(): Resend | null`; `sendMail(payload: MailPayload): Promise<boolean>` gdzie `MailPayload = { to: string; subject: string; html: string }`. Zwraca `true` tylko przy faktycznie przyjętej wysyłce.

- [ ] **Step 1: Zainstaluj zależność i sprawdź nazwę pola reply-to**

```bash
npm install resend
node -e "const t=require('fs').readFileSync('./node_modules/resend/dist/index.d.ts','utf8'); console.log(t.match(/reply_?[Tt]o\??:/g))"
```

**To nie jest krok kosmetyczny.** SDK Resenda zmieniało nazwę tego pola między wersjami (`reply_to` → `replyTo`). Użyj tej, którą wypisze polecenie. Jeśli wypisze `null`, poszukaj: `grep -rn "eply" node_modules/resend/dist/index.d.ts | head`. W kodzie poniżej występuje `replyTo` — popraw, jeśli Twoja wersja ma inaczej, inaczej TypeScript to wyłapie w Step 6.

- [ ] **Step 2: Napisz failujący test**

Create `app/_lib/__tests__/mail-send.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendSpy = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendSpy };
  },
}));

import { sendMail } from "../mail/send";

const PAYLOAD = { to: "klient@example.com", subject: "Test", html: "<p>hej</p>" };

describe("sendMail", () => {
  beforeEach(() => {
    sendSpy.mockReset();
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "");
    vi.stubEnv("MAIL_REPLY_TO", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bez RESEND_API_KEY nie wysyła i nie rzuca", async () => {
    const result = await sendMail(PAYLOAD);
    expect(result).toBe(false);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("bez MAIL_FROM nie wysyła — nie zgadujemy nadawcy", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const result = await sendMail(PAYLOAD);
    expect(result).toBe(false);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("z kluczem i nadawcą wysyła i zwraca true", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAIL_FROM", "Mollien <zamowienia@mollien.pl>");
    sendSpy.mockResolvedValue({ data: { id: "abc" }, error: null });
    const result = await sendMail(PAYLOAD);
    expect(result).toBe(true);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Mollien <zamowienia@mollien.pl>",
        to: "klient@example.com",
        subject: "Test",
        html: "<p>hej</p>",
      })
    );
  });

  it("dokłada replyTo tylko gdy MAIL_REPLY_TO jest ustawione", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAIL_FROM", "Mollien <zamowienia@mollien.pl>");
    vi.stubEnv("MAIL_REPLY_TO", "kontakt@example.com");
    sendSpy.mockResolvedValue({ data: { id: "abc" }, error: null });
    await sendMail(PAYLOAD);
    expect(sendSpy.mock.calls[0][0].replyTo).toBe("kontakt@example.com");
  });

  it("błąd zwrócony przez Resend nie rzuca — zwraca false", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAIL_FROM", "Mollien <zamowienia@mollien.pl>");
    sendSpy.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    const result = await sendMail(PAYLOAD);
    expect(result).toBe(false);
  });

  it("wyjątek z SDK nie rzuca — zwraca false", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAIL_FROM", "Mollien <zamowienia@mollien.pl>");
    sendSpy.mockRejectedValue(new Error("network down"));
    const result = await sendMail(PAYLOAD);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 3: Uruchom test — musi paść**

Run: `npx vitest run app/_lib/__tests__/mail-send.test.ts`
Expected: FAIL — `Failed to resolve import "../mail/send"`.

- [ ] **Step 4: Napisz klienta**

Create `app/_lib/mail/client.ts`:

```ts
import { Resend } from "resend";

// Świadomie BEZ cache'owania instancji: konstrukcja jest tania, a cache
// utrudniałby testy (stubEnv po pierwszym wywołaniu nie miałby efektu)
// i blokował podniesienie klucza bez restartu procesu.
export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}
```

- [ ] **Step 5: Napisz sendMail**

Create `app/_lib/mail/send.ts`:

```ts
import { getResend } from "./client";

export type MailPayload = {
  to: string;
  subject: string;
  html: string;
};

// Jedyne wyjście na świat. NIGDY nie rzuca — wywoływane z webhooka Stripe
// (500 = ponowienie eventu) i z akcji admina (wyjątek = błąd w panelu).
// Zwraca true tylko gdy Resend przyjął wiadomość.
export async function sendMail(payload: MailPayload): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.info(
      `[mail] brak RESEND_API_KEY — pomijam: "${payload.subject}" -> ${payload.to}`
    );
    return false;
  }

  const from = process.env.MAIL_FROM;
  if (!from) {
    // Nadawcy nie zgadujemy: zły from = odbicie albo spam.
    console.error("[mail] brak MAIL_FROM — pomijam wysyłkę");
    return false;
  }

  const replyTo = process.env.MAIL_REPLY_TO;

  try {
    const { error } = await resend.emails.send({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) {
      console.error("[mail] Resend zwrócił błąd:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[mail] wysyłka nieudana:", err);
    return false;
  }
}
```

- [ ] **Step 6: Uruchom testy i typy**

Run: `npx vitest run app/_lib/__tests__/mail-send.test.ts && npx tsc --noEmit`
Expected: 6 testów PASS, tsc 0 błędów. Jeśli tsc zgłosi `replyTo` — popraw nazwę pola zgodnie ze Step 1 (i w teście też).

- [ ] **Step 7: Dopisz zmienne do `.env.example`**

Dopisz na końcu `.env.example`:

```
# Maile transakcyjne (Resend). Bez RESEND_API_KEY wysyłka jest wyłączona —
# kod działa, tylko loguje pominięcie. Adresy: patrz spec maili transakcyjnych.
RESEND_API_KEY=
MAIL_FROM=
MAIL_REPLY_TO=
MAIL_ADMIN_TO=
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.example app/_lib/mail/client.ts app/_lib/mail/send.ts app/_lib/__tests__/mail-send.test.ts
git commit -m "feat(mail): fundament wysylki — klient Resend + sendMail ktore nigdy nie rzuca"
```

---

### Task 2: Branding maila z motywu sklepu

**Files:**
- Create: `app/_lib/mail/branding.ts`, `app/_lib/mail/locale.ts`
- Test: `app/_lib/__tests__/mail-branding.test.ts`

**Interfaces:**
- Consumes: `normalizeThemeSettings`, `resolveThemeTokens`, `DEFAULT_FONT_PAIR`, typy `FontPairKey`/`ThemeTokens` z `app/_lib/theme.ts`.
- Produces:
  - `type MailBranding = { colors: ThemeTokens; fonts: { sans: string; display: string } }`
  - `brandingFromRaw(raw: ThemeRow | null): MailBranding` — czysta,
  - `getMailBranding(): Promise<MailBranding>` — czyta `store_settings`, przy błędzie zwraca domyślne,
  - `mailLocale(currency: string | null | undefined): "pl" | "de"`.

- [ ] **Step 1: Napisz failujące testy**

Create `app/_lib/__tests__/mail-branding.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { brandingFromRaw } from "../mail/branding";
import { mailLocale } from "../mail/locale";
import { THEME_PRESETS } from "../theme";

describe("brandingFromRaw", () => {
  it("bez wiersza store_settings daje paletę 'klasyczny' i nie rzuca", () => {
    const b = brandingFromRaw(null);
    expect(b.colors.fg).toBe(THEME_PRESETS.klasyczny.light.fg);
    expect(b.fonts.display).toContain("Playfair");
  });

  it("nadpisanie navy wygrywa nad presetem (produkcja ma czarny)", () => {
    const b = brandingFromRaw({
      theme_preset: "klasyczny",
      theme_overrides: { navy: "#000000" },
      font_pair: "inter-playfair",
    });
    expect(b.colors.fg).toBe("#000000");
    expect(b.colors.navy).toBe("#000000");
  });

  it("preset inny niż domyślny zmienia paletę", () => {
    const b = brandingFromRaw({
      theme_preset: "grafit-miedz",
      theme_overrides: {},
      font_pair: "montserrat",
    });
    expect(b.colors.gold).toBe(THEME_PRESETS["grafit-miedz"].light.gold);
    expect(b.fonts.display).toContain("Montserrat");
  });

  it("nieznana para fontów spada na domyślny stack", () => {
    const b = brandingFromRaw({
      theme_preset: "klasyczny",
      theme_overrides: {},
      font_pair: "nie-istnieje",
    });
    expect(b.fonts.display).toContain("Playfair");
  });

  it("stack fontów ma fallback dostępny wszędzie — webfontów w mailu nie ma", () => {
    const b = brandingFromRaw(null);
    expect(b.fonts.display).toContain("Georgia");
    expect(b.fonts.sans).toContain("Arial");
  });

  it("kolory są literalnymi hexami, nie zmiennymi CSS", () => {
    const b = brandingFromRaw(null);
    for (const value of Object.values(b.colors)) {
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    expect(b.fonts.sans).not.toContain("var(");
    expect(b.fonts.display).not.toContain("var(");
  });
});

describe("mailLocale", () => {
  it("eur => de (EUR występuje tylko na /de)", () => {
    expect(mailLocale("eur")).toBe("de");
  });
  it("pln => pl", () => {
    expect(mailLocale("pln")).toBe("pl");
  });
  it("wielkie litery też rozpoznaje", () => {
    expect(mailLocale("EUR")).toBe("de");
  });
  it("null / undefined / śmieci => pl (fallback)", () => {
    expect(mailLocale(null)).toBe("pl");
    expect(mailLocale(undefined)).toBe("pl");
    expect(mailLocale("usd")).toBe("pl");
  });
});
```

- [ ] **Step 2: Uruchom testy — muszą paść**

Run: `npx vitest run app/_lib/__tests__/mail-branding.test.ts`
Expected: FAIL — nie da się zaimportować `../mail/branding`.

- [ ] **Step 3: Napisz `locale.ts`**

Create `app/_lib/mail/locale.ts`:

```ts
// Język maila z waluty zamówienia. `orders` nie ma kolumny locale, ale EUR
// występuje WYŁĄCZNIE na /de (patrz sekcja EUR w ONBOARDING.md), więc waluta
// jednoznacznie wskazuje język. Dzięki temu bez migracji.
export function mailLocale(
  currency: string | null | undefined
): "pl" | "de" {
  return typeof currency === "string" && currency.toLowerCase() === "eur"
    ? "de"
    : "pl";
}
```

- [ ] **Step 4: Napisz `branding.ts`**

Create `app/_lib/mail/branding.ts`:

```ts
import { createAdminClient } from "../supabase/server";
import {
  normalizeThemeSettings,
  resolveThemeTokens,
  DEFAULT_FONT_PAIR,
  type FontPairKey,
  type ThemeTokens,
} from "../theme";

// Fontów w mailu NIE DA SIĘ wymusić: Gmail wycina @font-face, Outlook go
// ignoruje. FONT_PAIRS z theme.ts trzyma referencje `var(--font-*)`, bezużyteczne
// w mailu — dlatego osobne mapowanie na stacki z realnym fallbackiem.
// Georgia jako szeryf jest dostępna na Windows/macOS/Androidzie.
const MAIL_FONT_STACKS: Record<FontPairKey, { sans: string; display: string }> = {
  "inter-playfair": {
    sans: "Inter, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    display: "'Playfair Display', Georgia, 'Times New Roman', serif",
  },
  "lato-cormorant": {
    sans: "Lato, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    display: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  },
  montserrat: {
    sans: "Montserrat, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    display: "Montserrat, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  },
  "nunito-lora": {
    sans: "'Nunito Sans', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    display: "Lora, Georgia, 'Times New Roman', serif",
  },
};

export type MailBranding = {
  colors: ThemeTokens;
  fonts: { sans: string; display: string };
};

type ThemeRow = {
  theme_preset?: unknown;
  theme_overrides?: unknown;
  font_pair?: unknown;
};

// Czysta: surowy wiersz → gotowe tokeny. Maile używają palety `light` —
// dark mode w kliencie pocztowym jest nieprzewidywalny, nie próbujemy.
export function brandingFromRaw(raw: ThemeRow | null): MailBranding {
  const settings = normalizeThemeSettings(raw);
  const { light } = resolveThemeTokens(settings);
  return {
    colors: light,
    fonts: MAIL_FONT_STACKS[settings.fontPair] ?? MAIL_FONT_STACKS[DEFAULT_FONT_PAIR],
  };
}

// Odczyt motywu z bazy — tego samego źródła, z którego kolory bierze strona,
// żeby mail nie rozjechał się po zmianie motywu w /admin/wyglad.
// Błąd odczytu nie może zablokować maila: lepiej wysłać w domyślnej palecie.
export async function getMailBranding(): Promise<MailBranding> {
  try {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("store_settings")
      .select("theme_preset, theme_overrides, font_pair")
      .maybeSingle();
    return brandingFromRaw((data as ThemeRow | null) ?? null);
  } catch (err) {
    console.error("[mail] odczyt motywu nieudany, używam domyślnego:", err);
    return brandingFromRaw(null);
  }
}
```

- [ ] **Step 5: Uruchom testy**

Run: `npx vitest run app/_lib/__tests__/mail-branding.test.ts && npx tsc --noEmit`
Expected: 10 testów PASS, tsc 0.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/mail/branding.ts app/_lib/mail/locale.ts app/_lib/__tests__/mail-branding.test.ts
git commit -m "feat(mail): paleta i fonty maila z motywu sklepu + jezyk z waluty"
```

---

### Task 3: Wspólna rama, mail potwierdzenia zakupu i podgląd HTML

**Files:**
- Create: `app/_lib/mail/templates/_Layout.tsx`, `app/_lib/mail/templates/OrderConfirmation.tsx`, `scripts/preview-mail.mjs`
- Modify: `package.json` (dependency `@react-email/components`), `.gitignore`

**Interfaces:**
- Consumes: `MailBranding` z Task 2; `COMPANY`, `formatCompanyHeader` z `app/_lib/company.ts`; `formatOrderAmount` z `app/_lib/money.ts`; `formatVariantLabel` z `app/_lib/variants.ts`; typy `Order`, `OrderItem` z `app/_lib/types.ts`.
- Produces:
  - `MailLayout({ branding, locale, preview, heading, children })` — rama,
  - `OrderConfirmation({ order, items, branding, locale, orderUrl })` — komponent maila #1.

Renderowanie do HTML robi konsument (Task 4) przez `render()` z `@react-email/components`.

- [ ] **Step 1: Zainstaluj zależność**

```bash
npm install @react-email/components
```

- [ ] **Step 2: Napisz ramę**

Create `app/_lib/mail/templates/_Layout.tsx`:

```tsx
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { COMPANY, formatCompanyHeader } from "../../company";
import type { MailBranding } from "../branding";

// Wspólna rama wszystkich maili. Kolory i fonty WYŁĄCZNIE inline —
// klient pocztowy nie zna zmiennych CSS ani klas Tailwinda.
export function MailLayout({
  branding,
  locale,
  preview,
  heading,
  children,
}: {
  branding: MailBranding;
  locale: "pl" | "de";
  // Tekst w podglądzie skrzynki (obok tematu). Bez tego klient pokazuje
  // pierwsze słowa treści, co wygląda przypadkowo.
  preview: string;
  heading: string;
  children: React.ReactNode;
}) {
  const c = branding.colors;
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: c.bg,
          color: c.fg,
          fontFamily: branding.fonts.sans,
          margin: 0,
          padding: "24px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: c.cardBg,
            border: `1px solid ${c.border}`,
            borderRadius: "16px",
            maxWidth: "600px",
            margin: "0 auto",
            padding: "32px",
          }}
        >
          <Text
            style={{
              color: c.goldText,
              fontFamily: branding.fonts.sans,
              fontSize: "11px",
              letterSpacing: "3px",
              textTransform: "uppercase",
              margin: "0 0 8px",
            }}
          >
            {COMPANY.displayName}
          </Text>
          <Text
            style={{
              color: c.fg,
              fontFamily: branding.fonts.display,
              fontSize: "26px",
              fontWeight: 700,
              lineHeight: "1.25",
              margin: "0 0 24px",
            }}
          >
            {heading}
          </Text>

          {children}

          <Hr style={{ borderColor: c.border, margin: "32px 0 16px" }} />
          <Section>
            <Text style={{ color: c.muted, fontSize: "11px", lineHeight: "1.6", margin: 0 }}>
              {formatCompanyHeader(locale)}
            </Text>
            <Text style={{ color: c.muted, fontSize: "11px", lineHeight: "1.6", margin: "4px 0 0" }}>
              {COMPANY.domain}
              {COMPANY.phone ? ` · ${COMPANY.phone}` : ""}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 3: Napisz mail potwierdzenia**

Create `app/_lib/mail/templates/OrderConfirmation.tsx`:

```tsx
import { Button, Hr, Row, Column, Section, Text } from "@react-email/components";
import { formatOrderAmount } from "../../money";
import { formatVariantLabel } from "../../variants";
import type { Order, OrderItem } from "../../types";
import type { MailBranding } from "../branding";
import { MailLayout } from "./_Layout";

const COPY = {
  pl: {
    preview: (nr: number) => `Zamówienie #${nr} przyjęte`,
    heading: "Dziękujemy za zamówienie",
    intro: (nr: number) =>
      `Przyjęliśmy Twoje zamówienie numer #${nr}. Poniżej podsumowanie.`,
    items: "Zamówione produkty",
    products: "Produkty",
    bundleDiscount: "Rabat za zestaw",
    promoDiscount: "Rabat",
    totalPaid: "Zapłacono",
    totalCod: "Do zapłaty przy odbiorze",
    address: "Adres dostawy",
    cta: "Zobacz zamówienie",
    next: "Skontaktujemy się telefonicznie, aby ustalić termin dostawy.",
    variantsFor: "Wybrane opcje",
    notes: "Uwagi",
  },
  de: {
    preview: (nr: number) => `Bestellung #${nr} angenommen`,
    heading: "Vielen Dank für Ihre Bestellung",
    intro: (nr: number) =>
      `Wir haben Ihre Bestellung Nummer #${nr} erhalten. Hier ist die Zusammenfassung.`,
    items: "Bestellte Produkte",
    products: "Produkte",
    bundleDiscount: "Set-Rabatt",
    promoDiscount: "Rabatt",
    totalPaid: "Bezahlt",
    totalCod: "Bei Lieferung zu zahlen",
    address: "Lieferadresse",
    cta: "Bestellung ansehen",
    next: "Wir rufen Sie an, um den Liefertermin zu vereinbaren.",
    variantsFor: "Gewählte Optionen",
    notes: "Anmerkungen",
  },
} as const;

export function OrderConfirmation({
  order,
  items,
  branding,
  locale,
  orderUrl,
}: {
  order: Order;
  items: OrderItem[];
  branding: MailBranding;
  locale: "pl" | "de";
  orderUrl: string;
}) {
  const t = COPY[locale];
  const c = branding.colors;
  const cur = order.currency;
  const isCod = order.payment_method === "cod";

  const subtotal = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
  const bundleDiscount = Number(order.bundle_discount ?? 0);
  const promoDiscount = Number(order.promo_discount ?? 0);
  const addr = order.shipping_address;

  const rowStyle = { color: c.muted, fontSize: "13px", margin: "0 0 4px" };
  const labelStyle = {
    color: c.goldText,
    fontSize: "10px",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
    margin: "0 0 8px",
  };

  return (
    <MailLayout
      branding={branding}
      locale={locale}
      preview={t.preview(order.order_number)}
      heading={t.heading}
    >
      <Text style={{ color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 24px" }}>
        {t.intro(order.order_number)}
      </Text>

      <Text style={labelStyle}>{t.items}</Text>
      {items.map((item) => (
        <Section key={item.id} style={{ margin: "0 0 12px" }}>
          <Text style={{ color: c.fg, fontSize: "14px", fontWeight: 600, margin: 0 }}>
            {item.product?.name ?? "Produkt"}
            {item.bundle_label ? ` (${item.bundle_label})` : ""}
          </Text>
          {item.variant_values && (
            <Text style={rowStyle}>
              {t.variantsFor}: {formatVariantLabel(item.variant_values, locale)}
            </Text>
          )}
          {item.notes && (
            <Text style={rowStyle}>
              {t.notes}: {item.notes}
            </Text>
          )}
          <Text style={rowStyle}>
            {item.quantity} × {formatOrderAmount(Number(item.price), cur)}
          </Text>
        </Section>
      ))}

      <Hr style={{ borderColor: c.border, margin: "16px 0" }} />

      <Row>
        <Column>
          <Text style={rowStyle}>{t.products}</Text>
        </Column>
        <Column align="right">
          <Text style={rowStyle}>{formatOrderAmount(subtotal, cur)}</Text>
        </Column>
      </Row>
      {bundleDiscount > 0 && (
        <Row>
          <Column>
            <Text style={rowStyle}>{t.bundleDiscount}</Text>
          </Column>
          <Column align="right">
            <Text style={rowStyle}>−{formatOrderAmount(bundleDiscount, cur)}</Text>
          </Column>
        </Row>
      )}
      {promoDiscount > 0 && (
        <Row>
          <Column>
            <Text style={rowStyle}>{t.promoDiscount}</Text>
          </Column>
          <Column align="right">
            <Text style={rowStyle}>−{formatOrderAmount(promoDiscount, cur)}</Text>
          </Column>
        </Row>
      )}
      <Row>
        <Column>
          <Text style={{ color: c.fg, fontSize: "15px", fontWeight: 700, margin: "8px 0 0" }}>
            {isCod ? t.totalCod : t.totalPaid}
          </Text>
        </Column>
        <Column align="right">
          <Text style={{ color: c.fg, fontSize: "15px", fontWeight: 700, margin: "8px 0 0" }}>
            {formatOrderAmount(Number(order.total), cur)}
          </Text>
        </Column>
      </Row>

      <Hr style={{ borderColor: c.border, margin: "24px 0 16px" }} />

      <Text style={labelStyle}>{t.address}</Text>
      <Text style={{ color: c.fg, fontSize: "13px", lineHeight: "1.6", margin: "0 0 24px" }}>
        {addr?.fullname ? `${addr.fullname}, ` : ""}
        {addr?.street}, {addr?.postal_code} {addr?.city}
      </Text>

      <Text style={{ color: c.muted, fontSize: "13px", lineHeight: "1.6", margin: "0 0 24px" }}>
        {t.next}
      </Text>

      <Button
        href={orderUrl}
        style={{
          backgroundColor: c.gold,
          borderRadius: "8px",
          color: c.navy,
          fontFamily: branding.fonts.sans,
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "2px",
          padding: "12px 24px",
          textDecoration: "none",
          textTransform: "uppercase",
        }}
      >
        {t.cta}
      </Button>
    </MailLayout>
  );
}
```

- [ ] **Step 4: Napisz skrypt podglądu**

Create `scripts/preview-mail.mjs`:

```js
// Renderuje szablony maili do plików HTML, żeby obejrzeć je w przeglądarce
// bez zakładania konta Resend i bez wysyłania czegokolwiek.
// Uruchom z katalogu sklep-meblowy/:
//   npx tsx scripts/preview-mail.mjs
// Wynik: mail-preview/*.html (katalog gitignorowany).
import { mkdirSync, writeFileSync } from "node:fs";
import { render } from "@react-email/components";
import { brandingFromRaw } from "../app/_lib/mail/branding.ts";
import { OrderConfirmation } from "../app/_lib/mail/templates/OrderConfirmation.tsx";

const OUT = "mail-preview";
mkdirSync(OUT, { recursive: true });

// Paleta z produkcji: preset "klasyczny" z navy nadpisanym na czarny.
const branding = brandingFromRaw({
  theme_preset: "klasyczny",
  theme_overrides: { navy: "#000000", cream: "#ffffff" },
  font_pair: "inter-playfair",
});

const order = {
  id: "11111111-1111-1111-1111-111111111111",
  order_number: 1042,
  currency: "pln",
  total: 7480,
  promo_discount: 200,
  bundle_discount: 320,
  payment_method: "online",
  status: "paid",
  shipping_address: {
    fullname: "Anna Kowalska",
    street: "Kwiatowa 12/3",
    postal_code: "61-001",
    city: "Poznań",
    country: "Polska",
    phone: "+48 600 700 800",
  },
  carrier: "Transport Mollien",
  tracking_number: "MOL-2026-0042",
};

const items = [
  {
    id: "i1",
    quantity: 1,
    price: 5900,
    variant_values: { Tkanina: "Astoria 05", "Kolor nóżek": "Czarny" },
    notes: "Proszę o kontakt dzień przed dostawą.",
    bundle_label: null,
    product: { name: "Narożnik VEGAS L" },
  },
  {
    id: "i2",
    quantity: 2,
    price: 1090,
    variant_values: { Tkanina: "Montes 12" },
    notes: null,
    bundle_label: "Zestaw salon",
    product: { name: "Puf MONTES" },
  },
];

const cases = [
  {
    name: "order-confirmation-pl",
    el: OrderConfirmation({
      order, items, branding, locale: "pl",
      orderUrl: "https://www.mollien.pl/konto/zamowienia/" + order.id,
    }),
  },
  {
    name: "order-confirmation-de",
    el: OrderConfirmation({
      order: { ...order, currency: "eur", total: 1720 },
      items, branding, locale: "de",
      orderUrl: "https://www.mollien.pl/de/konto/zamowienia/" + order.id,
    }),
  },
  {
    name: "order-confirmation-cod",
    el: OrderConfirmation({
      order: { ...order, payment_method: "cod" },
      items, branding, locale: "pl",
      orderUrl: "https://www.mollien.pl/konto/zamowienia/" + order.id,
    }),
  },
];

for (const c of cases) {
  const html = await render(c.el);
  writeFileSync(`${OUT}/${c.name}.html`, html, "utf8");
  console.log(`OK ${OUT}/${c.name}.html`);
}
```

Dopisz do `.gitignore` (w `sklep-meblowy/.gitignore`, obok `/e2e/screens`):

```
/mail-preview
```

- [ ] **Step 5: Wyrenderuj i sprawdź typy**

Run:
```bash
npx tsc --noEmit
npx tsx scripts/preview-mail.mjs
```
Expected: tsc 0 błędów; trzy pliki w `mail-preview/`.

Jeśli `tsx` nie jest dostępny (`npx tsx` pyta o instalację), użyj `npx --yes tsx scripts/preview-mail.mjs`.

- [ ] **Step 6: Weryfikacja wizualna**

Otwórz każdy plik i zrób zrzut — Playwright jest w repo, sesja nie jest potrzebna (to lokalny plik):

```bash
npx playwright screenshot --viewport-size=700,1400 "file://$(pwd)/mail-preview/order-confirmation-pl.html" mail-preview/pl.png
npx playwright screenshot --viewport-size=700,1400 "file://$(pwd)/mail-preview/order-confirmation-de.html" mail-preview/de.png
npx playwright screenshot --viewport-size=700,1400 "file://$(pwd)/mail-preview/order-confirmation-cod.html" mail-preview/cod.png
```

Sprawdź na zrzutach: tło i ramka w kolorach z `theme_overrides` (czarny tekst, biała karta), nagłówek szeryfowy, kwoty w PLN w wariancie PL i w EUR w DE, wariant COD ma „Do zapłaty przy odbiorze" zamiast „Zapłacono", rabaty widoczne tylko gdy > 0. **Pokaż zrzuty użytkownikowi przed przejściem dalej** — to jedyny moment, w którym wygląd da się zakwestionować tanio.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore app/_lib/mail/templates/_Layout.tsx app/_lib/mail/templates/OrderConfirmation.tsx scripts/preview-mail.mjs
git commit -m "feat(mail): rama maila + potwierdzenie zakupu + skrypt podgladu HTML"
```

---

### Task 4: Wysyłka przy zakupie — klient i właścicielka

**Files:**
- Create: `app/_lib/mail/templates/AdminNewOrder.tsx`, `app/_lib/mail/notify-order.ts`
- Modify: `app/api/webhook/route.ts:119-125` (obszar po `claimedFirst`), `app/api/checkout/route.ts` (po `createOrder`)

**Interfaces:**
- Consumes: `sendMail` (Task 1), `getMailBranding`/`mailLocale` (Task 2), `MailLayout`/`OrderConfirmation` (Task 3), `getOrderById` z `app/_lib/orders.ts`.
- Produces: `notifyOrderPlaced(orderId: string): Promise<void>` — nigdy nie rzuca; wysyła mail #1 do klienta i mail #4 do właścicielki.

- [ ] **Step 1: Napisz mail dla właścicielki**

Create `app/_lib/mail/templates/AdminNewOrder.tsx`:

```tsx
import { Button, Hr, Text } from "@react-email/components";
import { formatOrderAmount } from "../../money";
import { formatVariantLabel } from "../../variants";
import type { Order, OrderItem } from "../../types";
import type { MailBranding } from "../branding";
import { MailLayout } from "./_Layout";

// Zawsze PL — panel admina jest PL-only.
export function AdminNewOrder({
  order,
  items,
  branding,
  customerEmail,
  adminUrl,
}: {
  order: Order;
  items: OrderItem[];
  branding: MailBranding;
  customerEmail: string;
  adminUrl: string;
}) {
  const c = branding.colors;
  const cur = order.currency;
  const addr = order.shipping_address;
  const rowStyle = { color: c.muted, fontSize: "13px", margin: "0 0 4px" };

  return (
    <MailLayout
      branding={branding}
      locale="pl"
      preview={`Nowe zamówienie #${order.order_number} — ${formatOrderAmount(Number(order.total), cur)}`}
      heading={`Nowe zamówienie #${order.order_number}`}
    >
      <Text style={{ color: c.fg, fontSize: "15px", fontWeight: 700, margin: "0 0 16px" }}>
        {formatOrderAmount(Number(order.total), cur)}
        {order.payment_method === "cod" ? " — za pobraniem" : " — opłacone online"}
      </Text>

      <Text style={rowStyle}>Klient: {addr?.fullname ?? "—"} ({customerEmail})</Text>
      <Text style={rowStyle}>Telefon: {addr?.phone ?? "brak"}</Text>
      <Text style={rowStyle}>
        Adres: {addr?.street}, {addr?.postal_code} {addr?.city}
      </Text>

      <Hr style={{ borderColor: c.border, margin: "16px 0" }} />

      {items.map((item) => (
        <Text key={item.id} style={rowStyle}>
          {item.quantity} × {item.product?.name ?? "Produkt"}
          {item.variant_values ? ` — ${formatVariantLabel(item.variant_values, "pl")}` : ""}
          {item.notes ? ` — uwagi: ${item.notes}` : ""}
        </Text>
      ))}

      <Hr style={{ borderColor: c.border, margin: "16px 0 24px" }} />

      <Button
        href={adminUrl}
        style={{
          backgroundColor: c.gold,
          borderRadius: "8px",
          color: c.navy,
          fontFamily: branding.fonts.sans,
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "2px",
          padding: "12px 24px",
          textDecoration: "none",
          textTransform: "uppercase",
        }}
      >
        Otwórz w panelu
      </Button>
    </MailLayout>
  );
}
```

- [ ] **Step 2: Napisz `notify-order.ts`**

Create `app/_lib/mail/notify-order.ts`:

```ts
import { render } from "@react-email/components";
import { getOrderById } from "../orders";
import { getMailBranding } from "./branding";
import { mailLocale } from "./locale";
import { sendMail } from "./send";
import { OrderConfirmation } from "./templates/OrderConfirmation";
import { AdminNewOrder } from "./templates/AdminNewOrder";

// Adres klienta: gość ma guest_email, zalogowany — email z profiles.
async function customerEmailOf(order: {
  guest_email: string | null;
  user_id: string | null;
}): Promise<string | null> {
  if (order.guest_email) return order.guest_email;
  if (!order.user_id) return null;
  const { getProfilesByIds } = await import("../orders");
  const profiles = await getProfilesByIds([order.user_id]);
  return profiles[order.user_id]?.email ?? null;
}

// Maile po złożeniu zamówienia: potwierdzenie do klienta + powiadomienie do
// właścicielki. NIGDY nie rzuca — wołane z webhooka Stripe (500 = ponowienie
// eventu) i z /api/checkout (wyjątek = zepsuty zakup).
// Idempotencja NIE jest tu pilnowana: wołaj tylko z miejsc chronionych CAS-em
// (markOrderPaid dla online, jednorazowe utworzenie zamówienia dla COD).
export async function notifyOrderPlaced(orderId: string): Promise<void> {
  try {
    const order = await getOrderById(orderId);
    const items = order.items ?? [];
    const branding = await getMailBranding();
    const locale = mailLocale(order.currency);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? `https://www.mollien.pl`;
    const prefix = locale === "de" ? "/de" : "";

    const to = await customerEmailOf(order);
    if (to) {
      const html = await render(
        OrderConfirmation({
          order,
          items,
          branding,
          locale,
          orderUrl: `${base}${prefix}/konto/zamowienia/${order.id}`,
        })
      );
      await sendMail({
        to,
        subject:
          locale === "de"
            ? `Bestellung #${order.order_number} angenommen`
            : `Zamówienie #${order.order_number} przyjęte`,
        html,
      });
    } else {
      console.error(`[mail] zamówienie ${orderId} bez adresu e-mail — pomijam`);
    }

    const adminTo = process.env.MAIL_ADMIN_TO;
    if (adminTo) {
      const html = await render(
        AdminNewOrder({
          order,
          items,
          branding,
          customerEmail: to ?? "brak",
          adminUrl: `${base}/admin/zamowienia/${order.id}`,
        })
      );
      await sendMail({
        to: adminTo,
        subject: `Nowe zamówienie #${order.order_number}`,
        html,
      });
    }
  } catch (err) {
    console.error("[mail] notifyOrderPlaced nieudane:", err);
  }
}
```

- [ ] **Step 3: Wepnij w webhook (zakup online)**

W `app/api/webhook/route.ts` dopisz import obok pozostałych:

```ts
import { notifyOrderPlaced } from "@/app/_lib/mail/notify-order";
```

Następnie, w `settlePaidOrder`, **po** bloku incrementu promo i **przed** `return NextResponse.json({ received: true })` (dziś linie 119–127), wstaw:

```ts
  // Mail tylko dla zwycięzcy CAS-a pending→paid — duplikat webhooka Stripe
  // nie wyśle drugiego potwierdzenia. notifyOrderPlaced nie rzuca, więc
  // nieudany mail nie zamieni się w 500 i ponowienie eventu.
  if (claimedFirst) {
    await notifyOrderPlaced(orderId);
  }
```

- [ ] **Step 4: Wepnij w checkout (zakup za pobraniem)**

W `app/api/checkout/route.ts` dopisz import obok pozostałych:

```ts
import { notifyOrderPlaced } from "@/app/_lib/mail/notify-order";
```

Znajdź miejsce po utworzeniu zamówienia (`const order = await createOrder({...})`) i po nim, **wyłącznie dla COD**, dodaj:

```ts
    // COD nie przechodzi przez webhook płatności, więc potwierdzenie idzie
    // tu — zamówienie właśnie powstało, więc to wywołanie jest jednorazowe.
    // Zamówienia online czekają na webhook: mail dopiero po zapłacie.
    if (isCod) {
      await notifyOrderPlaced((order as { id: string }).id);
    }
```

Jeśli w tym miejscu zmienna trzymająca wynik `createOrder` nazywa się inaczej niż `order`, użyj jej nazwy — nie zmieniaj istniejącego kodu. Warunek COD w tym pliku jest już wyliczony jako `isCod`.

- [ ] **Step 5: Bramki**

Run:
```bash
npx tsc --noEmit && npm run lint && npm test && rm -rf .next && npm run build
```
Expected: tsc 0; lint 0 błędów (4 znane ostrzeżenia); wszystkie testy PASS; build OK.

- [ ] **Step 6: Sprawdź tryb no-op na żywo**

Bez `RESEND_API_KEY` w `.env.local` uruchom dev i złóż testowe zamówienie za pobraniem:

```bash
npm run dev
```

Expected: zamówienie powstaje normalnie, a w logu dev pojawia się `[mail] brak RESEND_API_KEY — pomijam: "Zamówienie #… przyjęte" -> …`. **Zakup nie może się wywalić** — to jest właściwy test tego zadania.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/mail/templates/AdminNewOrder.tsx app/_lib/mail/notify-order.ts app/api/webhook/route.ts app/api/checkout/route.ts
git commit -m "feat(mail): potwierdzenie zakupu do klienta + powiadomienie do wlascicielki"
```

---

### Task 5: Maile przy zmianie statusu — wysłane i anulowane

**Files:**
- Create: `app/_lib/mail/status-notify.ts`, `app/_lib/mail/templates/OrderShipped.tsx`, `app/_lib/mail/templates/OrderCancelled.tsx`
- Modify: `app/admin/zamowienia/actions.ts:59-69` (CAS + wysyłka), `app/_lib/mail/notify-order.ts` (dodanie `notifyStatusChange`)
- Test: `app/_lib/__tests__/mail-status-notify.test.ts`

**Interfaces:**
- Consumes: `OrderStatus` z `app/_lib/types.ts`; `sendMail`, `getMailBranding`, `mailLocale`, `getOrderById`, `MailLayout`.
- Produces: `shouldNotifyCustomer(status: OrderStatus): boolean`; `notifyStatusChange(orderId: string, status: OrderStatus): Promise<void>` — nigdy nie rzuca.

- [ ] **Step 1: Napisz failujący test reguły**

Create `app/_lib/__tests__/mail-status-notify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldNotifyCustomer } from "../mail/status-notify";

describe("shouldNotifyCustomer", () => {
  it("shipped wysyła — o tym klient musi wiedzieć", () => {
    expect(shouldNotifyCustomer("shipped")).toBe(true);
  });

  it("cancelled wysyła — dziś klient nie dowiedziałby się w żaden sposób", () => {
    expect(shouldNotifyCustomer("cancelled")).toBe(true);
  });

  it("processing NIE wysyła — to klik gaszący licznik nowych zamowien (PR #100)", () => {
    expect(shouldNotifyCustomer("processing")).toBe(false);
  });

  it("paid NIE wysyła — koliduje z mailem o zakupie z webhooka", () => {
    expect(shouldNotifyCustomer("paid")).toBe(false);
  });

  it("delivered NIE wysyła — decyzja 2026-07-28", () => {
    expect(shouldNotifyCustomer("delivered")).toBe(false);
  });

  it("pending NIE wysyła", () => {
    expect(shouldNotifyCustomer("pending")).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom test — musi paść**

Run: `npx vitest run app/_lib/__tests__/mail-status-notify.test.ts`
Expected: FAIL — nie da się zaimportować `../mail/status-notify`.

- [ ] **Step 3: Napisz regułę**

Create `app/_lib/mail/status-notify.ts`:

```ts
import type { OrderStatus } from "../types";

// Które przejścia statusu wysyłają mail do klienta. Reguła wyciągnięta
// osobno, żeby dała się przetestować bez bazy i bez Resenda.
//
// Świadomie POZA listą:
// - `processing` — ten status admin ustawia, żeby zabrać zamówienie do
//   realizacji, czyli tym samym klikiem gasi licznik nowych zamówień
//   (PR #100). Mail tutaj strzelałby do klienta przy każdym odhaczeniu.
//   Dodatkowo createOrder nadaje `processing` zamówieniom COD od razu.
// - `paid` — webhook ustawia go sekundy po zakupie; potwierdzenie zakupu
//   JEST powiadomieniem o tym statusie.
// - `delivered` — przy meblach klient kwituje odbiór u kierowcy.
const NOTIFY_STATUSES: OrderStatus[] = ["shipped", "cancelled"];

export function shouldNotifyCustomer(status: OrderStatus): boolean {
  return NOTIFY_STATUSES.includes(status);
}
```

- [ ] **Step 4: Uruchom test — musi przejść**

Run: `npx vitest run app/_lib/__tests__/mail-status-notify.test.ts`
Expected: 6 testów PASS.

- [ ] **Step 5: Napisz szablon „przesyłka w drodze"**

Create `app/_lib/mail/templates/OrderShipped.tsx`:

```tsx
import { Button, Text } from "@react-email/components";
import type { Order } from "../../types";
import type { MailBranding } from "../branding";
import { MailLayout } from "./_Layout";

const COPY = {
  pl: {
    preview: (nr: number) => `Zamówienie #${nr} jest w drodze`,
    heading: "Twoje zamówienie jest w drodze",
    intro: (nr: number) => `Zamówienie #${nr} zostało przekazane do transportu.`,
    carrier: "Przewoźnik",
    tracking: "Numer śledzenia",
    phone: "Firma transportowa skontaktuje się telefonicznie, aby ustalić termin dostawy.",
    cta: "Zobacz zamówienie",
  },
  de: {
    preview: (nr: number) => `Bestellung #${nr} ist unterwegs`,
    heading: "Ihre Bestellung ist unterwegs",
    intro: (nr: number) => `Bestellung #${nr} wurde an den Transport übergeben.`,
    carrier: "Spediteur",
    tracking: "Sendungsnummer",
    phone: "Die Spedition ruft Sie an, um den Liefertermin zu vereinbaren.",
    cta: "Bestellung ansehen",
  },
} as const;

export function OrderShipped({
  order,
  branding,
  locale,
  orderUrl,
}: {
  order: Order;
  branding: MailBranding;
  locale: "pl" | "de";
  orderUrl: string;
}) {
  const t = COPY[locale];
  const c = branding.colors;
  const labelStyle = {
    color: c.goldText,
    fontSize: "10px",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
    margin: "0 0 4px",
  };

  return (
    <MailLayout
      branding={branding}
      locale={locale}
      preview={t.preview(order.order_number)}
      heading={t.heading}
    >
      <Text style={{ color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 24px" }}>
        {t.intro(order.order_number)}
      </Text>

      {order.carrier && (
        <>
          <Text style={labelStyle}>{t.carrier}</Text>
          <Text style={{ color: c.fg, fontSize: "14px", margin: "0 0 16px" }}>
            {order.carrier}
          </Text>
        </>
      )}
      {order.tracking_number && (
        <>
          <Text style={labelStyle}>{t.tracking}</Text>
          <Text style={{ color: c.fg, fontSize: "14px", margin: "0 0 16px" }}>
            {order.tracking_number}
          </Text>
        </>
      )}

      <Text style={{ color: c.muted, fontSize: "13px", lineHeight: "1.6", margin: "8px 0 24px" }}>
        {t.phone}
      </Text>

      <Button
        href={orderUrl}
        style={{
          backgroundColor: c.gold,
          borderRadius: "8px",
          color: c.navy,
          fontFamily: branding.fonts.sans,
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "2px",
          padding: "12px 24px",
          textDecoration: "none",
          textTransform: "uppercase",
        }}
      >
        {t.cta}
      </Button>
    </MailLayout>
  );
}
```

- [ ] **Step 6: Napisz szablon „anulowane"**

Create `app/_lib/mail/templates/OrderCancelled.tsx`:

```tsx
import { Text } from "@react-email/components";
import { formatOrderAmount } from "../../money";
import type { Order } from "../../types";
import type { MailBranding } from "../branding";
import { MailLayout } from "./_Layout";

const COPY = {
  pl: {
    preview: (nr: number) => `Zamówienie #${nr} zostało anulowane`,
    heading: "Zamówienie anulowane",
    intro: (nr: number) => `Zamówienie #${nr} zostało anulowane.`,
    // Nie obiecujemy automatycznego zwrotu — zwroty robi się ręcznie
    // po stronie operatora płatności (patrz spec).
    refund: (amount: string) =>
      `Zamówienie było opłacone (${amount}). Skontaktujemy się z Tobą w sprawie zwrotu środków.`,
    questions: "Jeśli to pomyłka albo masz pytania — odpowiedz na tę wiadomość.",
  },
  de: {
    preview: (nr: number) => `Bestellung #${nr} wurde storniert`,
    heading: "Bestellung storniert",
    intro: (nr: number) => `Bestellung #${nr} wurde storniert.`,
    refund: (amount: string) =>
      `Die Bestellung war bezahlt (${amount}). Wir melden uns bei Ihnen wegen der Rückerstattung.`,
    questions: "Falls das ein Versehen ist oder Sie Fragen haben — antworten Sie auf diese E-Mail.",
  },
} as const;

export function OrderCancelled({
  order,
  branding,
  locale,
  wasPaid,
}: {
  order: Order;
  branding: MailBranding;
  locale: "pl" | "de";
  // Czy zamówienie było opłacone PRZED anulowaniem — status jest już
  // "cancelled", więc tej informacji nie da się odczytać z samego zamówienia.
  wasPaid: boolean;
}) {
  const t = COPY[locale];
  const c = branding.colors;

  return (
    <MailLayout
      branding={branding}
      locale={locale}
      preview={t.preview(order.order_number)}
      heading={t.heading}
    >
      <Text style={{ color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 16px" }}>
        {t.intro(order.order_number)}
      </Text>
      {wasPaid && (
        <Text style={{ color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 16px" }}>
          {t.refund(formatOrderAmount(Number(order.total), order.currency))}
        </Text>
      )}
      <Text style={{ color: c.muted, fontSize: "13px", lineHeight: "1.6", margin: 0 }}>
        {t.questions}
      </Text>
    </MailLayout>
  );
}
```

- [ ] **Step 7: Dodaj `notifyStatusChange` do `notify-order.ts`**

Dopisz na końcu `app/_lib/mail/notify-order.ts` (importy `OrderShipped`, `OrderCancelled`, `shouldNotifyCustomer` dodaj u góry pliku):

```ts
// Mail po zmianie statusu. `previousStatus` służy tylko do rozpoznania, czy
// anulowane zamówienie było wcześniej opłacone — po CAS-ie status w bazie to
// już "cancelled". Nigdy nie rzuca.
export async function notifyStatusChange(
  orderId: string,
  status: OrderStatus,
  previousStatus: OrderStatus
): Promise<void> {
  if (!shouldNotifyCustomer(status)) return;
  try {
    const order = await getOrderById(orderId);
    const branding = await getMailBranding();
    const locale = mailLocale(order.currency);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? `https://www.mollien.pl`;
    const prefix = locale === "de" ? "/de" : "";
    const to = order.guest_email ?? (await customerEmailOf(order));
    if (!to) {
      console.error(`[mail] zamówienie ${orderId} bez adresu e-mail — pomijam`);
      return;
    }
    const orderUrl = `${base}${prefix}/konto/zamowienia/${order.id}`;

    if (status === "shipped") {
      const html = await render(
        OrderShipped({ order, branding, locale, orderUrl })
      );
      await sendMail({
        to,
        subject:
          locale === "de"
            ? `Bestellung #${order.order_number} ist unterwegs`
            : `Zamówienie #${order.order_number} jest w drodze`,
        html,
      });
      return;
    }

    // cancelled — jedyny pozostały status z shouldNotifyCustomer
    const wasPaid = previousStatus !== "pending";
    const html = await render(
      OrderCancelled({ order, branding, locale, wasPaid })
    );
    await sendMail({
      to,
      subject:
        locale === "de"
          ? `Bestellung #${order.order_number} wurde storniert`
          : `Zamówienie #${order.order_number} zostało anulowane`,
      html,
    });
  } catch (err) {
    console.error("[mail] notifyStatusChange nieudane:", err);
  }
}
```

Dodaj też `import type { OrderStatus } from "../types";` u góry pliku.

- [ ] **Step 8: Utwardź CAS i wepnij wysyłkę w akcję admina**

W `app/admin/zamowienia/actions.ts` dopisz import:

```ts
import { notifyStatusChange } from "@/app/_lib/mail/notify-order";
```

Następnie zamień blok CAS w `updateOrderStatus` (dziś linie 59–69) na:

```ts
  // CAS po odczytanym statusie — nie nadpisujemy równoległej zmiany.
  // `.select("id")` jest tu KONIECZNE: bez niego `error` jest null także gdy
  // update trafił 0 wierszy (przegrany wyścig), a wtedy wysłalibyśmy maila
  // o zmianie, której to wywołanie nie dokonało.
  const { data: updated, error } = await supabase
    .from("orders")
    .update({ status: to, status_updated_at: new Date().toISOString() } as never)
    .eq("id", orderId)
    .eq("status", from)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Status zmienił się w innej sesji — odśwież stronę" };
  }

  // Tylko zwycięzca CAS-a wysyła maila. Funkcja nie rzuca, więc nieudany
  // mail nie zamieni udanej zmiany statusu w błąd w panelu.
  await notifyStatusChange(orderId, to, from);

  revalidatePath(`/admin/zamowienia/${orderId}`);
  revalidatePath("/admin/zamowienia");
  return { ok: true, message: "Status zaktualizowany" };
```

- [ ] **Step 9: Dopisz szablony do podglądu i obejrzyj**

W `scripts/preview-mail.mjs` dodaj importy `OrderShipped` i `OrderCancelled` oraz trzy przypadki do tablicy `cases`:

```js
  {
    name: "order-shipped-pl",
    el: OrderShipped({
      order, branding, locale: "pl",
      orderUrl: "https://www.mollien.pl/konto/zamowienia/" + order.id,
    }),
  },
  {
    name: "order-shipped-de",
    el: OrderShipped({
      order: { ...order, currency: "eur" }, branding, locale: "de",
      orderUrl: "https://www.mollien.pl/de/konto/zamowienia/" + order.id,
    }),
  },
  {
    name: "order-cancelled-paid-pl",
    el: OrderCancelled({ order, branding, locale: "pl", wasPaid: true }),
  },
  {
    name: "order-cancelled-unpaid-pl",
    el: OrderCancelled({ order, branding, locale: "pl", wasPaid: false }),
  },
```

Run:
```bash
npx tsx scripts/preview-mail.mjs
npx playwright screenshot --viewport-size=700,1000 "file://$(pwd)/mail-preview/order-shipped-pl.html" mail-preview/shipped-pl.png
npx playwright screenshot --viewport-size=700,1000 "file://$(pwd)/mail-preview/order-cancelled-paid-pl.html" mail-preview/cancelled-paid.png
npx playwright screenshot --viewport-size=700,1000 "file://$(pwd)/mail-preview/order-cancelled-unpaid-pl.html" mail-preview/cancelled-unpaid.png
```

Sprawdź: mail „w drodze" pokazuje przewoźnika i numer śledzenia; wariant anulowania **bez** opłaty nie zawiera akapitu o zwrocie środków. Pokaż zrzuty użytkownikowi.

- [ ] **Step 10: Bramki**

Run:
```bash
npx tsc --noEmit && npm run lint && npm test && rm -rf .next && npm run build
```
Expected: wszystko zielone; łączna liczba testów wzrosła o 6 z tego zadania.

- [ ] **Step 11: Commit**

```bash
git add app/_lib/mail/status-notify.ts app/_lib/mail/templates/OrderShipped.tsx app/_lib/mail/templates/OrderCancelled.tsx app/_lib/mail/notify-order.ts app/admin/zamowienia/actions.ts app/_lib/__tests__/mail-status-notify.test.ts scripts/preview-mail.mjs
git commit -m "feat(mail): maile o wyslaniu i anulowaniu + utwardzenie CAS w updateOrderStatus"
```

---

### Task 6: Mail weryfikacyjny Supabase Auth

**Files:**
- Create: `app/_lib/mail/templates/AuthConfirm.tsx`, `docs/maile-konfiguracja.md`
- Modify: `scripts/preview-mail.mjs`

**Interfaces:**
- Consumes: `MailLayout`, `brandingFromRaw`.
- Produces: komponent `AuthConfirm({ branding, locale, confirmationUrl })`. **Nie jest wysyłany z kodu** — jego HTML wkleja człowiek do panelu Supabase.

- [ ] **Step 1: Napisz szablon**

Create `app/_lib/mail/templates/AuthConfirm.tsx`:

```tsx
import { Button, Text } from "@react-email/components";
import type { MailBranding } from "../branding";
import { MailLayout } from "./_Layout";

const COPY = {
  pl: {
    preview: "Potwierdź swój adres e-mail",
    heading: "Potwierdź adres e-mail",
    intro:
      "Dziękujemy za utworzenie konta. Kliknij przycisk poniżej, aby potwierdzić adres e-mail i aktywować konto.",
    cta: "Potwierdź adres",
    ignore:
      "Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość — nic się nie stanie.",
  },
  de: {
    preview: "Bestätigen Sie Ihre E-Mail-Adresse",
    heading: "E-Mail-Adresse bestätigen",
    intro:
      "Danke für die Registrierung. Klicken Sie unten, um Ihre E-Mail-Adresse zu bestätigen und das Konto zu aktivieren.",
    cta: "Adresse bestätigen",
    ignore:
      "Falls Sie kein Konto angelegt haben, ignorieren Sie diese Nachricht — es passiert nichts.",
  },
} as const;

// UWAGA: ten szablon NIE jest wysyłany z kodu. Supabase trzyma szablony maili
// Auth w konfiguracji projektu (panel: Auth → Email Templates), nie w repo.
// Źródło zostaje tutaj, żeby dało się je wersjonować i odtworzyć — procedura
// wklejenia w docs/maile-konfiguracja.md.
export function AuthConfirm({
  branding,
  locale,
  confirmationUrl,
}: {
  branding: MailBranding;
  locale: "pl" | "de";
  confirmationUrl: string;
}) {
  const t = COPY[locale];
  const c = branding.colors;

  return (
    <MailLayout
      branding={branding}
      locale={locale}
      preview={t.preview}
      heading={t.heading}
    >
      <Text style={{ color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 24px" }}>
        {t.intro}
      </Text>
      <Button
        href={confirmationUrl}
        style={{
          backgroundColor: c.gold,
          borderRadius: "8px",
          color: c.navy,
          fontFamily: branding.fonts.sans,
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "2px",
          padding: "12px 24px",
          textDecoration: "none",
          textTransform: "uppercase",
        }}
      >
        {t.cta}
      </Button>
      <Text style={{ color: c.muted, fontSize: "12px", lineHeight: "1.6", margin: "24px 0 0" }}>
        {t.ignore}
      </Text>
    </MailLayout>
  );
}
```

- [ ] **Step 2: Wygeneruj HTML z placeholderem Supabase**

W `scripts/preview-mail.mjs` dodaj import `AuthConfirm` i przypadek, w którym adres to **dosłownie placeholder Supabase** — po wyrenderowaniu HTML jest gotowy do wklejenia:

```js
  {
    name: "auth-confirm-pl",
    el: AuthConfirm({
      branding,
      locale: "pl",
      // Placeholder Supabase — po wyrenderowaniu zostaje w HTML dosłownie
      // i to Supabase podstawia pod niego prawdziwy link.
      confirmationUrl: "{{ .ConfirmationURL }}",
    }),
  },
```

Run: `npx tsx scripts/preview-mail.mjs`

Sprawdź, że `{{ .ConfirmationURL }}` przeżył render i nie został zakodowany na `%7B%7B`:

```bash
grep -c "{{ .ConfirmationURL }}" mail-preview/auth-confirm-pl.html
```
Expected: `1` lub więcej. **Jeśli 0** — `render()` zakodował nawiasy w atrybucie `href`. Wtedy w skrypcie po renderze podmień znacznik:

```js
const html = (await render(c.el)).replaceAll(
  encodeURI("{{ .ConfirmationURL }}"),
  "{{ .ConfirmationURL }}"
);
```

- [ ] **Step 3: Zrób zrzut do akceptacji**

Run:
```bash
npx playwright screenshot --viewport-size=700,800 "file://$(pwd)/mail-preview/auth-confirm-pl.html" mail-preview/auth-confirm.png
```

Pokaż użytkownikowi.

- [ ] **Step 4: Napisz instrukcję konfiguracji**

Create `docs/maile-konfiguracja.md`:

```markdown
# Maile transakcyjne — konfiguracja (kroki po stronie człowieka)

Kod jest gotowy i działa w trybie no-op bez klucza. Żeby maile zaczęły
wychodzić, trzeba wykonać poniższe kroki. Bez nich sklep nie wysyła nic i
tylko loguje pominięcie — nic się nie psuje.

## 1. Konto Resend i weryfikacja domeny

1. Konto na resend.com (darmowy plan: 3000 maili/mies., 100/dzień).
2. Add Domain → `mollien.pl`. Resend wygeneruje rekordy DKIM/SPF.
3. Rekordy wklej w panelu **home.pl** — tam jest strefa DNS tej domeny
   (nameservery `dns.home.pl`, `dns2.home.pl`, `dns3.home.pl`).
   **Nie szukaj DNS w Vercelu** — Vercel jest tylko celem rekordów
   (`www` → CNAME na `*.vercel-dns-017.com`, apex → A `216.198.79.1`).
4. W Resend kliknij Verify. Propagacja zwykle kilka minut.
5. API Keys → utwórz klucz do wysyłki.

## 2. Zmienne środowiskowe (Vercel → Settings → Environment Variables)

| Zmienna | Przykład | Uwagi |
|---|---|---|
| `RESEND_API_KEY` | `re_...` | sekret, nigdy do repo |
| `MAIL_FROM` | `Mollien <zamowienia@mollien.pl>` | domena musi być zweryfikowana w Resend |
| `MAIL_REPLY_TO` | adres, który KTOŚ CZYTA | patrz ostrzeżenie niżej |
| `MAIL_ADMIN_TO` | adres właścicielki | tam idzie „Nowe zamówienie" |

> ⚠️ **Na `mollien.pl` nie ma poczty.** Sprawdzone 2026-07-28: zero rekordów MX.
> Wysyłanie działa (SPF/DKIM dotyczą tylko wychodzących), ale **odpowiedź klienta
> na maila odbije się** — brak MX oznacza fallback na rekord A, a tam stoi Vercel
> bez serwera SMTP. Dlatego `MAIL_REPLY_TO` musi wskazywać skrzynkę, która
> realnie odbiera. W `app/_lib/company.ts` jako kontakt sklepu figuruje już
> `mollien.shop@gmail.com` — to naturalny kandydat. Alternatywa: założyć skrzynkę
> na domenie w home.pl i dodać rekordy MX.

## 3. Mail weryfikacyjny konta (Supabase)

Ten szablon **nie żyje w repo** — Supabase trzyma go w konfiguracji projektu.

1. Panel Supabase → **Authentication → SMTP Settings**: włącz custom SMTP i
   wpisz dane SMTP z Resenda. Zdejmuje to limit kilku maili na godzinę
   wbudowanego mailera i wypuszcza wiadomość z waszym DKIM.
2. Wygeneruj HTML: z katalogu `sklep-meblowy/` uruchom
   `npx tsx scripts/preview-mail.mjs`, weź `mail-preview/auth-confirm-pl.html`.
3. Panel Supabase → **Authentication → Email Templates → Confirm signup**:
   wklej zawartość pliku. Znacznik `{{ .ConfirmationURL }}` musi zostać
   nietknięty — Supabase podstawia pod niego prawdziwy link.
4. Zarejestruj konto testowe i sprawdź, że mail dochodzi, wygląda jak sklep,
   a link aktywuje konto.

Źródło szablonu: `app/_lib/mail/templates/AuthConfirm.tsx`. Po każdej zmianie
tego pliku trzeba powtórzyć kroki 2–3 — panel Supabase nie aktualizuje się sam.

## 4. Test końcowy po uzbrojeniu

1. Złóż testowe zamówienie za pobraniem → klient dostaje „Zamówienie przyjęte",
   właścicielka „Nowe zamówienie".
2. W panelu zmień status na **Wysłane** → klient dostaje „w drodze"
   z przewoźnikiem i numerem śledzenia.
3. Na innym zamówieniu ustaw **Anulowane** → klient dostaje „anulowane".
4. Ustaw status **W realizacji** → **żaden mail nie powinien wyjść**. To
   celowe: ten klik gasi licznik nowych zamówień w panelu.
```

- [ ] **Step 5: Bramki i commit**

Run:
```bash
npx tsc --noEmit && npm run lint && npm test && rm -rf .next && npm run build
```
Expected: wszystko zielone.

```bash
git add app/_lib/mail/templates/AuthConfirm.tsx docs/maile-konfiguracja.md scripts/preview-mail.mjs
git commit -m "feat(mail): szablon maila weryfikacyjnego + instrukcja konfiguracji Resend/Supabase"
```

---

## Self-review — pokrycie spec

| Wymaganie ze spec | Zadanie |
|---|---|
| Mail #1 potwierdzenie zakupu (online + COD) | Task 3 (szablon), Task 4 (wpięcie w webhook i checkout) |
| Mail #2 `shipped` z przewoźnikiem i trackingiem | Task 5 |
| Mail #3 `cancelled`, bez obiecywania automatycznego zwrotu | Task 5 (`wasPaid`, treść „skontaktujemy się w sprawie zwrotu") |
| Mail #4 do właścicielki, PL-only | Task 4 |
| Przebranding maila weryfikacyjnego Supabase | Task 6 |
| Paleta z `store_settings`, nie zaszyta | Task 2 (`brandingFromRaw` + test na nadpisaniu navy) |
| Fonty ze stackiem fallback, bez webfontów | Task 2 (`MAIL_FONT_STACKS` + test na Georgia/Arial) |
| Język z `orders.currency`, bez migracji | Task 2 (`mailLocale` + testy) |
| Idempotencja na istniejących CAS-ach | Task 4 (`claimedFirst`), Task 5 (`.select("id")` + sprawdzenie liczby wierszy) |
| Brak klucza = tryb no-op | Task 1 (test), Task 4 Step 6 (weryfikacja na żywo) |
| Wysyłka nigdy nie rzuca | Task 1 (dwa testy: błąd Resenda i wyjątek SDK) |
| Cztery zmienne env + `.env.example` | Task 1 Step 7, Task 6 (dokumentacja) |
| Testy: locale, branding, sendMail, reguła statusów | Task 1, Task 2, Task 5 |
| Bez testów renderu szablonów (brak jsdom/RTL) | Zamiast nich podgląd HTML + zrzuty: Task 3 Step 6, Task 5 Step 9, Task 6 Step 3 |

**Spójność nazw** sprawdzona: `sendMail`/`MailPayload` (T1) → używane w T4/T5; `brandingFromRaw`/`getMailBranding`/`MailBranding` (T2) → T3/T4/T5/T6; `mailLocale` (T2) → T4/T5; `MailLayout` (T3) → wszystkie szablony; `notifyOrderPlaced` (T4) i `notifyStatusChange` (T5) w jednym pliku `notify-order.ts`; `shouldNotifyCustomer` (T5) używane tylko w `notifyStatusChange`.

**Znane ryzyko przeniesione do kroków, nie pominięte:** nazwa pola reply-to w SDK Resenda (T1 Step 1) i możliwe zakodowanie `{{ .ConfirmationURL }}` przez `render()` (T6 Step 2). Oba mają w planie polecenie sprawdzające i wariant naprawczy.
