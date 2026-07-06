"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import Image from "next/image";
import { useCart, cartItemKey } from "@/app/_context/CartContext";
import { formatVariantLabel } from "@/app/_lib/variants";
import { localizeHref } from "@/app/_lib/i18n";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { formatMoney } from "@/app/_lib/money";
import { useEurRate } from "@/app/_lib/rate-context";
import { useFabricLabels } from "@/app/_lib/fabric-context";
import { isValidCodPhone } from "@/app/_lib/cod";
import type { Address } from "@/app/_lib/types";

export default function CheckoutForm({
  defaultEmail,
  defaultFullName,
  defaultAddress,
  isLoggedIn,
}: {
  defaultEmail: string;
  defaultFullName: string;
  defaultAddress: Address | null;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const locale = useClientLocale();
  const rate = useEurRate();
  const fabricMap = useFabricLabels();
  const de = locale === "de";
  const { items, total, count, appliedPromo } = useCart();

  const c = de
    ? {
        haveAccount: "Hast du bereits ein Konto?",
        login: "Anmelden",
        autofill: "— die Daten werden automatisch ausgefüllt.",
        contact: "Kontakt",
        fullName: "Vor- und Nachname",
        email: "E-Mail",
        deliveryAddress: "Lieferadresse",
        streetAndNumber: "Straße und Hausnummer",
        postalCode: "Postleitzahl",
        city: "Stadt",
        country: "Land",
        agreePrefix: "Ich habe die",
        terms: "AGB",
        and: "und die",
        privacy: "Datenschutzerklärung",
        agreeSuffix: "gelesen und akzeptiere sie.",
        redirecting: "Weiterleitung...",
        payNow: "Sicher bezahlen →",
        backToCart: "← Zurück zum Warenkorb",
        order: "Bestellung",
        products: "Produkte",
        shipping: "Versand",
        shippingFrom: "Gratis",
        shippingNote:
          "in ganz Polen",
        shippingNotice:
          "Der Versand innerhalb Polens ist kostenlos — wir berechnen keine Versandkosten.",
        shippingNoticeLink: "Versanddetails",
        total: "Gesamt",
        payment: "🔒 Zahlung über Przelewy24 (Karte, BLIK, Überweisung)",
        ssl: "✓ SSL-Verschlüsselung",
        defaultCountry: "Polen",
        phone: "Telefon",
        phoneCodNote: "Bei Nachnahme erforderlich — der Kurier braucht Ihre Nummer.",
        paymentMethod: "Zahlungsart",
        payOnline: "Online-Zahlung",
        payOnlineDesc: "Karte, BLIK, Überweisung — sichere Zahlung über Przelewy24",
        payCod: "Nachnahme",
        payCodDesc: "Zahlung bei Lieferung an den Kurier",
        placeOrder: "Bestellung aufgeben →",
        codPhoneError: "Bei Nachnahme ist eine Telefonnummer erforderlich (7–15 Ziffern).",
        codSidebarNote: "💵 Zahlung bei Lieferung (Nachnahme)",
      }
    : {
        haveAccount: "Masz już konto?",
        login: "Zaloguj się",
        autofill: "— dane wypełnią się automatycznie.",
        contact: "Kontakt",
        fullName: "Imię i nazwisko",
        email: "Email",
        deliveryAddress: "Adres dostawy",
        streetAndNumber: "Ulica i numer",
        postalCode: "Kod pocztowy",
        city: "Miasto",
        country: "Kraj",
        agreePrefix: "Zapoznałem/am się i akceptuję",
        terms: "regulamin sklepu",
        and: "oraz",
        privacy: "politykę prywatności",
        agreeSuffix: ".",
        redirecting: "Przekierowuję...",
        payNow: "Zapłać bezpiecznie →",
        backToCart: "← Wróć do koszyka",
        order: "Zamówienie",
        products: "Produkty",
        shipping: "Dostawa",
        shippingFrom: "Gratis",
        shippingNote:
          "na terenie całej Polski",
        shippingNotice:
          "Wysyłka jest darmowa na terenie całej Polski — nie doliczamy żadnych kosztów dostawy.",
        shippingNoticeLink: "Szczegóły dostawy",
        total: "Razem",
        payment: "🔒 Płatność Przelewy24 (karta, BLIK, przelew)",
        ssl: "✓ Szyfrowanie SSL",
        defaultCountry: "Polska",
        phone: "Telefon",
        phoneCodNote: "Wymagany przy pobraniu — kurier musi mieć kontakt.",
        paymentMethod: "Metoda płatności",
        payOnline: "Płatność online",
        payOnlineDesc: "Karta, BLIK, przelew — bezpieczna płatność Przelewy24",
        payCod: "Za pobraniem",
        payCodDesc: "Zapłacisz kurierowi przy odbiorze",
        placeOrder: "Złóż zamówienie →",
        codPhoneError: "Przy płatności za pobraniem wymagany jest numer telefonu (7–15 cyfr).",
        codSidebarNote: "💵 Płatność przy odbiorze (za pobraniem)",
      };

  const [fullName, setFullName] = useState(defaultFullName);
  const [email, setEmail] = useState(defaultEmail);
  const [street, setStreet] = useState(defaultAddress?.street ?? "");
  const [city, setCity] = useState(defaultAddress?.city ?? "");
  const [postalCode, setPostalCode] = useState(defaultAddress?.postal_code ?? "");
  const [country, setCountry] = useState(
    defaultAddress?.country ?? c.defaultCountry
  );
  const [phone, setPhone] = useState(defaultAddress?.phone ?? "");
  const [paymentMethod, setPaymentMethod] = useState<"online" | "cod">("online");
  const isCod = paymentMethod === "cod";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Wymagana akceptacja regulaminu + polityki przed płatnością.
  // Wymóg art. 17 ustawy o prawach konsumenta + kryteria weryfikacji Przelewy24.
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    if (items.length === 0) {
      router.replace(localizeHref("/koszyk", locale));
    }
  }, [items.length, router, locale]);

  // Wysyłka darmowa na terenie całej Polski — do płatności doliczamy tylko
  // cenę produktów (minus rabat). Pole delivery_cost w panelu admina zostaje
  // do ewentualnych rozliczeń wewnętrznych, ale klientowi nic nie doliczamy.
  const discount = appliedPromo?.discount ?? 0;
  const grandTotal = Math.max(0, total - discount);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptedTerms) {
      setError(
        de
          ? "Sie müssen die AGB und die Datenschutzerklärung akzeptieren, um fortzufahren."
          : "Musisz zaakceptować regulamin i politykę prywatności, żeby kontynuować."
      );
      return;
    }
    // Walidacja UX — serwer i tak sprawdza autorytatywnie (isValidCodPhone).
    if (isCod && !isValidCodPhone(phone)) {
      setError(c.codPhoneError);
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            id: i.id,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            image: i.image,
            variantValues: i.variantValues,
            notes: i.notes,
          })),
          email,
          fullName,
          address: {
            street,
            city,
            postal_code: postalCode,
            country,
            fullname: fullName,
            phone: phone.trim() || undefined,
          },
          promoCode: appliedPromo?.code ?? null,
          locale: de ? "de" : "pl",
          paymentMethod,
        }),
      });

      const text = await res.text();
      let data: { url?: string; error?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(
          de
            ? `Der Server hat eine ungültige Antwort zurückgegeben (${res.status}): ${text.slice(0, 200)}`
            : `Serwer zwrócił nieprawidłową odpowiedź (${res.status}): ${text.slice(0, 200)}`
        );
      }

      if (!res.ok) {
        throw new Error(
          data.error ?? (de ? `Fehler ${res.status}` : `Błąd ${res.status}`)
        );
      }
      if (!data.url) {
        throw new Error(
          de
            ? "Keine Zahlungs-URL in der Antwort"
            : "Brak URL płatności w odpowiedzi"
        );
      }
      window.location.href = data.url;
    } catch (err) {
      console.error("Checkout form error:", err);
      setError(
        err instanceof Error
          ? err.message
          : de
            ? `Unbekannter Fehler: ${String(err)}`
            : `Nieznany błąd: ${String(err)}`
      );
      setLoading(false);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
      {!isLoggedIn && (
        <div className="lg:col-span-3 -mt-4 mb-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl px-5 py-3 text-sm text-[var(--muted)] flex flex-wrap items-center gap-2">
          <span>{c.haveAccount}</span>
          <Link
            href={localizeHref("/logowanie", locale)}
            className="text-[var(--color-gold)] font-semibold hover:underline"
          >
            {c.login}
          </Link>
          <span className="text-xs">{c.autofill}</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="lg:col-span-2 flex flex-col gap-6">
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
          <h2 className="font-display text-xl font-bold text-[var(--fg)] mb-6">
            {c.contact}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label={c.fullName}
              value={fullName}
              onChange={setFullName}
              required
            />
            <Field
              label={c.email}
              type="email"
              value={email}
              onChange={setEmail}
              required
              readOnly={isLoggedIn}
            />
          </div>
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
          <h2 className="font-display text-xl font-bold text-[var(--fg)] mb-6">
            {c.deliveryAddress}
          </h2>
          <div className="flex flex-col gap-4">
            <Field
              label={c.streetAndNumber}
              value={street}
              onChange={setStreet}
              required
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label={c.postalCode}
                value={postalCode}
                onChange={setPostalCode}
                placeholder="00-000"
                required
              />
              <Field label={c.city} value={city} onChange={setCity} required />
            </div>
            <div>
              <Field
                label={c.phone}
                type="tel"
                value={phone}
                onChange={setPhone}
                placeholder="+48 600 000 000"
                required={isCod}
              />
              <p className="mt-1.5 text-xs text-[var(--muted)]">{c.phoneCodNote}</p>
            </div>
            <Field
              label={c.country}
              value={country}
              onChange={setCountry}
              required
            />
          </div>
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
          <h2 className="font-display text-xl font-bold text-[var(--fg)] mb-6">
            {c.paymentMethod}
          </h2>
          <div className="flex flex-col gap-3">
            {(
              [
                { value: "online", label: c.payOnline, desc: c.payOnlineDesc },
                { value: "cod", label: c.payCod, desc: c.payCodDesc },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                  paymentMethod === opt.value
                    ? "border-[var(--color-gold)] bg-[var(--bg)]"
                    : "border-[var(--border)] hover:border-[var(--color-gold)]"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={opt.value}
                  checked={paymentMethod === opt.value}
                  onChange={() => setPaymentMethod(opt.value)}
                  className="mt-1 w-4 h-4 accent-[var(--color-gold)] shrink-0"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-sm text-[var(--fg)]">{opt.label}</span>
                  <span className="text-xs text-[var(--muted)]">{opt.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Wymagana akceptacja regulaminu + polityki — wymóg art. 17 ustawy
            o prawach konsumenta + kryterium weryfikacji Przelewy24 (§2 ust. 11 OWU) */}
        <label className="flex items-start gap-3 text-sm text-[var(--fg)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            required
            className="mt-0.5 w-4 h-4 accent-[var(--color-gold)] cursor-pointer shrink-0"
          />
          <span className="leading-relaxed">
            {c.agreePrefix}{" "}
            <Link
              href={localizeHref("/regulamin", locale)}
              target="_blank"
              className="text-[var(--color-gold-text)] underline hover:opacity-80"
            >
              {c.terms}
            </Link>{" "}
            {c.and}{" "}
            <Link
              href={localizeHref("/prywatnosc", locale)}
              target="_blank"
              className="text-[var(--color-gold-text)] underline hover:opacity-80"
            >
              {c.privacy}
            </Link>
            {c.agreeSuffix} <span className="text-red-500">*</span>
          </span>
        </label>

        <button
          type="submit"
          disabled={loading || !acceptedTerms}
          className="w-full py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? c.redirecting : isCod ? c.placeOrder : c.payNow}
        </button>

        <Link
          href={localizeHref("/koszyk", locale)}
          className="text-center text-xs font-sans text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors uppercase tracking-widest"
        >
          {c.backToCart}
        </Link>
      </form>

      <div className="lg:col-span-1">
        <div className="sticky top-40 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8 flex flex-col gap-6">
          <h2 className="font-display text-2xl font-bold text-[var(--fg)]">
            {c.order} ({count})
          </h2>

          <div className="flex flex-col gap-4 max-h-64 overflow-y-auto">
            {items.map((item) => {
              const key = cartItemKey(item.id, item.variantValues);
              return (
                <div key={key} className="flex gap-3">
                  <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0">
                    {item.image && (
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-sm">
                    <p className="font-semibold text-[var(--fg)] truncate">
                      {item.name}
                    </p>
                    {item.variantValues && (
                      <p className="text-[11px] text-[var(--muted)] truncate">
                        {formatVariantLabel(item.variantValues, locale, fabricMap)}
                      </p>
                    )}
                    <p className="text-xs text-[var(--muted)]">
                      {item.quantity} × {formatMoney(item.price, locale, rate)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[var(--fg)] whitespace-nowrap">
                    {formatMoney(item.price * item.quantity, locale, rate)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="border-t border-[var(--border)] pt-4 flex flex-col gap-2 text-sm">
            <div className="flex justify-between text-[var(--muted)]">
              <span>{c.products}</span>
              <span>{formatMoney(total, locale, rate)}</span>
            </div>
            {appliedPromo && discount > 0 && (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <span className="font-mono">{appliedPromo.code}</span>
                <span>−{formatMoney(discount, locale, rate)}</span>
              </div>
            )}
            <div className="flex justify-between items-start text-[var(--muted)] gap-3">
              <span className="shrink-0">{c.shipping}</span>
              <span className="text-right text-xs leading-snug">
                {c.shippingFrom}
                <br />
                <span className="text-[var(--muted)]">{c.shippingNote}</span>
              </span>
            </div>
            <p className="text-xs text-[var(--muted)] leading-snug pt-1">
              {c.shippingNotice}{" "}
              <LocalizedLink href="/dostawa" className="text-[var(--color-gold)] hover:underline">
                {c.shippingNoticeLink}
              </LocalizedLink>
            </p>
            <div className="border-t border-[var(--border)] pt-2 flex justify-between font-bold text-base text-[var(--fg)]">
              <span>{c.total}</span>
              <span>{formatMoney(grandTotal, locale, rate)}</span>
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)] space-y-1">
            <p>{isCod ? c.codSidebarNote : c.payment}</p>
            <p>{c.ssl}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        readOnly={readOnly}
        className="px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] transition-colors read-only:opacity-70 read-only:cursor-not-allowed"
      />
    </label>
  );
}
