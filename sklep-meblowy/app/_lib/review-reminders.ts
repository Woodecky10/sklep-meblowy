export const DNI_DO_PRZYPOMNIENIA = 7;

// Czy wysłać przypomnienie o opinii. Wszystkie warunki muszą zachodzić naraz.
//
// `maOpinie` sprawdza istnienie opinii w JAKIMKOLWIEK statusie — także
// `pending` i `rejected`. Ktoś, kto napisał i czeka na moderację, nie może
// dostać ponaglenia; komu odrzucono spam, też nie.
export function shouldRemind(
  invite: { sent_at: string; reminded_at: string | null; used_at: string | null },
  maOpinie: boolean,
  now: Date
): boolean {
  if (invite.reminded_at !== null) return false; // przypominamy dokładnie raz
  if (invite.used_at !== null) return false;
  if (maOpinie) return false;
  const minelo = now.getTime() - new Date(invite.sent_at).getTime();
  return minelo >= DNI_DO_PRZYPOMNIENIA * 24 * 60 * 60 * 1000;
}
