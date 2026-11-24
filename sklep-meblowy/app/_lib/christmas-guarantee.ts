// Gwarancja dostawy przed świętami 2026 (decyzja właściciela 2026-11-24).
// Zamówienie ZŁOŻONE do 30.11.2026 23:59 czasu polskiego (liczy się data
// złożenia, nie wpłaty) dojedzie przed świętami — ale tylko dla produktów,
// które w panelu mają wstążkę „PRZED ŚWIĘTAMI" albo „SZYBKA DOSTAWA".
// Osobnego pola w bazie nie ma: źródłem prawdy jest napis na wstążce
// (products.promo_badge), więc zdjęcie wstążki w panelu gasi też pasek.
//
// Czysty moduł — bez importów serwerowych, używany przez stronę produktu
// (serwer) i pasek z licznikiem (klient).

// Pierwsza chwila PO terminie: 1.12.2026 00:00 w Polsce (zimą UTC+1).
export const CHRISTMAS_DEADLINE_MS = Date.parse("2026-12-01T00:00:00+01:00");

const GUARANTEE_BADGES = ["PRZED ŚWIĘTAMI", "SZYBKA DOSTAWA"];

// Napis wpisuje człowiek w panelu — wielkość liter i przypadkowe spacje nie
// mogą decydować o tym, czy klient zobaczy gwarancję.
function normalizeBadge(badge: string): string {
  return badge.trim().replace(/\s+/g, " ").toLocaleUpperCase("pl");
}

export function hasChristmasGuarantee(
  promoBadge: string | null | undefined,
  nowMs: number
): boolean {
  if (!promoBadge) return false;
  if (nowMs >= CHRISTMAS_DEADLINE_MS) return false;
  return GUARANTEE_BADGES.includes(normalizeBadge(promoBadge));
}

// Wariant dla komponentów serwerowych: strona produktu renderuje się na każde
// żądanie (czyta nagłówki), więc „teraz" z serwera jest aktualne. Zegar jest
// czytany TU, nie w komponencie — render ma dostać gotową odpowiedź.
export function hasChristmasGuaranteeNow(promoBadge: string | null | undefined): boolean {
  return hasChristmasGuarantee(promoBadge, Date.now());
}

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

// Ile zostało do terminu; null = termin minął (pasek ma zniknąć).
export function christmasCountdown(nowMs: number): CountdownParts | null {
  const left = CHRISTMAS_DEADLINE_MS - nowMs;
  if (left <= 0) return null;
  const total = Math.floor(left / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
