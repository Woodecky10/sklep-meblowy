"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleWishlist } from "@/app/_lib/wishlist-actions";
import { useToast } from "@/app/_context/ToastContext";
import { localizeHref } from "@/app/_lib/i18n";
import { useClientLocale } from "@/app/_lib/useClientLocale";

// Serce do dodawania/usuwania produktu z ulubionych.
// Optymistyczna aktualizacja UI — natychmiast pokazujemy nowy stan,
// w razie błędu z serwera robimy rollback.
//
// Niezalogowany user → przekierowanie do /logowanie (z return_to do strony).
export default function WishlistButton({
  productId,
  initialIsInWishlist,
  variant = "card",
}: {
  productId: string;
  initialIsInWishlist: boolean;
  // "card" — na ProductCard (absolutnie pozycjonowane prawy-górny róg zdjęcia)
  // "inline" — w przepływie (np. obok ceny)
  variant?: "card" | "inline";
}) {
  const [isInWishlist, setIsInWishlist] = useState(initialIsInWishlist);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const locale = useClientLocale();
  const showToast = useToast();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Optymistyczna zmiana
    const nextState = !isInWishlist;
    setIsInWishlist(nextState);

    startTransition(async () => {
      const res = await toggleWishlist(productId);
      if (res.ok) {
        // Sukces — revalidatePath w server action odświeży licznik w navbar.
        showToast(
          nextState ? "Dodano do ulubionych" : "Usunięto z ulubionych",
          "success"
        );
        return;
      }
      // Rollback
      setIsInWishlist(!nextState);
      if (res.error === "unauthenticated") {
        router.push(localizeHref("/logowanie", locale));
      } else {
        // Spójny toast zamiast blokującego alert() (audyt LOW #11).
        showToast(res.message, "error");
      }
    });
  }

  const baseClasses =
    "flex items-center justify-center rounded-full transition-all disabled:opacity-50";

  const variantClasses =
    variant === "card"
      ? "absolute top-3 right-3 w-9 h-9 bg-white/90 dark:bg-stone-900/90 hover:bg-white dark:hover:bg-stone-900 backdrop-blur-sm shadow-md z-10"
      : "w-10 h-10 border border-[var(--border)] hover:border-[var(--color-gold)]";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={isInWishlist ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
      aria-pressed={isInWishlist}
      className={`${baseClasses} ${variantClasses}`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={isInWishlist ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={
          isInWishlist
            ? "text-red-500"
            : "text-stone-700 dark:text-stone-200"
        }
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
