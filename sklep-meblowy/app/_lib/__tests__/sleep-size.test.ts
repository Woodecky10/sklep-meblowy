import { describe, it, expect } from "vitest";
import {
  sleepSizeOf,
  formatSleepSize,
  pickSizeMatched,
  type SizeCandidate,
} from "@/app/_lib/sleep-size";

describe("sleepSizeOf", () => {
  it("bierze size_label i normalizuje zapis", () => {
    expect(sleepSizeOf({ size_label: "160x200", name: "cokolwiek" })).toBe("160x200");
    expect(sleepSizeOf({ size_label: "160 × 200 cm", name: "cokolwiek" })).toBe("160x200");
    expect(sleepSizeOf({ size_label: "160X200", name: "cokolwiek" })).toBe("160x200");
  });

  it("pusty lub whitespace'owy size_label → fallback do nazwy", () => {
    expect(sleepSizeOf({ size_label: "   ", name: "Łóżko dziecięce Mini 90x200 cm" })).toBe("90x200");
    expect(sleepSizeOf({ size_label: null, name: "Łóżko tapicerowane Bali 160x200 ze stelażem" })).toBe("160x200");
  });

  it("śmieciowy size_label → fallback do nazwy, bez wyjątku", () => {
    expect(sleepSizeOf({ size_label: "duże", name: "Łóżko Alice 140x200 cm" })).toBe("140x200");
  });

  it("brak rozmiaru w obu polach → null", () => {
    expect(sleepSizeOf({ size_label: null, name: "Fotel Uszak" })).toBeNull();
    expect(sleepSizeOf({})).toBeNull();
  });

  it("pomija wymiary z opisu przed rozmiarem spania", () => {
    // "H3 25 cm 120x200 cm" — 25 nie łączy się z 120, bo między nimi jest "cm"
    expect(
      sleepSizeOf({ size_label: null, name: "Materac kieszeniowy Lorena Visco H3 25 cm 120x200 cm" })
    ).toBe("120x200");
  });
});

describe("formatSleepSize", () => {
  it("kanoniczne x → typograficzny × z jednostką", () => {
    expect(formatSleepSize("160x200")).toBe("160×200 cm");
  });
});

describe("pickSizeMatched", () => {
  const ORDER = ["materace", "materace-piankowe", "materace-nawierzchniowe"];

  const c = (
    id: string,
    category: string,
    size: string,
    price: number,
    sale: number | null = null
  ): SizeCandidate => ({ id, category, name: `Materac ${id}`, size_label: size, price, sale_price: sale });

  it("zostawia tylko dopasowany rozmiar", () => {
    const out = pickSizeMatched(
      [c("a", "materace", "160x200", 1000), c("b", "materace", "180x200", 1000)],
      "160x200",
      ORDER
    );
    expect(out.map((p) => p.id)).toEqual(["a"]);
  });

  it("sortuje po kolejności kategorii, dopiero potem po cenie", () => {
    const out = pickSizeMatched(
      [
        c("topper-tanszy", "materace-nawierzchniowe", "160x200", 300),
        c("kieszeniowy-drozszy", "materace", "160x200", 2000),
        c("piankowy", "materace-piankowe", "160x200", 900),
      ],
      "160x200",
      ORDER
    );
    expect(out.map((p) => p.id)).toEqual(["kieszeniowy-drozszy", "piankowy", "topper-tanszy"]);
  });

  it("w obrębie kategorii sortuje po cenie efektywnej (promocja się liczy)", () => {
    const out = pickSizeMatched(
      [
        c("regularny-1200", "materace", "160x200", 1200),
        c("przeceniony-z-2000-na-800", "materace", "160x200", 2000, 800),
      ],
      "160x200",
      ORDER
    );
    expect(out.map((p) => p.id)).toEqual(["przeceniony-z-2000-na-800", "regularny-1200"]);
  });

  it("remis cenowy rozstrzyga nazwa (sort deterministyczny)", () => {
    const out = pickSizeMatched(
      [
        { ...c("b", "materace", "160x200", 1000), name: "Materac Bali" },
        { ...c("a", "materace", "160x200", 1000), name: "Materac Alice" },
      ],
      "160x200",
      ORDER
    );
    expect(out.map((p) => p.name)).toEqual(["Materac Alice", "Materac Bali"]);
  });

  it("kategoria poza categoryOrder idzie na koniec", () => {
    const out = pickSizeMatched(
      [c("obcy", "poduszki", "160x200", 50), c("swoj", "materace", "160x200", 2000)],
      "160x200",
      ORDER
    );
    expect(out.map((p) => p.id)).toEqual(["swoj", "obcy"]);
  });

  it("brak dopasowań → pusta tablica", () => {
    expect(pickSizeMatched([c("a", "materace", "90x200", 500)], "160x200", ORDER)).toEqual([]);
  });

  it("nie mutuje wejścia", () => {
    const input = [c("b", "materace", "160x200", 2000), c("a", "materace", "160x200", 500)];
    const snapshot = input.map((p) => p.id);
    pickSizeMatched(input, "160x200", ORDER);
    expect(input.map((p) => p.id)).toEqual(snapshot);
  });
});
