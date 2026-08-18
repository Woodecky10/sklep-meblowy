import { describe, it, expect } from "vitest";
import { shouldRemind, DNI_DO_PRZYPOMNIENIA } from "@/app/_lib/review-reminders";

const TERAZ = new Date("2026-08-18T10:00:00Z");
const OSIEM_DNI_TEMU = "2026-08-10T10:00:00Z";
const TRZY_DNI_TEMU = "2026-08-15T10:00:00Z";

const swieze = { sent_at: OSIEM_DNI_TEMU, reminded_at: null, used_at: null };

describe("shouldRemind", () => {
  it("przypomina po ośmiu dniach, gdy opinii nie ma", () => {
    expect(shouldRemind(swieze, false, TERAZ)).toBe(true);
  });

  it("nie przypomina przed upływem terminu", () => {
    expect(shouldRemind({ ...swieze, sent_at: TRZY_DNI_TEMU }, false, TERAZ)).toBe(false);
  });

  it("przypomina dokładnie RAZ", () => {
    expect(shouldRemind({ ...swieze, reminded_at: "2026-08-17T10:00:00Z" }, false, TERAZ)).toBe(false);
  });

  it("nie przypomina, gdy gość już skorzystał z linku", () => {
    expect(shouldRemind({ ...swieze, used_at: "2026-08-12T10:00:00Z" }, false, TERAZ)).toBe(false);
  });

  // Najważniejszy przypadek: opinia CZEKA na moderację. Ponaglanie kogoś,
  // kto już napisał, jest gorsze niż brak przypomnienia.
  it("nie przypomina, gdy opinia istnieje w jakimkolwiek statusie", () => {
    expect(shouldRemind(swieze, true, TERAZ)).toBe(false);
  });

  it("termin wynosi 7 dni", () => {
    expect(DNI_DO_PRZYPOMNIENIA).toBe(7);
  });
});
