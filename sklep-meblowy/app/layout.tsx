import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./_components/layout/ThemeProvider";
import Navbar from "./_components/layout/Navbar";
import Footer from "./_components/layout/Footer";
import { CartProvider } from "./_context/CartContext";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
});

const playfair = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: {
    default: "Meble Premium | Sklep Meblowy",
    template: "%s | Meble Premium",
  },
  description:
    "Odkryj kolekcję eleganckich mebli premium. Kanapy, łóżka, fotele i pufy najwyższej jakości.",
  keywords: ["meble", "kanapy", "łóżka", "fotele", "sklep meblowy"],
  openGraph: {
    type: "website",
    locale: "pl_PL",
    siteName: "Meble Premium",
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
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </CartProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
