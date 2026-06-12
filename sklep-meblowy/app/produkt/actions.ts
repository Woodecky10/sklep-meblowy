"use server";

import { createAdminClient } from "@/app/_lib/supabase/server";

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
  const productId = sanitize(formData.get("product_id"), 64) || null;
  const productName = sanitize(formData.get("product_name"), 300);
  const customerName = sanitize(formData.get("customer_name"), 200);
  const customerEmail = sanitize(formData.get("customer_email"), 200);
  const customerPhone = sanitize(formData.get("customer_phone"), 50);
  const message = sanitize(formData.get("message"), 2000);

  if (!customerEmail || !isEmail(customerEmail)) {
    return { ok: false, error: "Podaj poprawny adres email" };
  }
  if (message.length < 5) {
    return { ok: false, error: "Wiadomość jest za krótka (min 5 znaków)" };
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
    return { ok: false, error: "Nie udało się wysłać zapytania — spróbuj później" };
  }

  return {
    ok: true,
    message: "Dziękujemy! Odezwiemy się na podany email w ciągu 24 godzin.",
  };
}
