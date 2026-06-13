import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./_components/layout/ThemeProvider";
import TopBar from "./_components/layout/TopBar";
import Navbar from "./_components/layout/Navbar";
import Footer from "./_components/layout/Footer";
import CookieBanner from "./_components/layout/CookieBanner";
import CartToast from "./_components/layout/CartToast";
import { CartProvider } from "./_context/CartContext";
import { ToastProvider } from "./_context/ToastContext";
import { COMPANY } from "./_lib/company";
import { getLocale } from "./_lib/i18n-server";

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

export const metadata: Metadata = {
  metadataBase: new URL(`https://${COMPANY.domain}`),
  title: {
    default: `${COMPANY.brandName} | Meble premium`,
    template: `%s | ${COMPANY.brandName}`,
  },
  description:
    "Odkryj kolekcję eleganckich mebli premium. Sofy, narożniki, łóżka, fotele i pufy najwyższej jakości.",
  keywords: ["meble", "sofy", "narożniki", "łóżka", "fotele", "sklep meblowy", COMPANY.brandName],
  openGraph: {
    type: "website",
    locale: "pl_PL",
    siteName: COMPANY.brandName,
    images: [{ url: "/logo.svg", width: 945, height: 618, alt: COMPANY.brandName }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${COMPANY.brandName} | Meble premium`,
    images: ["/logo.svg"],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${playfair.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col antialiased">
        <ThemeProvider>
          <CartProvider>
            <ToastProvider>
              <TopBar />
              <Navbar />
              <main className="flex-1">{children}</main>
              <Footer />
              <CookieBanner />
              <CartToast />
            </ToastProvider>
          </CartProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
