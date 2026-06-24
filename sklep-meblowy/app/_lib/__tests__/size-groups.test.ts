import { describe, it, expect } from "vitest";
import { buildSizeOptions } from "@/app/_lib/size-groups";

const siblings = [
  { id: "c", size_label: "180×200 cm", name: "Łóżko 180" },
  { id: "a", size_label: "140×200 cm", name: "Łóżko 140" },
  { id: "b", size_label: "160×200 cm", name: "Łóżko 160" },
];

describe("buildSizeOptions", () => {
  it("sortuje naturalnie po etykiecie (140 < 160 < 180) niezależnie od kolejności wejścia", () => {
    const out = buildSizeOptions(siblings, "a");
    expect(out.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("oznacza dokładnie jeden bieżący produkt flagą current", () => {
    const out = buildSizeOptions(siblings, "b");
    expect(out.find((o) => o.current)?.id).toBe("b");
    expect(out.filter((o) => o.current)).toHaveLength(1);
  });

  it("zwraca [] gdy mniej niż 2 pozycje (jedna aukcja = brak selektora)", () => {
    expect(
      buildSizeOptions([{ id: "a", size_label: "140×200 cm", name: "X" }], "a")
    ).toEqual([]);
  });

  it("fallback etykiety do nazwy gdy size_label puste/whitespace/null", () => {
    const out = buildSizeOptions(
      [
        { id: "a", size_label: "   ", name: "Łóżko A" },
        { id: "b", size_label: null, name: "Łóżko B" },
      ],
      "a"
    );
    expect(out.find((o) => o.id === "a")?.label).toBe("Łóżko A");
    expect(out.find((o) => o.id === "b")?.label).toBe("Łóżko B");
  });
});
