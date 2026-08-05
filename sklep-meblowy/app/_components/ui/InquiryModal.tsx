"use client";

import { useState, useTransition } from "react";
import { submitInquiry } from "@/app/produkt/actions";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { Field, Modal, ModalSuccess, inputCls, modalTriggerCls } from "@/app/_components/ui/Modal";

// Modal "Zapytaj o inne kolory / własny wariant" — otwarty przyciskiem
// na karcie produktu. Wysyła zapytanie do tabeli product_inquiries,
// admin moderuje w /admin/zapytania.
export default function InquiryModal({
  productId,
  productName,
  triggerLabel,
}: {
  productId: string;
  productName: string;
  // Etykieta przycisku otwierającego modal — zlokalizowana, przekazana z
  // ProductMainSection (client). Bez niej bierzemy ją (i resztę chrome modala)
  // ze słownika po locale klienta. Dynamiczne komunikaty z server action
  // (result.message / result.error) pozostają PL.
  triggerLabel?: string;
}) {
  const t = getDictionary(useClientLocale());
  const label = triggerLabel ?? t.product.inquireColors;
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
      <button type="button" onClick={() => setOpen(true)} className={modalTriggerCls}>
        {label}
      </button>

      <Modal
        open={open}
        onClose={close}
        ariaLabel={t.inquiry.dialogAria}
        eyebrow={t.inquiry.eyebrow}
        heading={t.inquiry.heading}
        closeLabel={t.common.close}
        subtitle={
          <p className="text-sm text-[var(--muted)] mt-2">
            {t.inquiry.productLabel}: <strong className="text-[var(--fg)]">{productName}</strong>
          </p>
        }
      >
        {result?.ok ? (
          <ModalSuccess
            title={t.inquiry.sentTitle}
            message={result.message}
            onClose={close}
            closeLabel={t.common.close}
          />
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

            <Field label={t.inquiry.nameLabel}>
              <input
                name="customer_name"
                maxLength={200}
                placeholder="Anna Kowalska"
                className={inputCls}
              />
            </Field>

            <Field label={t.inquiry.emailLabel} required>
              <input
                type="email"
                name="customer_email"
                required
                maxLength={200}
                placeholder="anna@example.com"
                className={inputCls}
              />
            </Field>

            <Field label={t.inquiry.phoneLabel} hint={t.inquiry.phoneHint}>
              <input
                type="tel"
                name="customer_phone"
                maxLength={50}
                placeholder="+48 600 000 000"
                className={inputCls}
              />
            </Field>

            <Field label={t.inquiry.messageLabel} required hint={t.inquiry.messageHint}>
              <textarea
                name="message"
                required
                minLength={5}
                maxLength={2000}
                rows={4}
                placeholder={t.inquiry.messagePlaceholder}
                className={`${inputCls} resize-y`}
              />
            </Field>

            {result && !result.ok && (
              <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={pending}
                className="flex-1 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
              >
                {pending ? t.inquiry.submitting : t.inquiry.submit}
              </button>
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="px-5 py-3 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
              >
                {t.inquiry.cancel}
              </button>
            </div>

            <p className="text-xs text-[var(--muted)] leading-snug">{t.inquiry.privacyNote}</p>
          </form>
        )}
      </Modal>
    </>
  );
}
