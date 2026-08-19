"use client";

import { useState } from "react";
import Image from "next/image";
import { prepareReviewPhoto } from "@/app/_lib/image-compress";
import { MAX_REVIEW_PHOTOS } from "@/app/_lib/reviews-photos";

// Wspólny widżet zdjęć dla OBU formularzy opinii — zalogowanego (ReviewForm)
// i gościa (GuestReviewForm). Te formularze różnią się wszystkim poza tym
// fragmentem: jeden jest dwujęzyczny i strzela fetchem do /api/reviews, drugi
// jest polski i woła akcję serwerową.
//
// Dlatego widżet nie zna ani języka, ani sposobu wysyłki: teksty przychodzą
// propem (każdy formularz ma własne źródło tekstów), a `upload` to domknięcie
// od rodzica, które dokłada do FormData swoje pole uprawnienia — `product_id`
// dla zalogowanego, `token` dla gościa. Widżet ustawia wyłącznie `photo`.

export type ReviewPhotoPickerTeksty = {
  label: string;
  hint: string;
  add: string;
  uploading: string;
  alt: string;
  remove: string;
  prepareFailed: string;
};

export default function ReviewPhotoPicker({
  photos,
  onChange,
  upload,
  teksty,
  disabled = false,
}: {
  photos: string[];
  onChange: React.Dispatch<React.SetStateAction<string[]>>;
  upload: (
    fd: FormData
  ) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  teksty: ReviewPhotoPickerTeksty;
  disabled?: boolean;
}) {
  const [wysylanie, setWysylanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset PRZED await: bez tego wybranie DRUGI RAZ tego samego pliku nie
    // odpala zdarzenia change (wzorzec z OrderIssueModal).
    e.target.value = "";
    if (!file || photos.length >= MAX_REVIEW_PHOTOS) return;
    setBlad(null);
    setWysylanie(true);
    try {
      let doWyslania: File;
      try {
        doWyslania = await prepareReviewPhoto(file);
      } catch {
        // Świadomie NIE wysyłamy oryginału: nieudane przekodowanie znaczy albo
        // HEIC, którego serwer i tak odrzuci, albo plik, z którego nie zdjęto
        // EXIF-u — a ten poszedłby na stronę główną. Patrz prepareReviewPhoto.
        setBlad(teksty.prepareFailed);
        return;
      }
      const fd = new FormData();
      fd.set("photo", doWyslania, doWyslania.name);
      const res = await upload(fd);
      if (res.ok)
        // Funkcjonalnie, bo między pick a upload może wylądować usunięcie.
        // Snapshot przepuściłby zmieniony plik. Re-check limitu w append.
        onChange((prev) =>
          prev.length >= MAX_REVIEW_PHOTOS ? prev : [...prev, res.url]
        );
      else setBlad(res.error);
    } finally {
      setWysylanie(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        {teksty.label}
      </span>

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 max-w-[240px]">
          {photos.map((url, i) => (
            <li
              key={url}
              className="relative aspect-square rounded-lg overflow-hidden border border-[var(--border)]"
            >
              <Image src={url} alt={`${teksty.alt} ${i + 1}`} fill sizes="80px" className="object-cover" />
              <button
                type="button"
                onClick={() => onChange((prev) => prev.filter((u) => u !== url))}
                aria-label={teksty.remove}
                className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white text-xs"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {photos.length < MAX_REVIEW_PHOTOS && (
        <label className="self-start px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors cursor-pointer">
          {wysylanie ? teksty.uploading : teksty.add}
          <input
            type="file"
            accept="image/*"
            disabled={disabled || wysylanie}
            onChange={onPick}
            className="hidden"
          />
        </label>
      )}

      <span className="text-[11px] text-[var(--muted)]">{teksty.hint}</span>

      {blad && <span className="text-xs text-red-600 dark:text-red-400">{blad}</span>}
    </div>
  );
}
