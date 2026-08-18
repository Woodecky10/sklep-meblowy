import { describe, it, expect } from "vitest";
import {
  selectHomepageReviews,
  anonymizeAuthor,
  formatReviewDate,
  HOMEPAGE_REVIEWS_LIMIT,
} from "@/app/_lib/reviews-display";

// Fabryka wiersza opinii — domyślnie taka, która NA HOME WCHODZI.
// Każdy test psuje dokładnie jedno pole, więc widać, co go odrzuca.
//
// Typ jawny, NIE `Partial<Parameters<typeof selectHomepageReviews>[0][number]>`:
// tamten rozwija się do Partial<HomepageSelectable>, a więc odrzuca `id`,
// którego HomepageSelectable nie zawiera (a testy kolejności go używają).
type Row = {
  id: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  status: "pending" | "approved" | "rejected";
  homepage_excluded: boolean;
  created_at: string;
};

function opinia(over: Partial<Row> = {}): Row {
  return {
    id: "r1",
    rating: 5 as const,
    comment: "Sofa jest bardzo wygodna, tkanina trzyma się świetnie po miesiącu.",
    status: "approved" as const,
    homepage_excluded: false,
    created_at: "2026-08-10T10:00:00+00:00",
    ...over,
  };
}

describe("selectHomepageReviews", () => {
  it("przepuszcza opinię spełniającą wszystkie warunki", () => {
    expect(selectHomepageReviews([opinia()])).toHaveLength(1);
  });

  it("odrzuca opinię niezatwierdzoną", () => {
    expect(selectHomepageReviews([opinia({ status: "pending" })])).toEqual([]);
    expect(selectHomepageReviews([opinia({ status: "rejected" })])).toEqual([]);
  });

  it("odrzuca ocenę poniżej 4", () => {
    expect(selectHomepageReviews([opinia({ rating: 3 })])).toEqual([]);
  });

  it("przepuszcza ocenę dokładnie 4", () => {
    expect(selectHomepageReviews([opinia({ rating: 4 })])).toHaveLength(1);
  });

  it("odrzuca opinię wykluczoną z home, nawet z oceną 5", () => {
    expect(selectHomepageReviews([opinia({ homepage_excluded: true })])).toEqual([]);
  });

  it("odrzuca pustą treść i sam null", () => {
    expect(selectHomepageReviews([opinia({ comment: null })])).toEqual([]);
    expect(selectHomepageReviews([opinia({ comment: "   " })])).toEqual([]);
  });

  it("odrzuca treść o długości dokładnie 30 znaków (próg to WIĘCEJ niż 30)", () => {
    const c = "a".repeat(30);
    expect(selectHomepageReviews([opinia({ comment: c })])).toEqual([]);
    expect(selectHomepageReviews([opinia({ comment: c + "b" })])).toHaveLength(1);
  });

  it("liczy długość po obcięciu białych znaków", () => {
    expect(
      selectHomepageReviews([opinia({ comment: "   " + "a".repeat(31) + "   " })])
    ).toHaveLength(1);
    expect(
      selectHomepageReviews([opinia({ comment: "   " + "a".repeat(29) + "   " })])
    ).toEqual([]);
  });

  it("sortuje od najnowszych", () => {
    const wynik = selectHomepageReviews([
      opinia({ id: "stara", created_at: "2026-01-01T00:00:00+00:00" }),
      opinia({ id: "nowa", created_at: "2026-08-18T00:00:00+00:00" }),
      opinia({ id: "srednia", created_at: "2026-05-05T00:00:00+00:00" }),
    ]);
    expect(wynik.map((r) => r.id)).toEqual(["nowa", "srednia", "stara"]);
  });

  it("obcina do limitu 12", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      opinia({ id: `r${i}`, created_at: `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00+00:00` })
    );
    expect(selectHomepageReviews(rows)).toHaveLength(HOMEPAGE_REVIEWS_LIMIT);
    expect(selectHomepageReviews(rows, 3)).toHaveLength(3);
  });

  it("pusta lista wchodzi, pusta wychodzi", () => {
    expect(selectHomepageReviews([])).toEqual([]);
  });
});

describe("anonymizeAuthor", () => {
  it("skraca nazwisko do inicjału", () => {
    expect(anonymizeAuthor("Anna Kowalska", "pl")).toBe("Anna K.");
  });
  it("zostawia samo imię bez zmian", () => {
    expect(anonymizeAuthor("Anna", "pl")).toBe("Anna");
  });
  it("bierze ostatni człon przy trzech wyrazach", () => {
    expect(anonymizeAuthor("Anna Maria Kowalska", "pl")).toBe("Anna K.");
  });
  it("brak imienia → Klient / Kunde", () => {
    expect(anonymizeAuthor(null, "pl")).toBe("Klient");
    expect(anonymizeAuthor("", "pl")).toBe("Klient");
    expect(anonymizeAuthor("   ", "pl")).toBe("Klient");
    expect(anonymizeAuthor(null, "de")).toBe("Kunde");
  });
});

describe("formatReviewDate", () => {
  it("formatuje poprawną datę ISO (rok w wyniku)", () => {
    expect(formatReviewDate("2026-08-18T10:00:00+00:00", "pl")).toContain("2026");
  });
  it("śmieć zwraca bez zmian, nie wyjątek", () => {
    expect(formatReviewDate("nie-data", "pl")).toBe("nie-data");
  });
});
