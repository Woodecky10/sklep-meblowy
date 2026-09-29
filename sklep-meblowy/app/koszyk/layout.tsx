import type { Metadata } from "next";
import { getLocale } from "@/app/_lib/i18n-server";

// page.tsx koszyka jest komponentem klienckim, a metadata wolno eksportować
// tylko z serwera — tytuł karty przeglądarki ustawia więc ten layout.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: locale === "de" ? "Warenkorb" : "Koszyk" };
}

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
