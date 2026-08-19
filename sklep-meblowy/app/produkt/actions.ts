"use server";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { getLocale } from "@/app/_lib/i18n-server";
import { validateImageUpload } from "@/app/_lib/image-upload";
import { REVIEW_PHOTO_DIR } from "@/app/_lib/reviews-photos";
import { getReviewStatus } from "@/app/_lib/reviews";

export type SubmitInquiryResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function sanitize(input: unknown, max: number): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Public server action — klient niezalogowany może wysłać zapytanie.
// Insert idzie SERVICE ROLEM (createAdminClient), więc nie zależy od polityk
// RLS na tabeli. Migracja 27 odebrała anon/authenticated prawo INSERT (był to
// wektor bypassu walidacji przez bezpośredni REST).
export async function submitInquiry(
  formData: FormData
): Promise<SubmitInquiryResult> {
  const de = (await getLocale()) === "de";
  const tr = (pl: string, deTxt: string) => (de ? deTxt : pl);
  const productId = sanitize(formData.get("product_id"), 64) || null;
  const productName = sanitize(formData.get("product_name"), 300);
  const customerName = sanitize(formData.get("customer_name"), 200);
  const customerEmail = sanitize(formData.get("customer_email"), 200);
  const customerPhone = sanitize(formData.get("customer_phone"), 50);
  const message = sanitize(formData.get("message"), 2000);

  if (!customerEmail || !isEmail(customerEmail)) {
    return { ok: false, error: tr("Podaj poprawny adres email", "Bitte geben Sie eine gültige E-Mail-Adresse an") };
  }
  if (message.length < 5) {
    return { ok: false, error: tr("Wiadomość jest za krótka (min 5 znaków)", "Die Nachricht ist zu kurz (mind. 5 Zeichen)") };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.from("product_inquiries").insert({
    product_id: productId,
    product_name: productName,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone || null,
    message,
  } as never);

  if (error) {
    return { ok: false, error: tr("Nie udało się wysłać zapytania — spróbuj później", "Die Anfrage konnte nicht gesendet werden — bitte versuchen Sie es später erneut") };
  }

  return {
    ok: true,
    message: tr(
      "Dziękujemy! Odezwiemy się na podany email w ciągu 24 godzin.",
      "Vielen Dank! Wir melden uns innerhalb von 24 Stunden unter der angegebenen E-Mail-Adresse."
    ),
  };
}

export type UploadReviewPhotoResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

// Wgranie JEDNEGO zdjęcia do opinii — ścieżka ZALOGOWANEGO. Wzorzec 1:1
// z uploadIssuePhoto (app/konto/zamowienia/actions.ts): walidacja wspólnym
// validateImageUpload (bez SVG), upload service-rolem do bucketa `products`,
// zwrot publicznego URL-a. Trzy świadome różnice wobec reklamacji:
//
// 1. Prefiks `opinie/`, nie `order-issues/` — patrz komentarz przy
//    REVIEW_PHOTO_DIR. Rozdzielność tych katalogów jest bramką, nie porządkiem.
// 2. Bramka to nie „ktokolwiek zalogowany", tylko warunek zakupu — ten sam,
//    który przepuszcza opinię (migracja 78, bramka COD z 46). Wołamy
//    getReviewStatus zamiast przepisywać warunek trzeci raz: gdyby reguła
//    „zweryfikowanego zakupu" kiedyś się zmieniła, ma się zmienić w jednym
//    miejscu, a nie w tabeli, w API i tutaj.
// 3. Plik przychodzi już przekodowany do JPEG przez prepareReviewPhoto
//    w przeglądarce (EXIF/GPS i HEIC — patrz image-compress.ts). Serwer tego
//    NIE zakłada: `ext` bierze się z allowlistowanego mime, nie ze stałej.
export async function uploadReviewPhoto(
  formData: FormData
): Promise<UploadReviewPhotoResult> {
  const de = (await getLocale()) === "de";
  const tr = (pl: string, deTxt: string) => (de ? deTxt : pl);

  const productId = sanitize(formData.get("product_id"), 64);
  if (!productId) {
    return { ok: false, error: tr("Nieprawidłowy produkt", "Ungültiges Produkt") };
  }

  const { canReview, reason } = await getReviewStatus(productId);
  if (!canReview) {
    if (reason === "not_logged_in") {
      return { ok: false, error: tr("Musisz być zalogowany", "Sie müssen angemeldet sein") };
    }
    return {
      ok: false,
      error: tr(
        "Nie możesz dodać zdjęcia — weryfikujemy zakupy klientów.",
        "Sie können kein Foto hinzufügen — wir prüfen die Käufe der Kunden."
      ),
    };
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
    // Treść błędu ze Storage nie idzie do klienta (ujawnia ścieżki i bucket).
    console.error("[opinie] upload zdjęcia nieudany:", error.message);
    return {
      ok: false,
      error: tr(
        "Nie udało się wysłać zdjęcia — spróbuj ponownie",
        "Das Foto konnte nicht gesendet werden — bitte erneut versuchen"
      ),
    };
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("products").getPublicUrl(path);
  return { ok: true, url: publicUrl };
}
