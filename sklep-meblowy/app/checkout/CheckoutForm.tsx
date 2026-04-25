"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useCart, cartItemKey } from "@/app/_context/CartContext";
import { formatVariantLabel } from "@/app/_lib/variants";
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
  const { items, total, count } = useCart();

  const [fullName, setFullName] = useState(defaultFullName);
  const [email, setEmail] = useState(defaultEmail);
  const [street, setStreet] = useState(defaultAddress?.street ?? "");
  const [city, setCity] = useState(defaultAddress?.city ?? "");
  const [postalCode, setPostalCode] = useState(defaultAddress?.postal_code ?? "");
  const [country, setCountry] = useState(defaultAddress?.country ?? "Polska");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      router.replace("/koszyk");
    }
  }, [items.length, router]);

  const shipping = total >= 2000 ? 0 : 299;
  const grandTotal = total + shipping;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          })),
          email,
          fullName,
          address: {
            street,
            city,
            postal_code: postalCode,
            country,
            fullname: fullName,
          },
        }),
      });

      const text = await res.text();
      let data: { url?: string; error?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(
          `Serwer zwrócił nieprawidłową odpowiedź (${res.status}): ${text.slice(0, 200)}`
        );
      }

      if (!res.ok) {
        throw new Error(data.error ?? `Błąd ${res.status}`);
      }
      if (!data.url) {
        throw new Error("Brak URL płatności w odpowiedzi");
      }
      window.location.href = data.url;
    } catch (err) {
      console.error("Checkout form error:", err);
      setError(
        err instanceof Error ? err.message : `Nieznany błąd: ${String(err)}`
      );
      setLoading(false);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
      {!isLoggedIn && (
        <div className="lg:col-span-3 -mt-4 mb-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl px-5 py-3 text-sm text-[var(--muted)] flex flex-wrap items-center gap-2">
          <span>Masz już konto?</span>
          <Link
            href="/logowanie"
            className="text-[var(--color-gold)] font-semibold hover:underline"
          >
            Zaloguj się
          </Link>
          <span className="text-xs">— dane wypełnią się automatycznie.</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="lg:col-span-2 flex flex-col gap-6">
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
          <h2 className="font-display text-xl font-bold text-[var(--fg)] mb-6">
            Kontakt
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Imię i nazwisko"
              value={fullName}
              onChange={setFullName}
              required
            />
            <Field
              label="Email"
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
            Adres dostawy
          </h2>
          <div className="flex flex-col gap-4">
            <Field
              label="Ulica i numer"
              value={street}
              onChange={setStreet}
              required
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Kod pocztowy"
                value={postalCode}
                onChange={setPostalCode}
                placeholder="00-000"
                required
              />
              <Field label="Miasto" value={city} onChange={setCity} required />
            </div>
            <Field
              label="Kraj"
              value={country}
              onChange={setCountry}
              required
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Przekierowuję..." : "Zapłać bezpiecznie →"}
        </button>

        <Link
          href="/koszyk"
          className="text-center text-xs font-sans text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors uppercase tracking-widest"
        >
          ← Wróć do koszyka
        </Link>
      </form>

      <div className="lg:col-span-1">
        <div className="sticky top-24 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8 flex flex-col gap-6">
          <h2 className="font-display text-2xl font-bold text-[var(--fg)]">
            Zamówienie ({count})
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
                        {formatVariantLabel(item.variantValues)}
                      </p>
                    )}
                    <p className="text-xs text-[var(--muted)]">
                      {item.quantity} ×{" "}
                      {item.price.toLocaleString("pl-PL")} zł
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[var(--fg)] whitespace-nowrap">
                    {(item.price * item.quantity).toLocaleString("pl-PL")} zł
                  </p>
                </div>
              );
            })}
          </div>

          <div className="border-t border-[var(--border)] pt-4 flex flex-col gap-2 text-sm">
            <div className="flex justify-between text-[var(--muted)]">
              <span>Produkty</span>
              <span>{total.toLocaleString("pl-PL")} zł</span>
            </div>
            <div className="flex justify-between text-[var(--muted)]">
              <span>Dostawa</span>
              <span>
                {shipping === 0 ? (
                  <span className="text-green-600 font-semibold">Gratis</span>
                ) : (
                  `${shipping} zł`
                )}
              </span>
            </div>
            <div className="border-t border-[var(--border)] pt-2 flex justify-between font-bold text-base text-[var(--fg)]">
              <span>Razem</span>
              <span>{grandTotal.toLocaleString("pl-PL")} zł</span>
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)] space-y-1">
            <p>🔒 Płatność Stripe (karta, BLIK, Przelewy24)</p>
            <p>✓ Szyfrowanie SSL</p>
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
