import { describe, it, expect } from "vitest";
import {
  buildSizeOptions,
  pickGroupKey,
  groupKeyBase,
  buildGroupKey,
  sizeLabelOf,
} from "@/app/_lib/size-groups";

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

describe("pickGroupKey", () => {
  it("oba puste → nowy klucz", () => {
    expect(pickGroupKey(null, null, "nowy-123")).toBe("nowy-123");
  });
  it("tylko bieżący ma grupę → jego klucz", () => {
    expect(pickGroupKey("aktualny", null, "nowy-123")).toBe("aktualny");
  });
  it("tylko target ma grupę → klucz targetu (bieżący adoptuje)", () => {
    expect(pickGroupKey(null, "target-grp", "nowy-123")).toBe("target-grp");
  });
  it("oba mają różne grupy → wygrywa bieżący (merge do niego)", () => {
    expect(pickGroupKey("aktualny", "target-grp", "nowy-123")).toBe("aktualny");
  });
  it("oba mają tę samą grupę → ta sama (no-op)", () => {
    expect(pickGroupKey("wspolny", "wspolny", "nowy-123")).toBe("wspolny");
  });
});

describe("groupKeyBase / buildGroupKey", () => {
  it("slug z nazwy: lowercase, spacje → myślnik", () => {
    expect(groupKeyBase("Marbella Boxspring")).toBe("marbella-boxspring");
  });
  it("cyfry zachowane, znaki specjalne → myślnik, bez skrajnych myślników", () => {
    expect(groupKeyBase("Vegas 120x200!")).toBe("vegas-120x200");
  });
  it("polskie znaki → poprawny slug (tylko [a-z0-9-], bez skrajnych myślników)", () => {
    expect(groupKeyBase("Łóżko Gold")).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
  it("sam separator → 'grupa'", () => {
    expect(groupKeyBase("———")).toBe("grupa");
  });
  it("buildGroupKey łączy bazę i sufiks", () => {
    expect(buildGroupKey("Marbella", "7f3a")).toBe("marbella-7f3a");
  });
  it("ucina do maks 40 znaków, bez końcowego myślnika, poprawny slug", () => {
    const long =
      "Bardzo Dluga Nazwa Produktu Ktora Znacznie Przekracza Limit Czterdziestu Znakow";
    const s = groupKeyBase(long);
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
    expect(s).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});

describe("sizeLabelOf", () => {
  it("zwraca size_label po trim", () => {
    expect(sizeLabelOf({ size_label: "  140×200 cm  ", name: "Łóżko" })).toBe(
      "140×200 cm"
    );
  });
  it("fallback do nazwy gdy label pusty/whitespace/null", () => {
    expect(sizeLabelOf({ size_label: "   ", name: "Łóżko A" })).toBe("Łóżko A");
    expect(sizeLabelOf({ size_label: null, name: "Łóżko B" })).toBe("Łóżko B");
  });
});
