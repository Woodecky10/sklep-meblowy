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
import { COMPANY } from "./_lib/company";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
});

const playfair = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  variable: "--font-playfair",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pl"
      className={`${inter.variable} ${playfair.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col antialiased">
        <ThemeProvider>
          <CartProvider>
            <TopBar />
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
            <CookieBanner />
            <CartToast />
          </CartProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
