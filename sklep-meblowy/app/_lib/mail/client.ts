import { Resend } from "resend";

// Świadomie BEZ cache'owania instancji: konstrukcja jest tania, a cache
// utrudniałby testy (stubEnv po pierwszym wywołaniu nie miałby efektu)
// i blokował podniesienie klucza bez restartu procesu.
export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}
