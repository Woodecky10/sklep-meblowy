import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  Inter,
  Playfair_Display,
  Lato,
  Cormorant_Garamond,
  Montserrat,
  Nunito_Sans,
  Lora,
} from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./_components/layout/ThemeProvider";
import TopBar from "./_components/layout/TopBar";
import Navbar from "./_components/layout/Navbar";
import Footer from "./_components/layout/Footer";
import CookieBanner from "./_components/layout/CookieBanner";
import GoogleAnalytics from "./_components/analytics/GoogleAnalytics";
import MetaPixel from "./_components/analytics/MetaPixel";
import CartToast from "./_components/layout/CartToast";
import BackToTop from "./_components/layout/BackToTop";
import HideOnAdmin from "./_components/layout/HideOnAdmin";
import PromoBanner from "./_components/layout/PromoBanner";
import { CartProvider } from "./_context/CartContext";
import { ToastProvider } from "./_context/ToastContext";
import { ConfirmProvider } from "./_context/ConfirmContext";
import { COMPANY } from "./_lib/company";
import { getLocale } from "./_lib/i18n-server";
import { getDictionary } from "./_lib/dictionaries";
import { getEurRate } from "@/app/_lib/store-settings";
import { RateProvider } from "@/app/_lib/rate-context";
import { getFabricDeMap } from "@/app/_lib/fabrics";
import { FabricLabelProvider } from "@/app/_lib/fabric-context";
import { getThemeSettings } from "@/app/_lib/theme-settings";
import { buildThemeCss } from "@/app/_lib/theme";
import { getPromoBanner } from "@/app/_lib/promo-banner-server";
import { baseOpenGraph } from "@/app/_lib/seo-og";
import { buildOrganizationJsonLd, serializeJsonLd } from "@/app/_lib/seo-jsonld";

// Sufit czasu renderowania strony. Domyślnie funkcja może wisieć do limitu
// platformy (300 s) — 2026-08-27 strona główna zrobiła dokładnie to: jedno
// zapytanie do Supabase nie wróciło, render trwał 5 minut i skończył się 504,
// a odwiedzający przez ten czas patrzył w pustkę i widział „utracono połączenie
// z siecią" (request stxsb-1787817205243 w logach Vercela). 15 s to granica, po
// której klient ma dostać błąd i móc odświeżyć, zamiast czekać bez końca.
// Trasy API i crony mają własne, wyższe limity ustawione u siebie.
export const maxDuration = 15;

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  // 'swap' = pokaż fallback od razu, podmień gdy font dotrze. Inter ma
  // bardzo zbliżone metryki do system-ui, więc swap nie powoduje CLS.
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  variable: "--font-playfair",
  // 'swap' z explicit fallback dla mniejszego CLS — Playfair to display
  // serif z unikalnymi metrykami, ich różnica vs system serif powoduje
  // duży reflow tytułów (źródło CLS=0.202 na hero). adjustFontFallback
  // domyślnie true od 13.2 — Next.js auto-generuje fallback z size-adjust.
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

// Pary alternatywne dla /admin/wyglad. preload:false — przeglądarka pobiera
// pliki fontu dopiero, gdy motyw faktycznie go używa (via --font-*-active);
// preloadujemy tylko parę domyślną (inter/playfair wyżej). Lato NIE jest
// variable font → wymaga jawnych wag. Cormorant MA oś variable, ale podajemy
// jawne wagi świadomie — ładujemy tylko 400/600/700 (patrz docs next: font.md).
const lato = Lato({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-lato",
  display: "swap",
  preload: false,
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
  preload: false,
});

const montserrat = Montserrat({
  subsets: ["latin", "latin-ext"],
  variable: "--font-montserrat",
  display: "swap",
  preload: false,
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-nunito",
  display: "swap",
  preload: false,
});

