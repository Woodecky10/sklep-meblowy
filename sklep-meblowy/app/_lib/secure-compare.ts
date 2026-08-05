import { timingSafeEqual } from "node:crypto";

// Stałoczasowe porównanie sekretów — broni przed timing side-channel przy
// weryfikacji kluczy crona / syncu zewnętrznego (audyt 2026-06-11 LOW). Naiwne === na
// stringach kończy porównanie na pierwszej różniącej się bajtce, co teoretycznie
// pozwala odgadywać sekret bajt po bajcie po czasie odpowiedzi.
//
// Różne długości → szybkie false (długość sekretu nie jest tajemnicą wartą
// ochrony, a timingSafeEqual i tak rzuca przy różnych długościach buforów).
export function safeCompareSecret(
  actual: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
