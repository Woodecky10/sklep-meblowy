import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendSpy = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendSpy };
  },
}));

import { sendMail } from "../mail/send";

const PAYLOAD = { to: "klient@example.com", subject: "Test", html: "<p>hej</p>" };

describe("sendMail", () => {
  beforeEach(() => {
    sendSpy.mockReset();
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "");
    vi.stubEnv("MAIL_REPLY_TO", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bez RESEND_API_KEY nie wysyła i nie rzuca", async () => {
    const result = await sendMail(PAYLOAD);
    expect(result).toBe(false);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("bez MAIL_FROM nie wysyła — nie zgadujemy nadawcy", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const result = await sendMail(PAYLOAD);
    expect(result).toBe(false);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("z kluczem i nadawcą wysyła i zwraca true", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAIL_FROM", "Mollien <zamowienia@mollien.pl>");
    sendSpy.mockResolvedValue({ data: { id: "abc" }, error: null });
    const result = await sendMail(PAYLOAD);
    expect(result).toBe(true);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Mollien <zamowienia@mollien.pl>",
        to: "klient@example.com",
        subject: "Test",
        html: "<p>hej</p>",
      })
    );
  });

  it("dokłada replyTo tylko gdy MAIL_REPLY_TO jest ustawione", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAIL_FROM", "Mollien <zamowienia@mollien.pl>");
    vi.stubEnv("MAIL_REPLY_TO", "kontakt@example.com");
    sendSpy.mockResolvedValue({ data: { id: "abc" }, error: null });
    await sendMail(PAYLOAD);
    expect(sendSpy.mock.calls[0][0].replyTo).toBe("kontakt@example.com");
  });

  it("błąd zwrócony przez Resend nie rzuca — zwraca false", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAIL_FROM", "Mollien <zamowienia@mollien.pl>");
    sendSpy.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    const result = await sendMail(PAYLOAD);
    expect(result).toBe(false);
  });

  it("wyjątek z SDK nie rzuca — zwraca false", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("MAIL_FROM", "Mollien <zamowienia@mollien.pl>");
    sendSpy.mockRejectedValue(new Error("network down"));
    const result = await sendMail(PAYLOAD);
    expect(result).toBe(false);
  });
});
