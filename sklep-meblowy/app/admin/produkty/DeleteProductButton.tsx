"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/_context/ToastContext";
import { useConfirm } from "@/app/_context/ConfirmContext";
import { deleteProduct } from "./actions";

// Przycisk usuwania produktu na liście /admin/produkty.
// Confirm dialog + server action + router.refresh() po sukcesie (Next.js
// re-renderuje stronę i produkt znika z listy bez optimistic state).
// Błąd pokazujemy alertem — proste, minimalistyczne, dziala wszędzie.
export default function DeleteProductButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const showToast = useToast();
  const confirm = useConfirm();

  async function handleClick() {
    // Spłaszcz newline'y w nazwie — gdyby admin przez przypadek wpisał
    // wieloliniową nazwę, dialog zostałby rozjechany i user mógłby nie
    // wiedzieć co potwierdza.
    const safeName = productName.replace(/[\r\n]+/g, " ").trim();
    const ok = await confirm({
      message:
        `Usunąć produkt "${safeName}"?\n\n` +
        "Tej operacji nie da się cofnąć. Produkt zniknie ze sklepu, " +
        "z list ulubionych klientów i z polecanych. " +
        "Historia zamówień zostanie nienaruszona — jeśli produkt ma " +
        "zamówienia, usuwanie nie powiedzie się.",
      danger: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", productId);
      const res = await deleteProduct(fd);
      if (!res.ok) {
        showToast(`Nie udało się usunąć: ${res.error}`, "error");
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="shrink-0 px-4 py-2 text-xs font-sans uppercase tracking-widest text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label={`Usuń produkt ${productName}`}
    >
      {isPending ? "Usuwam…" : "Usuń"}
    </button>
  );
}
