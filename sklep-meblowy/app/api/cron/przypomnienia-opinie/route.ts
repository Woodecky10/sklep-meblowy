// Przypomnienia o opinii: raz na dobę przemiata zaproszenia starsze niż
// 7 dni, dla których nie ma jeszcze opinii. Funkcja jest idempotentna
// (`reminded_at`), więc częstsze odpalenie niczego nie dubluje.
//
// Limit Vercela sprawdzony 2026-08-18: 100 zadań na projekt na KAŻDYM planie,
// a Hobby ogranicza wyłącznie częstotliwość do raz na dobę — co tej trasie
// wystarcza. Drugi wpis obok /api/cron/promocje mieści się bez zmiany planu.
import { sendReviewReminders } from "@/app/_lib/mail/review-request";
import { safeCompareSecret } from "@/app/_lib/secure-compare";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET nie ustawiony" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (!safeCompareSecret(authHeader, `Bearer ${secret}`)) {
    return Response.json({ error: "Brak autoryzacji" }, { status: 401 });
  }

  try {
    const { wyslane } = await sendReviewReminders();
    return Response.json({ wyslane });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Nieznany błąd";
    console.error("Cron przypomnień o opinie — błąd:", e);
    return Response.json({ error: message }, { status: 500 });
  }
}
