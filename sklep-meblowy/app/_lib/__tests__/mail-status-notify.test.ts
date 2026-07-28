import { describe, it, expect } from "vitest";
import { shouldNotifyCustomer } from "../mail/status-notify";

describe("shouldNotifyCustomer", () => {
  it("shipped wysyła — o tym klient musi wiedzieć", () => {
    expect(shouldNotifyCustomer("shipped")).toBe(true);
  });

  it("cancelled wysyła — dziś klient nie dowiedziałby się w żaden sposób", () => {
    expect(shouldNotifyCustomer("cancelled")).toBe(true);
  });

  it("processing NIE wysyła — to klik gaszący licznik nowych zamowien (PR #100)", () => {
    expect(shouldNotifyCustomer("processing")).toBe(false);
  });

  it("paid NIE wysyła — koliduje z mailem o zakupie z webhooka", () => {
    expect(shouldNotifyCustomer("paid")).toBe(false);
  });

  it("delivered NIE wysyła — decyzja 2026-07-28", () => {
    expect(shouldNotifyCustomer("delivered")).toBe(false);
  });

  it("pending NIE wysyła", () => {
    expect(shouldNotifyCustomer("pending")).toBe(false);
  });
});
