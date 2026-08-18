import { createHash, randomBytes } from "node:crypto";

// Ile token żyje. Wartość arbitralna, ale MUSI być skończona: token
// bezterminowy w cudzej skrzynce to trwałe uprawnienie do pisania opinii
// w imieniu kupującego.
export const INVITE_TTL_DNI = 90;

// 32 bajty losowości → 64 znaki hex. Tyle samo, co token resetu hasła.
export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

// W bazie leży WYŁĄCZNIE skrót. Wyciek kopii bazy nie oddaje wtedy prawa do
// pisania opinii — dokładnie ta sama zasada co przy resecie hasła.
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function expiresAtFrom(sentAt: Date): Date {
  return new Date(sentAt.getTime() + INVITE_TTL_DNI * 24 * 60 * 60 * 1000);
}

// Kolejność sprawdzeń jest częścią zachowania, nie stylem: „zużyte" bije
// „wygasłe", żeby ktoś, kto opinię już napisał, zobaczył podziękowanie,
// a nie komunikat o wygasłym linku.
export function inviteState(
  invite: { used_at: string | null; expires_at: string },
  now: Date
): "ok" | "used" | "expired" {
  if (invite.used_at !== null) return "used";
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return "expired";
  return "ok";
}

// Dokąd prowadzi przycisk w mailu. Wydzielone z budowania maila, bo to jedyny
// jego fragment, w którym da się popełnić cichy błąd: gość, który dostanie
// link do karty produktu, nie ma jak napisać opinii (nie jest zalogowany),
// a mail wygląda poprawnie.
export function reviewUrlFor(opts: {
  base: string;
  locale: "pl" | "de";
  maKonto: boolean;
  productId: string;
  token: string | null;
}): string {
  const prefix = opts.locale === "de" ? "/de" : "";
  if (opts.maKonto) return `${opts.base}${prefix}/produkt/${opts.productId}#opinie`;
  if (!opts.token) {
    // Głośno zamiast /opinia/undefined w wysłanym mailu.
    throw new Error("reviewUrlFor: gość bez tokenu");
  }
  return `${opts.base}${prefix}/opinia/${opts.token}`;
}
