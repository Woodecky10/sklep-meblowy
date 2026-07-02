"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  linkSizeSibling,
  unlinkSizeSibling,
  updateSizeLabel,
  searchProductsForSizeGroup,
} from "../actions";
import type { ActionResult } from "@/app/_lib/types";
import type { SizeGroupMember } from "@/app/_lib/products";
import { inputClass, type Toast } from "./_shared";

type Candidate = {
  id: string;
  name: string;
  size_group: string | null;
  size_label: string | null;
};

export default function SizeGroupEditor({
  currentId,
  members,
  onToast,
}: {
  currentId: string;
  members: SizeGroupMember[];
  onToast: (t: Toast) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  // Lokalne edycje etykiet; fallback do wartości z propa members.
  const [labels, setLabels] = useState<Record<string, string>>({});

  function labelOf(m: SizeGroupMember): string {
    return labels[m.id] ?? m.size_label ?? "";
  }

  function handle(res: ActionResult) {
    if (res.ok) {
      onToast({ type: "success", message: res.message ?? "Zapisano" });
      router.refresh();
    } else {
      onToast({ type: "error", message: res.error });
    }
  }

  async function runSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setCandidates([]);
      return;
    }
    const res = await searchProductsForSizeGroup(currentId, q);
    if (!res.ok) {
      onToast({ type: "error", message: res.error });
      return;
    }
    const memberIds = new Set(members.map((m) => m.id));
    const results = (res.data as { results: Candidate[] }).results;
    setCandidates(results.filter((c) => !memberIds.has(c.id)));
  }

  function add(c: Candidate) {
    // Kandydat nie jest członkiem bieżącej grupy (przefiltrowany), więc jego
    // niepusty size_group = INNA grupa → pytamy o scalenie.
    if (c.size_group) {
      const ok = window.confirm(
        "Ten produkt jest już w innej grupie rozmiarów — połączyć obie grupy?"
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const res = await linkSizeSibling(currentId, c.id);
      setQuery("");
      setCandidates([]);
      handle(res);
    });
  }

  function unlink(id: string) {
    startTransition(async () => handle(await unlinkSizeSibling(id)));
  }

  function saveLabel(m: SizeGroupMember) {
    startTransition(async () => handle(await updateSizeLabel(m.id, labelOf(m))));
  }

  return (
    <div className="md:col-span-2 flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4">
      <div>
        <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          Rozmiary tego mebla
        </p>
        <p className="text-[11px] text-[var(--muted)]">
          Połącz osobne produkty tego samego mebla w różnych rozmiarach. Klient
          wybierając rozmiar przejdzie na odpowiedni produkt.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {members.map((m) => {
          const isCurrent = m.id === currentId;
          const empty = !labelOf(m).trim();
          return (
            <li key={m.id} className="flex items-center gap-2">
              <span
                className={`flex-1 text-sm truncate ${
                  isCurrent ? "font-semibold text-[var(--color-gold)]" : ""
                }`}
              >
                {isCurrent ? (
                  `» ${m.name}`
                ) : (
                  <Link href={`/admin/produkty/${m.id}`} className="hover:underline">
                    {m.name}
                  </Link>
                )}
              </span>
              <input
                value={labelOf(m)}
                onChange={(e) =>
                  setLabels((p) => ({ ...p, [m.id]: e.target.value }))
                }
                onBlur={() => saveLabel(m)}
                placeholder="np. 140×200 cm"
                maxLength={100}
                className={`${inputClass} max-w-[10rem]`}
              />
              {empty && (
                <span
                  className="text-[11px] text-amber-500"
                  title="Bez etykiety klient zobaczy nazwę produktu"
                >
                  ⚠
                </span>
              )}
              {members.length > 1 && (
                <button
                  type="button"
                  onClick={() => unlink(m.id)}
                  disabled={pending}
                  className="text-xs text-red-500 hover:underline disabled:opacity-40"
                >
                  Odłącz
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1">
        <input
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="Dodaj rozmiar — wpisz nazwę produktu…"
          className={inputClass}
        />
        {candidates.length > 0 && (
          <ul className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => add(c)}
                  disabled={pending}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-gold)]/5 disabled:opacity-40"
                >
                  {c.name}
                  {c.size_group && (
                    <span className="text-[11px] text-amber-500"> (w innej grupie)</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
