// ============================================================
// Dane firmy – jedno źródło prawdy.
// UZUPEŁNIJ PRZED URUCHOMIENIEM PRODUKCJI (wymagane do regulaminu, P24, faktur).
// Wartości tymczasowe oznaczone jako "DO UZUPEŁNIENIA" nie mogą trafić na produkcję.
// ============================================================

export const COMPANY = {
  // Pełna nazwa firmy / JDG (jak w CEIDG/KRS)
  legalName: "LOGAN KAMIL DERKACZ",

  // Nazwa handlowa sklepu (używana w metadanych, tytułach, emailach, regulaminie)
  brandName: "Mollien",

  // Wizualne logo wyświetlane w Navbar (może różnić się od brandName)
  displayName: "MOLLIEN.PL",

  // Adres rejestrowy
  address: {
    street: "Dworzyszcze 4",
    postalCode: "63-630",
    city: "Rychtal",
    country: "Polska",
  },

  // Identyfikatory prawne
  nip: "6192055737",
  regon: "521700369",
  // Jeśli JDG – CEIDG; jeśli sp. z o.o. – KRS. Zostaw null jeśli nie dotyczy.
  krs: null as string | null,

  // Kontakt z klientami
  email: "mollien.shop@gmail.com",
  // Format: "+48 XXX XXX XXX"
  phone: "+48 789 826 403" as string | null,

  // Godziny kontaktu (wyświetlane w /kontakt)
  contactHours: "pon.–pt., 9:00–17:00",

  // Domena sklepu (bez protokołu i trailing slash)
  domain: "mollien.pl",

  // Rachunek bankowy – do zwrotów (opcjonalny, możemy też prosić klienta o podanie w formularzu zwrotu)
  bankAccount: null as string | null,

  // Rok założenia (do stopki i "O nas")
  foundedYear: 2026,
} as const;

// Helper — czy pole zostało uzupełnione (nie jest placeholder-em).
// Przyjmuje argument jako `string`, żeby TypeScript nie zawęził typu do
// literału (przy `as const` na obiekcie COMPANY).
export function isFilled(v: string | null | undefined): boolean {
  if (!v) return false;
  const s: string = v;
  return !s.startsWith("DO UZUPEŁNIENIA");
}

// Sformatowany pełny adres – używany w regulaminie i polityce prywatności
export function formatFullAddress(): string {
  const a = COMPANY.address;
  return `${a.street}, ${a.postalCode} ${a.city}, ${a.country}`;
}

// Sformatowane dane rejestrowe – stopka dokumentów
export function formatCompanyHeader(): string {
  const parts = [
    COMPANY.legalName,
    formatFullAddress(),
    `NIP: ${COMPANY.nip}`,
  ];
  if (isFilled(COMPANY.regon)) parts.push(`REGON: ${COMPANY.regon}`);
  if (COMPANY.krs) parts.push(`KRS: ${COMPANY.krs}`);
  return parts.join(" | ");
}
