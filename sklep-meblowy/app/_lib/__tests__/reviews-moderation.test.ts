import { describe, it, expect } from "vitest";
import {
  reviewBucket,
  poluDlaNowegoZapisu,
  poluDlaPrzejrzenia,
  poluDlaUsuniecia,
  poluDlaPrzywrocenia,
} from "../reviews-moderation";

describe("reviewBucket", () => {
  it("opublikowana i nieprzejrzana trafia do 'nowe'", () => {
    expect(reviewBucket({ status: "approved", moderated_at: null })).toBe("nowe");
  });

  it("opublikowana i przejrzana trafia do 'opublikowane'", () => {
    expect(
      reviewBucket({ status: "approved", moderated_at: "2026-08-19T10:00:00.000Z" })
    ).toBe("opublikowane");
  });

  it("odrzucona trafia do 'usuniete' niezależnie od moderated_at", () => {
    expect(reviewBucket({ status: "rejected", moderated_at: null })).toBe("usuniete");
    expect(
      reviewBucket({ status: "rejected", moderated_at: "2026-08-19T10:00:00.000Z" })
    ).toBe("usuniete");
  });

  // Wiersze sprzed migracji 78 albo zapisane starym kodem w oknie wdrożenia.
  // Nie są publiczne (RLS przepuszcza tylko approved), więc panel MUSI je
  // pokazać w „nowe", inaczej znikną z oczu i nikt ich nie opublikuje.
  it("pending trafia do 'nowe'", () => {
    expect(reviewBucket({ status: "pending", moderated_at: null })).toBe("nowe");
  });
});

describe("pola zapisu", () => {
  it("nowy zapis jest opublikowany i nieprzejrzany", () => {
    expect(poluDlaNowegoZapisu()).toEqual({ status: "approved", moderated_at: null });
  });

  it("przejrzenie stempluje czas, nie rusza statusu", () => {
    const teraz = new Date("2026-08-19T12:34:56.000Z");
    expect(poluDlaPrzejrzenia(teraz)).toEqual({ moderated_at: "2026-08-19T12:34:56.000Z" });
  });

  it("usunięcie z witryny odrzuca I stempluje — inaczej wisi w 'nowe'", () => {
    const teraz = new Date("2026-08-19T12:34:56.000Z");
    expect(poluDlaUsuniecia(teraz)).toEqual({
      status: "rejected",
      moderated_at: "2026-08-19T12:34:56.000Z",
    });
  });

  // Przywrócenie zeruje stempel celowo: opinia wraca na witrynę i ma jeszcze
  // raz przejść przed oczami, zamiast wracać od razu jako „załatwiona".
  it("przywrócenie publikuje i kasuje stempel", () => {
    expect(poluDlaPrzywrocenia()).toEqual({ status: "approved", moderated_at: null });
  });
});
