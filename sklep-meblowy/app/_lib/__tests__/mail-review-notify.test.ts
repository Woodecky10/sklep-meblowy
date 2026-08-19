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
  photos_count: 0,
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

  it("nie wspomina o zdjęciach, gdy opinia ich nie ma", async () => {
    await notifyAdminNewReview(OPINIA.id);
    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.html).not.toContain("zdjęcie");
    expect(payload.html).not.toContain("zdjęcia");
  });

  it("mówi, ile zdjęć dołączył klient, ale NIE osadza ich w mailu", async () => {
    // Główna gwarancja jest strukturalna: `AdminNewReview` przyjmuje
    // `Pick<ReviewForMail, ...>` bez `photos`, więc URL-a nie da się tam
    // wstawić przez typy. Ta asercja to backstop w runtime — mock musi
    // NAPRAWDĘ nieść URL zdjęcia (czego `ReviewForMail` normalnie nie robi),
    // żeby test miał szansę wykryć regresję, gdyby ktoś kiedyś przepisał
    // szablon tak, by czytał `photos` bezpośrednio z obiektu opinii.
    getReviewMock.mockResolvedValue({
      ...OPINIA,
      photos_count: 2,
      photos: [
        "https://xyz.supabase.co/storage/v1/object/public/products/opinie/1-a.jpg",
      ],
    });
    await notifyAdminNewReview(OPINIA.id);
    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.html).toContain("2 zdjęcia");
    // Kontrakt: liczba, nie zawartość. Gdyby ktoś kiedyś wstawił <img> ze
    // zdjęciem klienta, ten test ma o tym powiedzieć.
    expect(payload.html).not.toContain("/storage/v1/object/public/products/opinie/");
  });
});