const lora = Lora({
  subsets: ["latin", "latin-ext"],
  variable: "--font-lora",
  display: "swap",
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const title = `${COMPANY.brandName} | ${t.meta.tagline}`;
  return {
    metadataBase: new URL(`https://${COMPANY.domain}`),
    title: {
      default: title,
      template: `%s | ${COMPANY.brandName}`,
    },
    description: t.meta.description,
    keywords: [...t.meta.keywords.split(", "), COMPANY.brandName],
    // Pełny blok OG z jednego helpera — patrz seo-og.ts: Next NADPISUJE pole
    // `openGraph` w każdym segmencie, który je eksportuje, więc podstrony też
    // muszą używać baseOpenGraph, a nie dokładać pojedynczych pól.
    // Obrazek: /og (PNG 1200×630), nie /logo.svg — FB/LinkedIn nie renderują SVG.
    openGraph: baseOpenGraph(locale),
    // Weryfikacja własności w Google Search Console metodą „tag HTML".
    // To DRUGA metoda obok podstawowej: usługa jest potwierdzona rekordem TXT
    // w DNS (home.pl), i to on jest kotwicą własności właściciela sklepu —
    // ten tag dokłada kolejnego, niezależnego zweryfikowanego właściciela.
    // Usunięcie tagu = odebranie tamtego dostępu; DNS zostaje nienaruszony.
    // Pinterest (konto firmowe @mollienjulia, sekcja Katalogi) potwierdza
    // własność domeny tym samym trybem co Google — wklejonym tagiem w <head>.
    // `other` bierze dowolną nazwę meta, bo Next zna z nazwy tylko google/
    // yandex/yahoo; `p:domain_verify` nie ma tam własnego pola.
    // Tag musi ZOSTAĆ na stałe — Pinterest sprawdza go ponownie, a zniknięcie
    // cofa weryfikację (i razem z nią atrybucję Pinów oraz katalog produktów).
    verification: {
      google: "mnLaTuBcRDBEKSvjwthCGOyT_iSEURuu5V-Iq_65W7I",
      other: {
        "p:domain_verify": "55534f2d1891185a79a96a5b2a2ae2d8",
      },
    },
    twitter: {
      card: "summary_large_image",
      title,
      // Bez `images`: Next auto-uzupełnia twitter:image z openGraph.images
      // (resolve-metadata.js: `if (!hasTwImages) autoFillProps.images = openGraph.images`).
      // Podanie ich tutaj rozjeżdżałoby się z obrazkiem OG na podstronach.
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const locale = await getLocale();
  const eurRate = await getEurRate();
  const fabricMap = await getFabricDeMap();
  const themeSettings = await getThemeSettings();
  const t = getDictionary(locale);
  const promo = await getPromoBanner();
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${playfair.variable} ${lato.variable} ${cormorant.variable} ${montserrat.variable} ${nunitoSans.variable} ${lora.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col antialiased">
        {/* Organization (schema.org) — kim jest sklep: nazwa, logo, adres, NIP,
            kontakt. W layoucie, więc obecne na KAŻDEJ stronie: spina domenę z
            danymi firmy i z wizytówką Google. nonce wymagany przez CSP. */}
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(buildOrganizationJsonLd()),
          }}
        />
        {/* Motyw z /admin/wyglad — nadpisuje defaulty z globals.css
            specyficznością :root:root. SSR = zero mignięcia. CSP: style-src
            ma 'unsafe-inline' (csp.ts), nonce niepotrzebny. */}
        <style dangerouslySetInnerHTML={{ __html: buildThemeCss(themeSettings) }} />
        <ThemeProvider nonce={nonce}>
          <RateProvider rate={eurRate}>
            <FabricLabelProvider map={fabricMap}>
              <CartProvider>
                <ToastProvider>
                  <ConfirmProvider>
                    <HideOnAdmin>
                      <PromoBanner data={promo} locale={locale} closeLabel={t.common.close} />
                      {/* Wspólny sticky na oba paski — jeden element zamiast
                          dwóch osobnych sticky eliminuje 1px szczeliny przy
                          ułamkowym zoomie.
                          data-sticky-header: po tym atrybucie dymki „i"
                          (ValueInfoTip) mierzą realną wysokość nagłówka
                          (inna na mobile/desktop) i nie chowają się pod nim. */}
                      <div className="sticky top-0 z-50" data-sticky-header>
                        <TopBar />
                        <Navbar />
                      </div>
                    </HideOnAdmin>
                    <main className="flex-1">{children}</main>
                    <HideOnAdmin>
                      <Footer />
                      <CookieBanner />
                      {/* Wewnątrz HideOnAdmin celowo: panel admina nie ma
                          zaśmiecać statystyk sklepu własnym ruchem. */}
                      <GoogleAnalytics />
                      <MetaPixel />
                      <BackToTop />
                    </HideOnAdmin>
                    <CartToast />
                  </ConfirmProvider>
                </ToastProvider>
              </CartProvider>
            </FabricLabelProvider>
          </RateProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
