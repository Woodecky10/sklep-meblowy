import { createAdminClient } from "./supabase/server";
import { expiresAtFrom, generateInviteToken, hashInviteToken } from "./review-tokens";
import type { ReviewInvite } from "./types";

// Zakłada zaproszenie i zwraca JAWNY token do wstawienia w link w mailu.
// Zwraca null, gdy zaproszenie dla tej pary już istnieje (unique
// order_id+product_id) — to jest właśnie zabezpieczenie idempotencji:
// ponowne przestawienie statusu nie wyśle drugiego maila.
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
  if (error || !data) return null;
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
