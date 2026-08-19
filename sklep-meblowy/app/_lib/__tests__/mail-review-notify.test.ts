import { describe, it, expect, vi, beforeEach } from "vitest";

const getReviewMock = vi.fn();
const sendMailMock = vi.fn();

vi.mock("../reviews-admin", () => ({
  getReviewForMail: (...a: unknown[]) => getReviewMock(...a),
}));
vi.mock("../mail/send", () => ({ sendMail: (...a: unknown[]) => sendMailMock(...a) }));
vi.mock("../mail/branding-server", async () => {
  const { brandingFromRaw } = await import("../mail/branding");
  return { getMailBranding: vi.fn(async () => brandingFromRaw(null)) };
});

import { notifyAdminNewReview } from "../mail/review-notify";

const OPINIA = {
  id: "11111111-2222-3333-4444-555555555555",
  rating: 5 as const,
  comment: "Narożnik stoi u nas od miesiąca i nadal wygląda jak nowy.",
  author_name: "Anna Kowalska",
  product_name: "Element prosty Nube",
  created_at: "2026-08-19T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MAIL_ADMIN_TO = "wlascicielka@example.com";
  getReviewMock.mockResolvedValue(OPINIA);
});

describe("notifyAdminNewReview", () => {
  it("wysyła na adres z MAIL_ADMIN_TO, z ocena i produktem w temacie", async () => {
    await notifyAdminNewReview(OPINIA.id);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.to).toBe("wlascicielka@example.com");
    // "5/5", nie samo "5" — w temacie jest sufiks "/5", więc goły "5" jako
    // podłańcuch przechodziłby nawet dla oceny 0 ("0/5" zawiera "5").
    expect(payload.subject).toContain("5/5");
    expect(payload.subject).toContain("Element prosty Nube");
  });

  it("nie rzuca i nie wysyła, gdy brak MAIL_ADMIN_TO", async () => {
    delete process.env.MAIL_ADMIN_TO;
    await expect(notifyAdminNewReview(OPINIA.id)).resolves.toBeUndefined();
    expect(sendMailMock).not.toHaveBeenCalled();
    // Dowód, że funkcja wraca ZANIM sięgnie do bazy — bez tej asercji test
    // przechodziłby też wtedy, gdyby odczyt opinii wykonywał się niepotrzebnie
    // przed sprawdzeniem MAIL_ADMIN_TO.
    expect(getReviewMock).not.toHaveBeenCalled();
  });

  // Kontrakt: wołane z after() po zapisie opinii. Wyjątek nie może wrócić do
  // klienta, który opinię ZAPISAŁ poprawnie.
  it("nie rzuca, gdy odczyt opinii pada", async () => {
    getReviewMock.mockRejectedValue(new Error("baza padła"));
    await expect(notifyAdminNewReview(OPINIA.id)).resolves.toBeUndefined();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("nie rzuca, gdy opinii nie ma", async () => {
    getReviewMock.mockResolvedValue(null);
    await expect(notifyAdminNewReview(OPINIA.id)).resolves.toBeUndefined();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
