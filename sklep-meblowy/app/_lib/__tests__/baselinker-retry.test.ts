import { describe, it, expect } from "vitest";
import {
  isTransientBlError,
  retryDelayMs,
  BaseLinkerHttpError,
  BaseLinkerError,
} from "@/app/_lib/baselinker";

describe("isTransientBlError", () => {
  it("HTTP 5xx przejściowy", () => expect(isTransientBlError(new BaseLinkerHttpError(503))).toBe(true));
  it("HTTP 429 przejściowy", () => expect(isTransientBlError(new BaseLinkerHttpError(429))).toBe(true));
  it("HTTP 4xx (poza 429) trwały", () => expect(isTransientBlError(new BaseLinkerHttpError(400))).toBe(false));
  it("błąd sieci (TypeError) przejściowy", () => expect(isTransientBlError(new TypeError("fetch failed"))).toBe(true));
  it("BaseLinkerError z trwałym kodem", () =>
    expect(isTransientBlError(new BaseLinkerError("getInventories", "ERROR_AUTH_TOKEN", "x"))).toBe(false));
  it("nieznany błąd trwały (fail-safe)", () => expect(isTransientBlError(new Error("?"))).toBe(false));
});

describe("retryDelayMs — backoff 0.5/1/2 s", () => {
  it("rośnie wykładniczo", () => {
    expect(retryDelayMs(1, 500)).toBe(500);
    expect(retryDelayMs(2, 500)).toBe(1000);
    expect(retryDelayMs(3, 500)).toBe(2000);
  });
});
