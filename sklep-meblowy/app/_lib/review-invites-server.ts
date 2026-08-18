import { createAdminClient } from "./supabase/server";
import { expiresAtFrom, generateInviteToken, hashInviteToken } from "./review-tokens";
import type { ReviewInvite } from "./types";

// Kod błędu Postgres dla naruszenia unikalności (unique_violation).
const PG_UNIQUE_VIOLATION = "23505";

// Zakłada zaproszenie i zwraca JAWNY token do wstawienia w link w mailu.
// Zwraca null, gdy zaproszenie dla tej pary już istnieje (unique
// order_id+product_id) — to jest właśnie zabezpieczenie idempotencji:
// ponowne przestawienie statusu nie wyśle drugiego maila.
//
// Rozróżniamy naruszenie unikalności (poprawne, oczekiwane pominięcie —
// nie logujemy) od KAŻDEGO innego błędu insertu: naruszenia unique(token_hash),
// naruszenia klucza obcego, braku tabeli, braku uprawnień. Bez tego
// rozróżnienia awaria wyglądałaby identycznie jak poprawne pominięcie
// duplikatu — requestReviews przeszedłby przez wszystkie produkty zamówienia,
// nic by nie wysłał i nie zostawił ani jednego śladu w logach. Reszta projektu
// konsekwentnie loguje takie sytuacje (sendMail, /feed.xml), więc cisza
// akurat tutaj byłaby niespójna. NIE loguj tu adresu e-mail ani tokenu.
export async function createInvite(
  orderId: string,
  productId: string,
  email: string
): Promise<{ invite: ReviewInvite; token: string } | null> {
  const token = generateInviteToken();
  const teraz = new Date();
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("review_invites")
    .insert({
      order_id: orderId,
      product_id: productId,
      email,
      token_hash: hashInviteToken(token),
      sent_at: teraz.toISOString(),
      expires_at: expiresAtFrom(teraz).toISOString(),
    } as never)
    .select()
    .maybeSingle();
  if (error) {
    if (error.code !== PG_UNIQUE_VIOLATION) {
      console.error(
        `[mail] createInvite nieudane (zamówienie ${orderId}, produkt ${productId}):`,
        error.message
      );
    }
    return null;
  }
  if (!data) return null;
  return { invite: data as ReviewInvite, token };
}

export async function findInviteByToken(token: string): Promise<ReviewInvite | null> {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("review_invites")
    .select("*")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();
  return (data as ReviewInvite | null) ?? null;
}

export async function markInviteUsed(inviteId: string): Promise<void> {
  const admin = await createAdminClient();
  await admin
    .from("review_invites")
    .update({ used_at: new Date().toISOString() } as never)
    .eq("id", inviteId);
}
