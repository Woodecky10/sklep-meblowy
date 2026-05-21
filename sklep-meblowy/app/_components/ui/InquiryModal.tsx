"use client";

import { useState, useTransition } from "react";
import { submitInquiry } from "@/app/produkt/actions";

// Modal "Zapytaj o inne kolory / własny wariant" — otwarty przyciskiem
// na karcie produktu. Wysyła zapytanie do tabeli product_inquiries,
// admin moderuje w /admin/zapytania.
export default function InquiryModal({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { ok: true; message: string } | { ok: false; error: string } | null
  >(null);

  function close() {
    setOpen(false);
    // Reset wyniku po krótkim opóźnieniu żeby animacja zamknięcia nie była
    // przerwana zmianą zawartości.
    setTimeout(() => setResult(null), 200);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-3 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
      >
        Zapytaj o inne kolory
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Zapytanie o niestandardowy wariant"
          onClick={close}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col gap-5 p-6 my-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-1">
                  Pytanie
                </p>
                <h2 className="font-display text-2xl font-bold text-[var(--fg)] leading-tight">
                  Inny kolor, własny wariant?
                </h2>
                <p className="text-sm text-[var(--muted)] mt-2">
                  Produkt: <strong className="text-[var(--fg)]">{productName}</strong>
                </p>
              </div>
              <button
                onClick={close}
                aria-label="Zamknij"
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {result?.ok ? (
              <div className="p-5 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-xl">
                <p className="text-sm text-emerald-800 dark:text-emerald-200 font-semibold mb-1">
                  Wiadomość wysłana ✓
                </p>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  {result.message}
                </p>
                <button
                  onClick={close}
                  className="mt-4 px-5 py-2 text-xs font-sans uppercase tracking-widest border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors"
                >
                  Zamknij
                </button>
              </div>
            ) : (
              <form
                action={(fd) => {
                  startTransition(async () => {
                    const res = await submitInquiry(fd);
                    setResult(res);
                  });
                }}
                className="flex flex-col gap-4"
              >
                <input type="hidden" name="product_id" value={productId} />
                <input type="hidden" name="product_name" value={productName} />

                <Field label="Twoje imię i nazwisko">
                  <input
                    name="customer_name"
                    maxLength={200}
                    placeholder="Anna Kowalska"
                    className={inputCls}
                  />
                </Field>

                <Field label="Email" required>
                  <input
                    type="email"
                    name="customer_email"
                    required
                    maxLength={200}
                    placeholder="anna@example.com"
                    className={inputCls}
                  />
                </Field>

                <Field label="Telefon (opcjonalny)" hint="Jeśli wolisz kontakt telefoniczny.">
                  <input
                    type="tel"
                    name="customer_phone"
                    maxLength={50}
                    placeholder="+48 789 826 403"
                    className={inputCls}
                  />
                </Field>

                <Field label="Wiadomość" required hint="Napisz jakiego koloru / wariantu szukasz.">
                  <textarea
                    name="message"
                    required
                    minLength={5}
                    maxLength={2000}
                    rows={4}
                    placeholder="Szukam wersji w kolorze butelkowej zieleni. Czy macie tkaninę Velvet w tym odcieniu?"
                    className={`${inputCls} resize-y`}
                  />
                </Field>

                {result && !result.ok && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {result.error}
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={pending}
                    className="flex-1 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
                  >
                    {pending ? "Wysyłam..." : "Wyślij zapytanie"}
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    disabled={pending}
                    className="px-5 py-3 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
                  >
                    Anuluj
                  </button>
                </div>

                <p className="text-xs text-[var(--muted)] leading-snug">
                  Twoje dane będą wykorzystane wyłącznie do odpowiedzi na to zapytanie.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// Helpers
// ============================================================

const inputCls =
  "w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-[var(--muted)]">{hint}</span>}
    </label>
  );
}
