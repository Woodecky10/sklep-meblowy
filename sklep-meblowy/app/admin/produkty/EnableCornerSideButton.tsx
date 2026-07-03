"use client";

import { useState, useTransition } from "react";
import { useConfirm } from "@/app/_context/ConfirmContext";
import { enableCornerSideForCategory } from "./actions";

// TYMCZASOWY przycisk backfillu (spec 2026-07-03-naroznik-strona): włącza wybór
// strony wszystkim produktom kategorii naroznik-l. Idempotentny (pomija produkty
// z opcją side-like), ale po potwierdzonym wykonaniu na produkcji USUNĄĆ ten
// komponent i jego użycie w page.tsx — ponowne kliknięcie za pół roku
// nadpisałoby świadome wyłączenia (opt-outy) adminów.
export default function EnableCornerSideButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const confirm = useConfirm();

  async function handleClick() {
    const ok = await confirm({
      message:
        "Włączyć wybór strony (Lewostronny/Prawostronny) wszystkim produktom kategorii naroznik-l? Produkty, które już mają opcję strony, zostaną pominięte.",
    });
    if (!ok) return;
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await enableCornerSideForCategory();
      if (res.ok) setMsg(res.message ?? "Gotowe");
      else setErr(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={pending}
        className="shrink-0 px-5 py-3 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors disabled:opacity-50"
      >
        {pending ? "Włączam..." : "Włącz wybór strony (narożniki L)"}
      </button>
      {msg && <span className="text-[10px] text-green-600">{msg}</span>}
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </div>
  );
}
