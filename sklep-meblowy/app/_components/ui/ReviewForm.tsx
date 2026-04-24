"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import StarInput from "./StarInput";
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
  const [rating, setRating] = useState<number>(existingReview?.rating ?? 0);
  const [comment, setComment] = useState<string>(existingReview?.comment ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rating < 1) {
      setError("Wybierz ocenę (1–5 gwiazdek)");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Nie udało się zapisać opinii");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nieznany błąd");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!confirm("Usunąć swoją opinię?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reviews?productId=${productId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Nie udało się usunąć opinii");
      setRating(0);
      setComment("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nieznany błąd");
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
          {existingReview ? "Edytuj swoją opinię" : "Napisz opinię"}
        </h3>
        <p className="text-xs text-[var(--muted)]">
          Twoja ocena będzie widoczna publicznie. Dziękujemy za pomoc innym klientom.
        </p>
      </div>

      <div>
        <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
          Ocena
        </p>
        <StarInput value={rating} onChange={setRating} />
      </div>

      <div>
        <label
          htmlFor="review-comment"
          className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2 block"
        >
          Komentarz (opcjonalnie)
        </label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Co sądzisz o produkcie? Jak się sprawdza w codziennym użytkowaniu?"
          className="w-full px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] transition-colors resize-y"
        />
        <p className="text-xs text-[var(--muted)] mt-1 text-right">
          {comment.length}/2000
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
          {error}
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
            Usuń opinię
          </button>
        )}
        <button
          type="submit"
          disabled={loading || rating < 1}
          className="ml-auto px-6 py-3 bg-[var(--color-navy)] text-white font-sans text-xs font-semibold uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Zapisuję..." : existingReview ? "Zaktualizuj" : "Opublikuj opinię"}
        </button>
      </div>
    </form>
  );
}
