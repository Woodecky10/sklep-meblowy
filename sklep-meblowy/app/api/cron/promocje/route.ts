// Cron promocji: wprowadza w życie zaplanowane okna (start i koniec).
// Vercel liczy crony w UTC, a Polska ma zmianę czasu — dlatego wpis w
// vercel.json stoi na 23:05 UTC: to 00:05 zimą i 01:05 latem, czyli ZAWSZE po
// lokalnej północy, nigdy przed. Spóźnienie do 65 minut jest świadomym wyborem
// zamiast ryzyka, że promocja „od 10.08" wystartuje 9 sierpnia wieczorem.
// Na planie Pro wystarczy zmienić harmonogram na */15 * * * * — funkcja jest
// idempotentna, więc częstsze odpalanie nic nie kosztuje.
import { applySaleSchedule } from "@/app/_lib/sale-schedule-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET nie ustawiony" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Brak autoryzacji" }, { status: 401 });
  }

  try {
    const switched = await applySaleSchedule();
    return Response.json({ switched });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Nieznany błąd";
    return Response.json({ error: message }, { status: 500 });
  }
}
