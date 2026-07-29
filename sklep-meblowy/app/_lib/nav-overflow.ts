// Czysta arytmetyka zwijania paska nawigacji — bez DOM i bez zależności
// server-only, żeby dała się testować bez przeglądarki (wzorzec jak
// sleep-size.ts / size-groups.ts). Pomiar szerokości robi NavStrip.tsx.

// Ile pierwszych pozycji zmieści się w dostępnej szerokości, przy założeniu że
// reszta trafi do dropdownu „Więcej" — i że sam przycisk „Więcej" też zajmuje
// miejsce (razem z odstępem przed nim), więc trzeba je zarezerwować ZAWSZE gdy
// cokolwiek zostaje schowane. Pominięcie tej rezerwy było źródłem ucinania
// prawej części headera.
//
// Kolejność pozycji jest znacząca (to menu), więc przy pierwszej niemieszczącej
// się pozycji przerywamy — nie „doupychamy" węższych z dalszej części listy.
//
// available <= 0 → 0. Taka wartość oznacza brak pomiaru (pasek jeszcze niewidoczny
// albo display:none), a nie „nic się nie mieści" — decyzję, co wtedy pokazać,
// podejmuje wołający.
export function countFittingNavItems(
  widths: number[],
  available: number,
  gap: number,
  moreWidth: number
): number {
  if (widths.length === 0 || !(available > 0)) return 0;

  let fitting = 0;
  let used = 0;
  for (let k = 1; k <= widths.length; k++) {
    const w = widths[k - 1];
    // Zły pomiar (NaN/Infinity/ujemna) — przerywamy zamiast zgadywać.
    if (!Number.isFinite(w) || w < 0) break;
    used += (k > 1 ? gap : 0) + w;
    const hidesRest = k < widths.length;
    const total = used + (hidesRest ? gap + moreWidth : 0);
    if (total > available) break;
    fitting = k;
  }
  return fitting;
}
