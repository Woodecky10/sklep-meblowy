// Czysta logika próbek tkanin: wycena i klucz tożsamości darmowej puli.
// BEZ importów serwerowych (next/cache, next/headers, server-only) — ten moduł
// jest importowany wartościami z komponentu klienckiego SampleForm.tsx.
// I/O żyje w samples.ts, który ma `import "server-only"` jako guard.

// Ile próbek jest darmowych w oknie 12 miesięcy. Jedno źródło prawdy: baza
// (claim_free_samples) i front muszą mówić tę samą liczbę.
export const SAMPLE_FREE_LIMIT = 3;

// Cena każdej próbki ponad darmową pulę, w złotych. Dostawa jest zawsze
// darmowa i NIE wchodzi do tej kwoty.
export const SAMPLE_UNIT_PRICE = 15;

// Jednostką jest KOLOR tkaniny, nie tkanina: sklep operuje wartościami
// „Nazwa Numer" (np. „Riviera 16"), a właścicielka wycina konkretny kolor.
export type SampleSelection = {
  fabricId: string;
  fabricName: string;
  color: string;
};

// Klucz darmowej puli. user_id nie wystarcza: założenie konta na
// jan+1@gmail.com zajmuje 30 sekund i dawałoby kolejne trzy gratisy.
export function normalizeEmailKey(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;

  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);

  // +tag jest aliasem u każdego dostawcy, który go obsługuje.
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);

  // Kropki są nieznaczące TYLKO u Google. Gdzie indziej to inne skrzynki.
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replaceAll(".", "");

  return `${local}@${domain}`;
}

// Ile sztuk zamówienia idzie z puli, a ile jest płatnych. `freeGranted` to
// liczba miejsc, które REALNIE przyznała baza — front może ją estymować, ale
// rozstrzyga wynik claim_free_samples.
export function splitFreePaid(
  count: number,
  freeGranted: number
): { free: number; paid: number } {
  const free = Math.max(0, Math.min(count, freeGranted));
  return { free, paid: Math.max(0, count - free) };
}

export function sampleOrderTotal(paidCount: number): number {
  return Math.max(0, paidCount) * SAMPLE_UNIT_PRICE;
}

// Ten sam kolor tej samej tkaniny to jedna próbka; dwa kolory tej samej
// tkaniny to dwie osobne próbki (każda liczy się do puli i do ceny).
export function dedupeSelections(items: SampleSelection[]): SampleSelection[] {
  const seen = new Set<string>();
  const out: SampleSelection[] = [];
  for (const item of items) {
    const key = `${item.fabricId}::${item.color}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
