import { describe, it, expect } from "vitest";
import { pickContact } from "@/app/_lib/contact";

describe("pickContact — override z DB lub fallback z COMPANY", () => {
  it("niepusty override wygrywa", () => {
    expect(pickContact("+48 111 222 333", "+48 000")).toBe("+48 111 222 333");
    expect(pickContact("nowy@x.pl", "stary@x.pl")).toBe("nowy@x.pl");
  });
  it("null/undefined/pusty/whitespace → fallback", () => {
    expect(pickContact(null, "+48 000")).toBe("+48 000");
    expect(pickContact(undefined, "+48 000")).toBe("+48 000");
    expect(pickContact("", "+48 000")).toBe("+48 000");
    expect(pickContact("   ", "+48 000")).toBe("+48 000");
  });
  it("override przycinany z białych znaków", () => {
    expect(pickContact("  +48 1  ", "+48 000")).toBe("+48 1");
  });
  it("fallback null przechodzi (telefon może nie istnieć)", () => {
    expect(pickContact(null, null)).toBeNull();
  });
});
