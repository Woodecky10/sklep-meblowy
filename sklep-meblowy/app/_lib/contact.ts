// Czysta logika kontaktu (bez zależności server-only) — importowalna też
// przez klienta. Serwerowy odczyt z DB: contact-server.ts.

export type ContactInfo = { phone: string | null; email: string };

// Override z DB (contact_phone/contact_email) gdy niepusty, inaczej fallback
// z configu COMPANY. Przycina białe znaki; puste/whitespace = brak override.
export function pickContact(
  override: string | null | undefined,
  fallback: string | null
): string | null {
  const o = typeof override === "string" ? override.trim() : "";
  return o !== "" ? o : fallback;
}
