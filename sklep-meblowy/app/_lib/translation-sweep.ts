export type SweepResult = {
  scanned: number;
  translated: number;
  failed: number;
  backlog: boolean;
};

// items: partia wierszy do przetłumaczenia (już pobrana z DB z LIMIT).
// translateOne: tłumaczy+zapisuje jeden wiersz (rzuca przy błędzie).
// limitReached: czy DB zwróciło dokładnie LIMIT (czyli prawdopodobnie jest więcej).
export async function runTranslationSweep<T>(
  items: T[],
  translateOne: (item: T) => Promise<void>,
  opts: { limitReached?: boolean } = {}
): Promise<SweepResult> {
  let translated = 0;
  let failed = 0;
  for (const item of items) {
    try {
      await translateOne(item);
      translated++;
    } catch {
      failed++;
    }
  }
  return { scanned: items.length, translated, failed, backlog: opts.limitReached ?? false };
}
