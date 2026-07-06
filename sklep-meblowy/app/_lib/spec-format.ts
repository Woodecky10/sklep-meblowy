// Normalizacja i lokalizacja pól „Czas dostawy" (delivery_time) i „Gwarancja"
// (warranty). Oba są wolnotekstowe w DB, więc import z BaseLinkera zostawił surowe
// wartości typu "21" / "2" / "2 lat", które renderowały się dosłownie na karcie
// produktu. Te helpery kanonizują wejście do formatu "N dni roboczych" / "N lata"
// (z poprawną polską odmianą) i dają ogólny fallback DE, żeby liczbowe wartości
// spoza ręcznych map de-content-maps nie wyciekały po polsku na /de.
//
// Czyste funkcje — testowane w __tests__/spec-format.test.ts, używane przy zapisie
// (admin/produkty/actions) oraz w lokalizacji (localize.ts).

// Polska odmiana rzeczownika „rok" wg liczby: 1 → rok, 2–4 → lata, reszta → lat,
// z wyjątkiem nastek (12–14 → lat) i uwzględnieniem dziesiątek (22–24 → lata).
export function polishYearWord(n: number): "rok" | "lata" | "lat" {
  if (n === 1) return "rok";
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return "lata";
  }
  return "lat";
}

function collapse(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

// "21" | "21 dni" | "21 DNI ROBOCZYCH" → "21 dni roboczych".
// "14-21" | "14–21 dni" → "14–21 dni roboczych" (en-dash).
// Wolny tekst niepasujący do wzorca liczbowego (np. "od ręki",
// "21 dni kalendarzowych") przechodzi bez zmian.
export function normalizeDeliveryTime(raw: string): string {
  const s = collapse(raw);
  if (s === "") return "";

  const range = s.match(/^(\d+)\s*[-–—]\s*(\d+)\b\s*(.*)$/);
  if (range && isDeliveryTail(range[3])) {
    return `${range[1]}–${range[2]} dni roboczych`;
  }

  const single = s.match(/^(\d+)\b\s*(.*)$/);
  if (single && isDeliveryTail(single[2])) {
    return `${single[1]} dni roboczych`;
  }

  return s;
}

// Ogon po liczbie, który uznajemy za „dostawę w dniach roboczych": pusty,
// "dni"/"dzień", "robocze/roboczych/roboczy" lub ich kombinacja.
function isDeliveryTail(tail: string): boolean {
  const t = tail.toLowerCase().trim();
  return t === "" || /^(dni|dzień|dzien)?\s*(robocz\w*)?$/.test(t);
}

// "2" → "2 lata", "2 lat" → "2 lata", "5" → "5 lat", "1" → "1 rok".
// Wolny tekst niepasujący (np. "dożywotnia") przechodzi bez zmian.
export function normalizeWarranty(raw: string): string {
  const s = collapse(raw);
  if (s === "") return "";

  const m = s.match(/^(\d+)\b\s*(.*)$/);
  if (m) {
    const tail = m[2].toLowerCase().trim();
    if (tail === "" || /^(rok|lata|lat)$/.test(tail)) {
      const n = parseInt(m[1], 10);
      return `${n} ${polishYearWord(n)}`;
    }
  }
  return s;
}

// Ogólny fallback DE dla delivery_time: stosowany PO ręcznej mapie DELIVERY_TIME_DE
// (ręczne tłumaczenia mają pierwszeństwo). Zwraca null gdy nie rozpoznaje wzorca —
// wtedy caller robi passthrough wartości PL.
export function formatDeliveryTimeDe(pl: string): string | null {
  const s = collapse(pl);
  const range = s.match(/^(\d+)–(\d+) dni roboczych$/);
  if (range) return `${range[1]}–${range[2]} Werktage`;
  const workdays = s.match(/^(\d+) dni roboczych$/);
  if (workdays) return `${workdays[1]} Werktage`;
  const days = s.match(/^(\d+) dni$/);
  if (days) return `${days[1]} Tage`;
  return null;
}

// Ogólny fallback DE dla warranty. Niemiecki: 1 → "1 Jahr", reszta → "N Jahre".
export function formatWarrantyDe(pl: string): string | null {
  const m = collapse(pl).match(/^(\d+) (rok|lata|lat)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    return n === 1 ? `${n} Jahr` : `${n} Jahre`;
  }
  return null;
}

// Kanoniczne domyślne wartości dla NOWYCH produktów (buildNewProductPayload) —
// admin nie wpisuje ich ręcznie za każdym razem, ale może edytować (zapis
// przechodzi przez normalizeDeliveryTime/normalizeWarranty wyżej). Muszą być
// kluczami map DELIVERY_TIME_DE / WARRANTY_DE (test new-product pilnuje).
export const DEFAULT_DELIVERY_TIME = "21 dni roboczych";
export const DEFAULT_WARRANTY = "2 lata";
