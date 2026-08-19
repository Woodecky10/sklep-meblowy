"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import StarInput from "./StarInput";
import ReviewPhotoPicker from "./ReviewPhotoPicker";
import { uploadReviewPhoto } from "@/app/produkt/actions";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { useConfirm } from "@/app/_context/ConfirmContext";
import type { ProductReview } from "@/app/_lib/types";

// Formularz dodawania/edycji opinii. Wyświetlany tylko użytkownikom, którzy kupili
// produkt (parent — strona produktu — to ustala i przekazuje existingReview).
export default function ReviewForm({
  productId,
  existingReview,
}: {
  productId: string;
  existingReview?: ProductReview;
}) {
  const router = useRouter();
  const de = useClientLocale() === "de";
  const locale = de ? "de" : "pl";
  const c = de
    ? {
        editTitle: "Ihre Bewertung bearbeiten",
        newTitle: "Bewertung schreiben",
        intro: "Ihre Bewertung wird öffentlich sichtbar sein. Vielen Dank, dass Sie anderen Kunden helfen.",
        rating: "Bewertung",
        comment: "Kommentar (optional)",
        placeholder: "Was halten Sie von dem Produkt? Wie bewährt es sich im Alltag?",
        deleteReview: "Bewertung löschen",
        saving: "Wird gespeichert...",
        update: "Aktualisieren",
        publish: "Bewertung veröffentlichen",
        pickRating: "Bitte wählen Sie eine Bewertung (1–5 Sterne)",
        confirmDelete: "Ihre Bewertung löschen?",
        saveError: "Bewertung konnte nicht gespeichert werden",
        deleteError: "Bewertung konnte nicht gelöscht werden",
        unknownError: "Unbekannter Fehler",
        moderacja: "Vielen Dank! Ihre Bewertung ist bereits auf der Seite.",
        photosLabel: "Fotos (optional)",
        photosHint: "Bis zu 3 Fotos. Wir zeigen sie öffentlich zusammen mit Ihrer Bewertung.",
        addPhoto: "Foto hinzufügen",
        uploadingPhoto: "Wird gesendet...",
        photoAlt: "Foto zur Bewertung",
        removePhoto: "Foto entfernen",
        photoPrepareFailed:
          "Das Foto konnte nicht vorbereitet werden. Wenn es eine HEIC-Datei vom iPhone ist, senden Sie es direkt vom Telefon oder speichern Sie es als JPG.",
      }
    : {
        editTitle: "Edytuj swoją opinię",
        newTitle: "Napisz opinię",
        intro: "Twoja ocena będzie widoczna publicznie. Dziękujemy za pomoc innym klientom.",
        rating: "Ocena",
        comment: "Komentarz (opcjonalnie)",
        placeholder: "Co sądzisz o produkcie? Jak się sprawdza w codziennym użytkowaniu?",
        deleteReview: "Usuń opinię",
        saving: "Zapisuję...",
        update: "Zaktualizuj",
        publish: "Opublikuj opinię",
        pickRating: "Wybierz ocenę (1–5 gwiazdek)",
        confirmDelete: "Usunąć swoją opinię?",
        saveError: "Nie udało się zapisać opinii",
        deleteError: "Nie udało się usunąć opinii",
        unknownError: "Nieznany błąd",
        moderacja: "Dziękujemy! Twoja opinia jest już na stronie.",
        photosLabel: "Zdjęcia (opcjonalnie)",
        photosHint: "Do 3 zdjęć. Pokażemy je publicznie razem z opinią.",
        addPhoto: "Dodaj zdjęcie",
        uploadingPhoto: "Wysyłam...",
        photoAlt: "Zdjęcie do opinii",
        removePhoto: "Usuń zdjęcie",
        photoPrepareFailed:
          "Nie udało się przygotować zdjęcia. Jeśli to plik HEIC z iPhone'a, wyślij zdjęcie prosto z telefonu albo zapisz je jako JPG.",
      };
  const [rating, setRating] = useState<number>(existingReview?.rating ?? 0);
  const [comment, setComment] = useState<string>(existingReview?.comment ?? "");
  // Prefill z istniejącej opinii: edycja wysyła PEŁNĄ listę zdjęć, więc bez
  // tego pierwsza edycja skasowałaby zdjęcia dodane przy pierwszym zapisie.
  const [photos, setPhotos] = useState<string[]>(existingReview?.photos ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const confirm = useConfirm();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rating < 1) {
      setError(c.pickRating);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/reviews?locale=${locale}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, rating, comment, photos }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? c.saveError);
      setSent(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : c.unknownError);
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!(await confirm({ message: c.confirmDelete, danger: true }))) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reviews?productId=${productId}&locale=${locale}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? c.deleteError);
      setRating(0);
      setComment("");
      setPhotos([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : c.unknownError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4"
    >
      <div>
        <h3 className="font-display text-xl font-bold text-[var(--fg)] mb-1">
          {existingReview ? c.editTitle : c.newTitle}
        </h3>
        <p className="text-xs text-[var(--muted)]">
          {c.intro}
        </p>
      </div>

      <div>
        <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
          {c.rating}
        </p>
        <StarInput value={rating} onChange={setRating} />
      </div>

      <div>
        <label
          htmlFor="review-comment"
          className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2 block"
        >
          {c.comment}
        </label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={c.placeholder}
          className="w-full px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] transition-colors resize-y"
        />
        <p className="text-xs text-[var(--muted)] mt-1 text-right">
          {comment.length}/2000
        </p>
      </div>

      <ReviewPhotoPicker
        photos={photos}
        onChange={setPhotos}
        disabled={loading}
        upload={async (fd) => {
          fd.set("product_id", productId);
          return uploadReviewPhoto(fd);
        }}
        teksty={{
          label: c.photosLabel,
          hint: c.photosHint,
          add: c.addPhoto,
          uploading: c.uploadingPhoto,
          alt: c.photoAlt,
          remove: c.removePhoto,
          prepareFailed: c.photoPrepareFailed,
        }}
      />

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {sent && (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] text-[var(--fg)] rounded-xl px-4 py-3 text-sm">
          {c.moderacja}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {existingReview && (
          <button
            type="button"
            onClick={onDelete}
            disabled={loading}
            className="text-xs font-sans uppercase tracking-widest text-red-600 hover:text-red-700 transition-colors disabled:opacity-40"
          >
            {c.deleteReview}
          </button>
        )}
        <button
          type="submit"
          disabled={loading || rating < 1}
          className="ml-auto px-6 py-3 bg-[var(--color-navy)] text-white font-sans text-xs font-semibold uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? c.saving : existingReview ? c.update : c.publish}
        </button>
      </div>
    </form>
  );
}
