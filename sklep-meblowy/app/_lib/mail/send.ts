import { getResend } from "./client";

export type MailPayload = {
  to: string;
  subject: string;
  html: string;
};

// Jedyne wyjście na świat. NIGDY nie rzuca — wywoływane z webhooka Stripe
// (500 = ponowienie eventu) i z akcji admina (wyjątek = błąd w panelu).
// Zwraca true tylko gdy Resend przyjął wiadomość.
export async function sendMail(payload: MailPayload): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.info(
      `[mail] brak RESEND_API_KEY — pomijam: "${payload.subject}" -> ${payload.to}`
    );
    return false;
  }

  const from = process.env.MAIL_FROM;
  if (!from) {
    // Nadawcy nie zgadujemy: zły from = odbicie albo spam.
    console.error("[mail] brak MAIL_FROM — pomijam wysyłkę");
    return false;
  }

  const replyTo = process.env.MAIL_REPLY_TO;

  try {
    const { error } = await resend.emails.send({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) {
      console.error("[mail] Resend zwrócił błąd:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[mail] wysyłka nieudana:", err);
    return false;
  }
}
