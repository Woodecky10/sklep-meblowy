import { stripLocale } from "./i18n";

// Czy ścieżka to karta produktu (PL lub /de)? Stopka chowa tam pasek zaufania
// (FooterTrustBar), bo karta ma własny egzemplarz pod opisem — bez dublowania.
export function isProductPath(pathname: string): boolean {
  return stripLocale(pathname).pathname.startsWith("/produkt/");
}
