// Walidacja telefonu dla płatności za pobraniem. Kurier musi mieć kontakt,
// a wymóg numeru to też naturalna bariera przed fałszywymi zamówieniami.
// Luźny format międzynarodowy: liczy się liczba CYFR (7–15, E.164),
// separatory/+/nawiasy są ignorowane. Czysta funkcja — używana i w kliencie
// (CheckoutForm), i autorytatywnie w /api/checkout.
export function isValidCodPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}
