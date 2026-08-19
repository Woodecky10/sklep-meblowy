"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { findInviteByToken, markInviteUsed } from "@/app/_lib/review-invites-server";
import { inviteState } from "@/app/_lib/review-tokens";
import { poluDlaNowegoZapisu } from "@/app/_lib/reviews-moderation";
import { notifyAdminNewReview } from "@/app/_lib/mail/review-notify";
import { validateImageUpload } from "@/app/_lib/image-upload";
import { REVIEW_PHOTO_DIR, parseReviewPhotos, validateReviewPhotos } from "@/app/_lib/reviews-photos";

export type UploadGuestReviewPhotoResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

// Wgranie JEDNEGO zdjęcia do opinii — ścieżka GOŚCIA. Uprawnieniem jest ważny
// token z zaproszenia, dokładnie jak przy zapisie opinii niżej.
//
// Token zużywa się (markInviteUsed) DOPIERO po udanym zapisie opinii, więc trzy
// uploady na jednym tokenie działają, a po wysłaniu opinii link przestaje
// otwierać cokolwiek — także tę akcję.
//
// Ten sam komunikat dla „nie ma takiego" i „nieważny": nie podpowiadamy
// zgadującemu, czy trafił w istniejący token.
export async function uploadGuestReviewPhoto(
  formData: FormData
): Promise<UploadGuestReviewPhotoResult> {
  const token = String(formData.get("token") ?? "");
  const invite = await findInviteByToken(token);
  if (!invite || inviteState(invite, new Date()) !== "ok") {
    return { ok: false, error: "Link jest nieprawidłowy lub stracił ważność" };
  }

  const valid = validateImageUpload(formData.get("photo"));
  if (!valid.ok) return { ok: false, error: valid.error };

  const path = `${REVIEW_PHOTO_DIR}/${Date.now()}-${randomUUID()}.${valid.ext}`;
  const admin = await createAdminClient();
  const { error } = await admin.storage
    .from("products")
    .upload(path, valid.file, {
      contentType: valid.contentType,
      cacheControl: "3600",
      upsert: false,
    });
  if (error) {
    console.error("[opinie] upload zdjęcia gościa nieudany:", error.message);
    return { ok: false, error: "Nie udało się wysłać zdjęcia — spróbuj ponownie" };
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("products").getPublicUrl(path);
  return { ok: true, url: publicUrl };
}

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export async function submitGuestReview(formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "");
  const invite = await findInviteByToken(token);
  // Ten sam komunikat dla „nie ma takiego" i „nieważny": nie podpowiadamy
  // zgadującemu, czy trafił w istniejący token.
  if (!invite || inviteState(invite, new Date()) !== "ok") {
    return { ok: false, error: "Link jest nieprawidłowy lub stracił ważność" };
  }

  const rating = Math.round(Number(formData.get("rating")));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Wybierz ocenę od 1 do 5 gwiazdek" };
  }
  const imie = String(formData.get("imie") ?? "").trim().slice(0, 80);
  if (imie.length < 2) return { ok: false, error: "Podaj imię" };
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  if (!email.includes("@")) return { ok: false, error: "Podaj poprawny adres e-mail" };
  const tresc = String(formData.get("tresc") ?? "").trim().slice(0, 2000);

  const zdjecia = validateReviewPhotos(
    parseReviewPhotos(formData.get("photos")),
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  );
  if (!zdjecia.ok) {
    return {
      ok: false,
      error:
        zdjecia.error === "count"
          ? "Maksymalnie 3 zdjęcia"
          : "Nie udało się dołączyć zdjęcia — spróbuj dodać je jeszcze raz",
    };
  }

  const admin = await createAdminClient();
  // `.select("id")` jest tu KONIECZNE, nie kosmetyką: bez zwróconego wiersza
  // nie ma czym nakarmić notifyAdminNewReview poniżej.
  const { data, error } = await admin
    .from("product_reviews")
    .insert({
      product_id: invite.product_id,
      user_id: null,
      guest_name: imie,
      guest_email: email,
      rating,
      comment: tresc || null,
      photos: zdjecia.value,
      ...poluDlaNowegoZapisu(),
    } as never)
    .select("id")
    .single();

  if (error) {
    // Najczęstszy przypadek: uniq_review_guest — ten adres już ocenił ten
    // produkt. Treść błędu z bazy nie idzie do klienta (wyciek schematu).
    // Logujemy WYŁĄCZNIE code+message — error.details od PostgREST dla tego
    // konfliktu brzmi „Key (product_id, lower(guest_email))=(…, jan@x.pl)
    // already exists.” i wsadziłby adres gościa do logów Vercela, mimo że
    // adres ma służyć wyłącznie do odróżniania autorów.
    console.error("[opinie] zapis opinii gościa nieudany:", {
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: "Nie udało się zapisać opinii. Możliwe, że już ją wystawiłeś." };
  }

  // Token jednorazowy — zużywamy DOPIERO po udanym zapisie, żeby błąd
  // walidacji nie spalił linku.
  await markInviteUsed(invite.id);

  // Mail do właścicielki PO udanym zapisie, przez after(): wysyłka nie może
  // opóźnić ani zepsuć odpowiedzi dla klienta, który opinię zapisał poprawnie
  // (ten sam wzorzec i uzasadnienie co w app/admin/zamowienia/actions.ts).
  after(() => notifyAdminNewReview(data.id));

  // Opinia publikuje się od razu — odśwież wszystkie ścieżki jej widoczności.
  // Karta produktu i /sklep biorą ją do średniej; / ma slider opinii; /opinie
  // listuje wszystkie zatwierdzone (Omnibus). /admin/opinie to panel admina.
  revalidatePath(`/produkt/${invite.product_id}`);
  revalidatePath("/sklep");
  revalidatePath("/opinie");
  revalidatePath("/");
  revalidatePath("/admin/opinie");
  // Jedyne źródło prawdy o tym, co widzi gość po wysłaniu — GuestReviewForm
  // pokazuje ten komunikat wprost, zamiast trzymać własny, osobny tekst,
  // który mógłby się rozjechać z tym, co faktycznie się dzieje z opinią.
  return { ok: true, message: "Twoja opinia jest już na stronie." };
}
