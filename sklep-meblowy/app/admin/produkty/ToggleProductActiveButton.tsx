"use client";

import { useState, useTransition } from "react";
import { setProductActive } from "./actions";

export default function ToggleProductActiveButton({
  productId,
  isActive,
}: {
  productId: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleClick() {
    setErr(null);
    startTransition(async () => {
      const res = await setProductActive(productId, !isActive);
      if (!res.ok) setErr(res.error);
    });
  }

  return (
    <div className="shrink-0 flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={pending}
        className="px-4 py-2 text-xs font-sans uppercase tracking-widest rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors disabled:opacity-50"
      >
        {pending ? "..." : isActive ? "Ukryj" : "Przywróć"}
      </button>
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </div>
  );
}
