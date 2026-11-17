"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, inputCls } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";
import {
  createFabricSize,
  updateFabricSize,
  deleteFabricSize,
} from "./size-actions";
import type { ActionResult } from "./actions";
import type { FabricSize } from "@/app/_lib/fabric-sizes";
import type { FabricPriceGroup } from "@/app/_lib/types";

const btnPrimary =
  "px-4 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50";
const btnDanger =
  "px-4 py-2.5 border border-red-300 text-red-700 font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-red-50 transition-colors disabled:opacity-50";

// Rozmiary mebli (fotel, sofa, narożnik…) z własną dopłatą za każdą grupę cenową.
export default function FabricSizesPanel({
  sizes,
  groups,
  onResult,
}: {
  sizes: FabricSize[];
  groups: FabricPriceGroup[];
  onResult: (res: ActionResult) => void;
}) {
  return (
    <Card>
      <h2 className="font-display text-xl font-semibold text-[var(--fg)] mb-1">
        Rozmiary mebli do dopłat za tkaninę
      </h2>
      <p className="text-xs text-[var(--muted)] mb-4">
        Każdy rozmiar ma własną dopłatę za każdą grupę cenową; puste pole =
        dopłata grupy z panelu powyżej. Produkt bierze rozmiar ze swojej
        kategorii, chyba że ustawisz mu inny. Produkt bez rozmiaru dopłaca
        według grup cenowych powyżej.
      </p>
      <div className="flex flex-col gap-3">
        {sizes.map((s) => (
          <SizeRow key={s.id} size={s} groups={groups} onResult={onResult} />
        ))}
      </div>
      <h3 className="font-display text-lg font-semibold text-[var(--fg)] mt-6 mb-2">
        Dodaj rozmiar
      </h3>
      <SizeRow size={null} groups={groups} onResult={onResult} />
    </Card>
  );
}

function SizeRow({
  size,
  groups,
  onResult,
}: {
  size: FabricSize | null;
  groups: FabricPriceGroup[];
  onResult: (res: ActionResult) => void;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(size?.name ?? "");
  // Grupa bez kwoty w rozmiarze = puste pole (globalna dopłata grupy), nie 0.
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      groups.map((g) => {
        const v = size?.surcharges[g.code];
        return [g.code, typeof v === "number" ? String(v) : ""];
      })
    )
  );

  function buildForm(): FormData {
    const fd = new FormData();
    if (size) {
      fd.set("id", size.id);
      fd.set("sort_order", String(size.sort_order));
    }
    fd.set("name", name);
    for (const g of groups) fd.set(`surcharge_${g.code}`, amounts[g.code] ?? "");
    return fd;
  }

  async function save() {
    if (
      size &&
      !(await confirm({
        message: `Zapisać rozmiar "${name}"? Dopłaty zostaną przeliczone w produktach, które go używają.`,
      }))
    ) {
      return;
    }
    const fd = buildForm();
    startTransition(async () => {
      const res = size ? await updateFabricSize(fd) : await createFabricSize(fd);
      onResult(res);
      if (res.ok) {
        if (!size) {
          setName("");
          setAmounts(Object.fromEntries(groups.map((g) => [g.code, ""])));
        }
        router.refresh();
      }
    });
  }

  async function remove() {
    if (!size) return;
    if (
      !(await confirm({
        message: `Usunąć rozmiar "${size.name}"? Produkty i kategorie, które go używają, wrócą do dopłat z kategorii albo grup cenowych.`,
      }))
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("id", size.id);
    startTransition(async () => {
      const res = await deleteFabricSize(fd);
      onResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3">
      {/* Nazwa + po kolumnie na każdą z trzech (stałych) grup cenowych.
          auto-fit nie może stać obok ścieżki 1fr — przeglądarka odrzuca
          wtedy całą regułę, stąd jawne kolumny. */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(10rem,2fr)_repeat(3,minmax(0,1fr))] gap-3 items-end">
        <Field label="Nazwa">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputCls} />
        </Field>
        {groups.map((g) => (
          <Field key={g.id} label={`Dopłata ${g.name} (zł)`}>
            {/* Puste = globalna dopłata grupy (podpowiedź), 0 trzeba wpisać. */}
            <input
              type="number"
              step="0.01"
              min="0"
              value={amounts[g.code] ?? ""}
              placeholder={`jak grupa: ${g.surcharge}`}
              onChange={(e) => setAmounts((a) => ({ ...a, [g.code]: e.target.value }))}
              className={inputCls}
            />
          </Field>
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={save} disabled={pending} className={btnPrimary}>
          {pending ? "Zapisuję…" : size ? "Zapisz" : "Dodaj"}
        </button>
        {size && (
          <button type="button" onClick={remove} disabled={pending} className={btnDanger}>
            Usuń
          </button>
        )}
      </div>
    </div>
  );
}
