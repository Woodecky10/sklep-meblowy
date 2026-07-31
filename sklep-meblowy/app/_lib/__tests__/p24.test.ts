import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { p24Sign, registerTransaction, verifyTransaction, trnRequestUrl } from "../p24";

describe("p24Sign", () => {
  it("liczy SHA-384 z JSON-a pól w narzuconej kolejności (register)", () => {
    const sign = p24Sign({
      sessionId: "order-abc-123",
      merchantId: 12345,
      amount: 199900,
      currency: "PLN",
      crc: "a1b2c3d4e5f60718",
    });
    expect(sign).toBe(
      "118d99ab8caecc6f58db02b76296257f5ccf0dbda1dbe079fcc8fc594898b2bf8591569aac6b40caf7744da33e3e57ae"
    );
  });

  it("zmiana kolejności pól zmienia podpis", () => {
    const a = p24Sign({ amount: 100, currency: "PLN" });
    const b = p24Sign({ currency: "PLN", amount: 100 });
    expect(a).not.toBe(b);
  });
});

describe("registerTransaction", () => {
  beforeEach(() => {
    process.env.P24_MERCHANT_ID = "12345";
    process.env.P24_POS_ID = "12345";
    process.env.P24_API_KEY = "test-api-key";
    process.env.P24_CRC = "a1b2c3d4e5f60718";
    process.env.P24_BASE_URL = "https://sandbox.przelewy24.pl";
  });
  afterEach(() => vi.restoreAllMocks());

  it("POST-uje na /api/v1/transaction/register z poprawnym podpisem i zwraca token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { token: "TOKEN123" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = await registerTransaction({
      sessionId: "order-abc-123",
      amount: 199900,
      currency: "PLN",
      description: "Zamówienie",
      email: "k@example.com",
      country: "PL",
      language: "pl",
      urlReturn: "https://shop/checkout/success?order=order-abc-123",
      urlStatus: "https://shop/api/p24/status",
    });

    expect(token).toBe("TOKEN123");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sandbox.przelewy24.pl/api/v1/transaction/register");
    const body = JSON.parse(opts.body);
    expect(body.sign).toBe(
      p24Sign({ sessionId: "order-abc-123", merchantId: 12345, amount: 199900, currency: "PLN", crc: "a1b2c3d4e5f60718" })
    );
    expect(opts.headers.Authorization).toMatch(/^Basic /);
  });

  it("rzuca przy odpowiedzi nie-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "err" }));
    await expect(
      registerTransaction({
        sessionId: "s", amount: 100, currency: "PLN", description: "d",
        email: "e@e.pl", country: "PL", language: "pl", urlReturn: "u", urlStatus: "u",
      })
    ).rejects.toThrow();
  });
});

describe("verifyTransaction", () => {
  beforeEach(() => {
    process.env.P24_MERCHANT_ID = "12345";
    process.env.P24_POS_ID = "12345";
    process.env.P24_API_KEY = "test-api-key";
    process.env.P24_CRC = "a1b2c3d4e5f60718";
    process.env.P24_BASE_URL = "https://sandbox.przelewy24.pl";
  });
  afterEach(() => vi.restoreAllMocks());

  it("zwraca true gdy P24 potwierdzi status success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { status: "success" } }) });
    vi.stubGlobal("fetch", fetchMock);
    const ok = await verifyTransaction({ sessionId: "order-abc-123", orderId: 888777, amount: 199900, currency: "PLN" });
    expect(ok).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.sign).toBe(
      p24Sign({ sessionId: "order-abc-123", orderId: 888777, amount: 199900, currency: "PLN", crc: "a1b2c3d4e5f60718" })
    );
  });

  it("zwraca false gdy status != success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { status: "error" } }) }));
    const ok = await verifyTransaction({ sessionId: "s", orderId: 1, amount: 1, currency: "PLN" });
    expect(ok).toBe(false);
  });
});

describe("trnRequestUrl", () => {
  it("buduje URL redirectu z tokena", () => {
    process.env.P24_BASE_URL = "https://sandbox.przelewy24.pl";
    expect(trnRequestUrl("TOKEN123")).toBe("https://sandbox.przelewy24.pl/trnRequest/TOKEN123");
  });
});
