"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { submitOrderIssue, uploadIssuePhoto } from "@/app/konto/zamowienia/actions";
import { compressIfNeeded } from "@/app/_lib/image-compress";
import {
  ORDER_ISSUE_CATEGORIES,
  orderIssueCategoryLabel,
} from "@/app/_lib/order-issues";
import { useModal } from "@/app/_lib/useModal";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";

// Modal "Zgłoś problem z zamówieniem" — przycisk + formularz (kategoria, pozycja,
// opis, 1-5 zdjęć). Wzorzec jak InquiryModal. Wysyła przez submitOrderIssue.
export default function OrderIssueModal({
  orderId,
  items,
}: {
  orderId: string;
  items: { id: string; label: string }[];
}) {
  const locale = useClientLocale();
  const t = getDictionary(locale);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [result, setResult] = useState<
    { ok: true; message: string } | { ok: false; error: string } | null
  >(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setTimeout(() => {
      setResult(null);
      setPhotos([]);
    }, 200);
  }
  useModal(open, { onClose: close, containerRef: dialogRef, trapFocus: true });

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (photos.length >= 5) return;
    setUploading(true);
    try {
      const toSend = await compressIfNeeded(file);
      const fd = new FormData();
      fd.set("photo", toSend, toSend.name);
      const res = await uploadIssuePhoto(fd);
      if (res.ok) setPhotos((prev) => [...prev, res.url]);
      else setResult({ ok: false, error: res.error });
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-3 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
      >
        {t.orderIssue.triggerButton}
      </button>

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={t.orderIssue.dialogAria}
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
                  {t.orderIssue.eyebrow}
                </p>
                <h2 className="font-display text-2xl font-bold text-[var(--fg)] leading-tight">
                  {t.orderIssue.heading}
                </h2>
              </div>
              <button
                onClick={close}
                aria-label={t.common.close}
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
                  {t.orderIssue.sentTitle}
                </p>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">{result.message}</p>
                <button
                  onClick={close}
                  className="mt-4 px-5 py-2 text-xs font-sans uppercase tracking-widest border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors"
                >
                  {t.common.close}
                </button>
              </div>
            ) : (
              <form
                action={(fd) => {
                  fd.set("photos", JSON.stringify(photos));
                  startTransition(async () => setResult(await submitOrderIssue(fd)));
                }}
                className="flex flex-col gap-4"
              >
                <input type="hidden" name="order_id" value={orderId} />

                <Field label={t.orderIssue.categoryLabel} required>
                  <select name="category" required defaultValue="" className={inputCls}>
                    <option value="" disabled>
                      —
                    </option>
                    {ORDER_ISSUE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {orderIssueCategoryLabel(cat, locale)}
                      </option>
                    ))}
                  </select>
                </Field>

                {items.length > 0 && (
                  <Field label={t.orderIssue.itemLabel}>
                    <select name="order_item_id" defaultValue="" className={inputCls}>
                      <option value="">{t.orderIssue.wholeOrder}</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                <Field label={t.orderIssue.messageLabel} required hint={t.orderIssue.messageHint}>
                  <textarea
                    name="message"
                    required
                    minLength={5}
                    maxLength={2000}
                    rows={4}
                    placeholder={t.orderIssue.messagePlaceholder}
                    className={`${inputCls} resize-y`}
                  />
                </Field>

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
                    {t.orderIssue.photosLabel}
                  </span>
                  {photos.length > 0 && (
                    <ul className="grid grid-cols-4 gap-2">
                      {photos.map((url, i) => (
                        <li key={url} className="relative aspect-square rounded-lg overflow-hidden border border-[var(--border)]">
                          <Image src={url} alt={`${t.orderIssue.photoAlt} ${i + 1}`} fill sizes="100px" className="object-cover" />
                          <button
                            type="button"
                            onClick={() => setPhotos((prev) => prev.filter((u) => u !== url))}
                            aria-label={t.orderIssue.removePhoto}
                            className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white text-xs"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {photos.length < 5 && (
                    <label className="self-start px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors cursor-pointer">
                      {uploading ? t.orderIssue.uploading : t.orderIssue.addPhoto}
                      <input type="file" accept="image/*" disabled={uploading} onChange={onPickPhoto} className="hidden" />
                    </label>
                  )}
                  <span className="text-[11px] text-[var(--muted)]">{t.orderIssue.photosHint}</span>
                </div>

                {result && !result.ok && (
                  <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={pending || uploading}
                    className="flex-1 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
                  >
                    {pending ? t.orderIssue.submitting : t.orderIssue.submit}
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    disabled={pending}
                    className="px-5 py-3 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
                  >
                    {t.orderIssue.cancel}
                  </button>
                </div>

                <p className="text-xs text-[var(--muted)] leading-snug">{t.orderIssue.privacyNote}</p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

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
        {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-[var(--muted)]">{hint}</span>}
    </label>
  );
}
