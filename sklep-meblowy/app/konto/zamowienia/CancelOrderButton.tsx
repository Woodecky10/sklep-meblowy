"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelOrder } from "./actions";

// Anulowanie zamówienia przez klienta. Wymaga potwierdzenia żeby uniknąć
// przypadkowych kliknięć. Po sukcesie odświeża stronę (revalidatePath
// na serverze już zaktualizował cache).
export default function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!window.confirm("Czy na pewno chcesz anulować to zamówienie? Tej operacji nie da się cofnąć.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await cancelOrder(orderId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 items-start">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-2 px-5 py-2.5 border border-red-300 dark:border-red-900 text-red-600 font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-60"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        {pending ? "Anulowanie..." : "Anuluj zamówienie"}
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
