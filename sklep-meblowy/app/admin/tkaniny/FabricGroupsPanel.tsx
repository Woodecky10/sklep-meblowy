"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, inputCls } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";
import { updateFabricGroup, type ActionResult } from "./actions";
import type { FabricPriceGroup } from "@/app/_lib/types";

// Edycja 3 stałych grup cenowych (nazwy PL/DE + dopłata). Zapis przelicza
// dopłaty we wszystkich produktach — stąd confirm przed submitem.
export default function FabricGroupsPanel({
  groups,
  onResult,
}: {
  groups: FabricPriceGroup[];
  onResult: (res: ActionResult) => void;
}) {
  return (
    <Card>
      <h2 className="font-display text-xl font-semibold text-[var(--fg)] mb-1">
        Grupy cenowe
      </h2>
      <p className="text-xs text-[var(--muted)] mb-4">
        Dopłata grupy dolicza się do ceny produktu przy każdej tkaninie z tej
        grupy (plus ewentualna korekta tkaniny). Zapis przelicza dopłaty we
        wszystkich produktach.
      </p>
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <GroupRow key={g.id} group={g} onResult={onResult} />
        ))}
      </div>
    </Card>
  );
}

function GroupRow({
  group,
  onResult,
}: {
  group: FabricPriceGroup;
  onResult: (res: ActionResult) => void;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(group.name);
  const [nameDe, setNameDe] = useState(group.name_de ?? "");
  const [surcharge, setSurcharge] = useState(String(group.surcharge));

  async function save() {
    if (
      !(await confirm({
        message: `Zapisać grupę "${name}"? Dopłaty zostaną przeliczone we wszystkich produktach z tkaninami.`,
      }))
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("id", group.id);
    fd.set("name", name);
    fd.set("name_de", nameDe);
    fd.set("surcharge", surcharge);
    startTransition(async () => {
      const res = await updateFabricGroup(fd);
      onResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_8rem_auto] gap-3 items-end bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3">
      <Field label={`Nazwa (PL) · ${group.code}`}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputCls} />
      </Field>
      <Field label="Nazwa (DE)" hint="Puste → na /de nazwa PL.">
        <input value={nameDe} onChange={(e) => setNameDe(e.target.value)} maxLength={100} className={inputCls} />
      </Field>
      <Field label="Dopłata (zł)">
        <input type="number" step="0.01" min="0" value={surcharge} onChange={(e) => setSurcharge(e.target.value)} className={inputCls} />
      </Field>
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="px-4 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
      >
        {pending ? "Zapisuję…" : "Zapisz"}
      </button>
    </div>
  );
}
