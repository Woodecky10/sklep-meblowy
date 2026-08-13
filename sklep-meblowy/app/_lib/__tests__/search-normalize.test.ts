import { describe, it, expect } from "vitest";
import {
  normalizeSearchText,
  searchMatches,
  filterBySearch,
} from "@/app/_lib/search-normalize";

describe("normalizeSearchText — normalizacja frazy wyszukiwania", () => {
  it("zdejmuje polskie diakrytyki (w tym ł, które nie ma dekompozycji NFD)", () => {
    expect(normalizeSearchText("Łóżko")).toBe("lozko");
    expect(normalizeSearchText("ĄĘŚŻŹĆŃÓŁ")).toBe("aeszzcnol");
    expect(normalizeSearchText("Krzesło pikowane")).toBe("krzeslo pikowane");
  });
  it("obniża wielkość liter i tnie skrajne spacje", () => {
    expect(normalizeSearchText("  SOFA Modena  ")).toBe("sofa modena");
  });
  it("nie zmienia zwykłego ASCII i obsługuje pusty string", () => {
    expect(normalizeSearchText("fotel 123")).toBe("fotel 123");
    expect(normalizeSearchText("")).toBe("");
  });
});

describe("searchMatches — spacje i kolejność słów bez znaczenia", () => {
  it("dowolna kolejność słów", () => {
    expect(searchMatches("Narożnik VEGAS L", "vegas narożnik")).toBe(true);
  });
  it("spacje całkowicie ignorowane (obie strony)", () => {
    expect(searchMatches("Chill Me", "chillme")).toBe(true);
    expect(searchMatches("Chillme", "chill me")).toBe(true);
  });
  it("diakrytyki nieczułe", () => {
    expect(searchMatches("Łóżko Sawana", "lozko")).toBe(true);
  });
  it("wszystkie słowa muszą wystąpić", () => {
    expect(searchMatches("Sofa Modena", "sofa xyz")).toBe(false);
  });
  it("pusta / sama-spacja fraza → true (nie zawęża)", () => {
    expect(searchMatches("cokolwiek", "")).toBe(true);
    expect(searchMatches("cokolwiek", "   ")).toBe(true);
  });
});

describe("filterBySearch — odmiana jako fallback, nie domyślne dopasowanie", () => {
  const nazwy = (items: { name: string }[]) => items.map((i) => i.name);
  const pola = (p: { name: string }) => [p.name];

  it("fraza w odmienionej formie znajduje formę podstawową", () => {
    const produkty = [
      { name: "Sofa Modena" },
      { name: "Sofa Vegas" },
      { name: "Fotel Uszak" },
    ];
    expect(nazwy(filterBySearch(produkty, "sofy", pola))).toEqual([
      "Sofa Modena",
      "Sofa Vegas",
    ]);
  });

  it("dokładne trafienie WYŁĄCZA fallback — rdzeń nie dorzuca hałasu", () => {
    // Prawdziwy przypadek z katalogu: rdzeń frazy „poso" to „pos", który siedzi
    // w „pościel". Skoro POSO ma trafienia dokładne, drugi przebieg nie startuje.
    const produkty = [
      { name: "Narożnik Vegas L w POSO Sztruks" },
      { name: "Łóżko Lino z pojemnikiem na pościel" },
      { name: "Sofa Soren z pojemnikiem na pościel" },
    ];
    expect(nazwy(filterBySearch(produkty, "poso", pola))).toEqual([
      "Narożnik Vegas L w POSO Sztruks",
    ]);
  });

  it("fallback rusza dopiero przy zerze trafień dokładnych", () => {
    const produkty = [{ name: "Łóżko Lino z pojemnikiem na pościel" }];
    // „posciele" nie występuje dosłownie; rdzeń „posciel" już tak.
    expect(nazwy(filterBySearch(produkty, "posciele", pola))).toEqual([
      "Łóżko Lino z pojemnikiem na pościel",
    ]);
  });

  it("brak trafień w obu przebiegach → pusto", () => {
    const produkty = [{ name: "Sofa Modena" }];
    expect(filterBySearch(produkty, "kanapa", pola)).toEqual([]);
  });

  it("pusta fraza zwraca całą listę bez kopiowania semantyki filtra", () => {
    const produkty = [{ name: "Sofa Modena" }, { name: "Fotel Uszak" }];
    expect(filterBySearch(produkty, "", pola)).toEqual(produkty);
    expect(filterBySearch(produkty, "   ", pola)).toEqual(produkty);
  });

  it("trafienie w KTÓRYMKOLWIEK z podanych pól wystarcza", () => {
    const produkty = [
      { name: "Sofa Modena", category: "sofy-3-osobowe" },
      { name: "Fotel Uszak", category: "fotele" },
    ];
    const wynik = filterBySearch(produkty, "fotele", (p) => [
      p.name,
      p.category,
    ]);
    expect(wynik.map((p) => p.name)).toEqual(["Fotel Uszak"]);
  });

  it("puste i brakujące pola nie wywalają dopasowania", () => {
    const produkty = [
      { name: "Sofa Modena", category: null },
      { name: "", category: undefined },
    ];
    const wynik = filterBySearch(produkty, "modena", (p) => [
      p.name,
      p.category,
    ]);
    expect(wynik.map((p) => p.name)).toEqual(["Sofa Modena"]);
  });

  it("odmiana działa razem z brakiem ogonków i dowolną kolejnością słów", () => {
    const produkty = [{ name: "Łóżko tapicerowane Sawana" }];
    expect(filterBySearch(produkty, "sawana lozka", pola)).toHaveLength(1);
  });
});
