// Uwagi klienta do CAŁEGO zamówienia (migracja 87). Czysty moduł — bez Supabase/Next.
export const CUSTOMER_NOTE_MAX = 1000;

export function normalizeCustomerNote(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Cięcie po jednostkach UTF-16: nie zostawiaj połówki pary zastępczej (emoji) na końcu.
  return trimmed.slice(0, CUSTOMER_NOTE_MAX).replace(/[\uD800-\uDBFF]$/, "");
}

// Bez uwag NIE wysyłamy klucza, więc insert działa także przed migracją.
export function customerNoteInsert(note: string | null): { customer_note?: string } {
  return note ? { customer_note: note } : {};
}
