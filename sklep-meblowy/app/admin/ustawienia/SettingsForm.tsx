"use client";

import { useState, useTransition } from "react";
import { updateEurRate } from "./actions";

// Pole kursu PLN->EUR. Liczba > 0. Przykład: 0.23 => 1 zł = 0,23 €.
export default function SettingsForm({ initialRate }: { initialRate: number }) {
  const [value, setValue] = useState(String(initialRate));
  const [saving, startSave] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function save() {
    setMsg(null);
    const rate = Number(value.replace(",", "."));
    startSave(async () => {
      const res = await updateEurRate(rate);
      setMsg(
        res.ok
          ? { ok: true, text: res.message ?? "Zapisano" }
          : { ok: false, text: res.error }
      );
    });
  }

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-sans uppercase tracking-widest text-[var(--muted)]">
          Kurs EUR (1 zł = … €)
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] w-40"
        />
      </label>
      <p className="text-xs text-[var(--muted)]">
        Ceny na <strong>/de</strong> = zaokrąglone w górę do pełnych euro
        (cena_zł × kurs). Przykład przy 0,23: 2&nbsp;199 zł → 506 €.
      </p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {saving ? "Zapisuję..." : "Zapisz kurs"}
        </button>
        {msg && (
          <span className={msg.ok ? "text-green-600 text-sm" : "text-red-600 text-sm"}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
