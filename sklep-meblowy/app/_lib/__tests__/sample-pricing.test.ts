import { describe, it, expect } from "vitest";
import {
  SAMPLE_FREE_LIMIT,
  SAMPLE_UNIT_PRICE,
  normalizeEmailKey,
  splitFreePaid,
  sampleOrderTotal,
  dedupeSelections,
} from "../sample-pricing";

describe("normalizeEmailKey", () => {
  it("sprowadza do małych liter i obcina spacje", () => {
    expect(normalizeEmailKey("  Jan.Kowalski@Firma.PL ")).toBe("jan.kowalski@firma.pl");
  });

  it("dla Gmaila usuwa kropki i +tag — to najtańsza droga obejścia limitu", () => {
    expect(normalizeEmailKey("jan.kowalski+probki@gmail.com")).toBe("jankowalski@gmail.com");
    expect(normalizeEmailKey("j.a.n@googlemail.com")).toBe("jan@gmail.com");
  });

  it("poza Gmailem kropki są znaczące i zostają", () => {
    expect(normalizeEmailKey("jan.kowalski@firma.pl")).toBe("jan.kowalski@firma.pl");
  });

  it("poza Gmailem +tag też jest obcinany", () => {
    expect(normalizeEmailKey("jan+sklep@firma.pl")).toBe("jan@firma.pl");
  });

  // Ponad brief: Gmail zapisany wielkimi literami to ta sama skrzynka —
  // gdyby porównanie domeny szło po surowym tekście, „GMAIL.COM" ominąłby
  // sklejanie kropek i dałby kolejne trzy gratisy.
  it("rozpoznaje Gmaila niezależnie od wielkości liter", () => {
    expect(normalizeEmailKey("J.A.N+Tag@GMAIL.COM")).toBe("jan@gmail.com");
    expect(normalizeEmailKey("J.A.N@GoogleMail.com")).toBe("jan@gmail.com");
  });

  // Ponad brief: wejście przychodzi z formularza, więc śmieci są kwestią
  // czasu — normalizacja ma nie rzucać wyjątkiem na tekście bez „@".
  it("nie wysypuje się na tekście bez @", () => {
    expect(normalizeEmailKey("  JanKowalski ")).toBe("jankowalski");
    expect(normalizeEmailKey("")).toBe("");
  });
});

describe("splitFreePaid", () => {
  it("przy pełnej puli pierwsze trzy sztuki są darmowe", () => {
    expect(splitFreePaid(5, 3)).toEqual({ free: 3, paid: 2 });
  });

  it("gdy pula jest częściowo zużyta, płatnych jest więcej", () => {
    expect(splitFreePaid(5, 1)).toEqual({ free: 1, paid: 4 });
  });

  it("gdy pula jest wyczerpana, wszystko jest płatne", () => {
    expect(splitFreePaid(2, 0)).toEqual({ free: 0, paid: 2 });
  });

  it("nie przyznaje więcej darmowych, niż jest sztuk w zamówieniu", () => {
    expect(splitFreePaid(2, 3)).toEqual({ free: 2, paid: 0 });
  });

  it("pusty wybór nie daje nic", () => {
    expect(splitFreePaid(0, 3)).toEqual({ free: 0, paid: 0 });
  });

  // Ponad brief: drugi argument to wynik RPC z bazy — na błąd/awarię lepiej,
  // żeby liczba ujemna oznaczała „zero gratisów", a nie ujemną kwotę.
  it("ujemna liczba przyznanych miejsc nie zwiększa darmowych", () => {
    expect(splitFreePaid(2, -1)).toEqual({ free: 0, paid: 2 });
  });
});

describe("sampleOrderTotal", () => {
  it("liczy 15 zł za każdą płatną sztukę", () => {
    expect(sampleOrderTotal(0)).toBe(0);
    expect(sampleOrderTotal(2)).toBe(30);
  });

  it("dostawa nigdy nic nie dodaje — jest zawsze darmowa", () => {
    // Regresja na wypadek, gdyby ktoś kiedyś doklejał tu koszt wysyłki.
    expect(sampleOrderTotal(10)).toBe(10 * SAMPLE_UNIT_PRICE);
  });

  // Ponad brief: kwota do zapłaty nigdy nie może być ujemna, bo poszłaby
  // wprost do bramki płatności.
  it("nigdy nie zwraca kwoty ujemnej", () => {
    expect(sampleOrderTotal(-3)).toBe(0);
  });
});

describe("dedupeSelections", () => {
  it("ten sam kolor tej samej tkaniny liczy się raz", () => {
    const out = dedupeSelections([
      { fabricId: "a", fabricName: "Riviera", color: "16" },
      { fabricId: "a", fabricName: "Riviera", color: "16" },
    ]);
    expect(out).toHaveLength(1);
  });

  it("dwa różne kolory tej samej tkaniny to dwie próbki", () => {
    const out = dedupeSelections([
      { fabricId: "a", fabricName: "Riviera", color: "16" },
      { fabricId: "a", fabricName: "Riviera", color: "18" },
    ]);
    expect(out).toHaveLength(2);
  });

  // Ponad brief: numery kolorów powtarzają się między tkaninami („16" jest
  // w niejednej) — sklejenie ich po samym numerze wysłałoby klientce jedną
  // próbkę zamiast dwóch.
  it("ten sam numer koloru w dwóch tkaninach to dwie próbki", () => {
    const out = dedupeSelections([
      { fabricId: "a", fabricName: "Riviera", color: "16" },
      { fabricId: "b", fabricName: "Monolith", color: "16" },
    ]);
    expect(out).toHaveLength(2);
  });

  // Ponad brief: wynik idzie prosto na podsumowanie zamówienia, więc
  // kolejność wyboru klientki ma zostać zachowana.
  it("zachowuje kolejność i pierwsze wystąpienie", () => {
    const out = dedupeSelections([
      { fabricId: "b", fabricName: "Monolith", color: "9" },
      { fabricId: "a", fabricName: "Riviera", color: "16" },
      { fabricId: "b", fabricName: "Monolith", color: "9" },
    ]);
    expect(out).toEqual([
      { fabricId: "b", fabricName: "Monolith", color: "9" },
      { fabricId: "a", fabricName: "Riviera", color: "16" },
    ]);
  });

  it("pusty wybór daje pustą listę", () => {
    expect(dedupeSelections([])).toEqual([]);
  });
});

describe("stałe", () => {
  it("limit darmowych i cena są jednym źródłem prawdy", () => {
    expect(SAMPLE_FREE_LIMIT).toBe(3);
    expect(SAMPLE_UNIT_PRICE).toBe(15);
  });
});
