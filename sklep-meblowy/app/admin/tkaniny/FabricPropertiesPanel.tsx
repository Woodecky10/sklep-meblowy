"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, inputCls } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";
import FabricPropertyIconSvg from "@/app/_components/ui/FabricPropertyIcon";
import {
  FABRIC_PROPERTY_ICONS,
  FABRIC_PROPERTY_LABEL_MAX,
  isFabricPropertyIcon,
  type FabricPropertyIcon,
} from "@/app/_lib/fabric-properties";
import {
  createFabricProperty,
  updateFabricProperty,
  deleteFabricProperty,
  type ActionResult,
} from "./actions";
import type { Fabric, FabricPropertyDefRow } from "@/app/_lib/types";

// Podpisy ikonek w panelu (admin jest wyłącznie po polsku) — służą za tooltip
// i nazwę dla czytnika ekranu, bo sam piktogram bywa wieloznaczny. Record po
// FabricPropertyIcon: dorzucenie klucza do biblioteki bez podpisu nie skompiluje się.
const ICON_LABELS: Record<FabricPropertyIcon, string> = {
  drop: "Kropla — wodoodporność",
  paw: "Łapka — przyjazna zwierzętom",
  sparkle: "Iskierki — łatwa w czyszczeniu",
  leaf: "Listek — naturalne włókna",
  shield: "Tarcza — ochrona, impregnacja",
  sun: "Słońce — odporna na słońce",
  flame: "Płomień — trudnopalna",
  weave: "Splot — rodzaj tkania",
  durability: "Hantla — wytrzymałość",
  breathable: "Fale — oddychalność",
};

// Siatka ikonek do kliknięcia. Świadomie NIE w <Field>: Field renderuje
// <label>, a przyciski w <label> to interaktywna treść w etykiecie (klik
// potrafi trafić w kontrolkę zamiast w przycisk). Ten sam układ div+span+p,
// co bloki „Cechy tkaniny"/„Kolory" w FabricsEditor.
function IconPicker({
  value,
  onChange,
}: {
  value: FabricPropertyIcon | null;
  onChange: (icon: FabricPropertyIcon) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        Ikonka
      </span>
      <p className="text-[11px] text-[var(--muted)] -mt-1">
        Kliknij jedną z gotowych ikonek — pokaże się w plakietce obok nazwy.
      </p>
      <div className="flex flex-wrap gap-2">
        {FABRIC_PROPERTY_ICONS.map((icon) => (
          <button
            key={icon}
            type="button"
            onClick={() => onChange(icon)}
            title={ICON_LABELS[icon]}
            aria-label={ICON_LABELS[icon]}
            aria-pressed={value === icon}
            className={`w-10 h-10 flex items-center justify-center rounded-xl border text-[var(--fg)] transition-colors [&_svg]:w-5 [&_svg]:h-5 ${
              value === icon
                ? "border-[var(--color-gold)] bg-[var(--color-gold)]/10"
                : "border-[var(--border)] hover:border-[var(--color-gold)]"
            }`}
          >
            <FabricPropertyIconSvg icon={icon} />
          </button>
        ))}
      </div>
      {value === null && (
        <span className="text-[11px] text-[var(--muted)] italic">
          Nie wybrano ikonki — zaznacz jedną, żeby zapisać.
        </span>
      )}
    </div>
  );
}

// Karta „Cechy tkanin" — edytowalny słownik plakietek (fabric_property_defs).
// Wzorzec FabricGroupsPanel: zero <form action>, bo React 19 robi po submicie
// automatyczny form.reset() (w tym repo już raz zjadł wpisane wartości).
// Zamiast tego kontrolowane inputy + przycisk z onClick i ręczna FormData.
export default function FabricPropertiesPanel({
  defs,
  unavailable,
  fabrics,
  onResult,
}: {
  defs: FabricPropertyDefRow[];
  // true = listy nie udało się pobrać (≠ „słownik jest pusty").
  unavailable: boolean;
  fabrics: Fabric[];
  onResult: (res: ActionResult) => void;
}) {
  // Ile tkanin używa danej cechy — do komunikatu przy usuwaniu.
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of fabrics) {
      for (const code of f.properties ?? []) {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    }
    return counts;
  }, [fabrics]);

  return (
    <Card>
      <h2 className="font-display text-xl font-semibold text-[var(--fg)] mb-1">
        Cechy tkanin
      </h2>
      <p className="text-xs text-[var(--muted)] mb-4">
        Cechy pokazują się klientowi jako plakietki przy wyborze tkaniny na
        karcie produktu. Tutaj ustalasz ich listę (nazwa, tłumaczenie, ikonka),
        a przy każdej tkaninie niżej zaznaczasz, które do niej pasują.
      </p>

      <div className="flex flex-col gap-3">
        {unavailable ? (
          <p className="text-xs text-red-600 border border-red-300 dark:border-red-900 rounded-lg p-2 leading-snug">
            Nie udało się wczytać listy cech. Odśwież stronę — jeśli problem
            wraca, cechy nie są jeszcze przygotowane w bazie.
          </p>
        ) : defs.length === 0 ? (
          <p className="text-xs text-[var(--muted)] italic">
            Brak cech — dodaj pierwszą poniżej.
          </p>
        ) : (
          defs.map((def) => (
            <PropertyRow
              key={def.id}
              def={def}
              usedBy={usage.get(def.code) ?? 0}
              onResult={onResult}
            />
          ))
        )}
      </div>

      <NewPropertyForm nextSort={defs.length} onResult={onResult} />
    </Card>
  );
}

function PropertyRow({
  def,
  usedBy,
  onResult,
}: {
  def: FabricPropertyDefRow;
  usedBy: number;
  onResult: (res: ActionResult) => void;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(def.label);
  const [labelDe, setLabelDe] = useState(def.label_de ?? "");
  // Klucz spoza biblioteki (np. ikonka wycięta z kodu) → nic nie zaznaczone;
  // admin musi wybrać ponownie, zamiast po cichu dostać podmienioną ikonkę.
  const [icon, setIcon] = useState<FabricPropertyIcon | null>(
    isFabricPropertyIcon(def.icon) ? def.icon : null
  );
  const [sortOrder, setSortOrder] = useState(String(def.sort_order));

  function save() {
    const fd = new FormData();
    fd.set("id", def.id);
    fd.set("label", label);
    fd.set("label_de", labelDe);
    fd.set("icon", icon ?? "");
    fd.set("sort_order", sortOrder);
    startTransition(async () => {
      const res = await updateFabricProperty(fd);
      onResult(res);
      if (res.ok) router.refresh();
    });
  }

  async function remove() {
    const used =
      usedBy > 0
        ? ` Używa jej ${usedBy} tkanin(y) — zniknie również z nich (zaznaczenia przepadną).`
        : " Żadna tkanina jej teraz nie używa.";
    if (
      !(await confirm({
        message: `Usunąć cechę "${def.label}"?${used}`,
        danger: true,
      }))
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("id", def.id);
    fd.set("code", def.code);
    startTransition(async () => {
      const res = await deleteFabricProperty(fd);
      onResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_7rem] gap-3">
        <Field label="Nazwa (PL)">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={FABRIC_PROPERTY_LABEL_MAX}
            className={inputCls}
          />
        </Field>
        <Field label="Nazwa (DE)" hint="Puste → na /de pokaże się polska.">
          <input
            value={labelDe}
            onChange={(e) => setLabelDe(e.target.value)}
            maxLength={FABRIC_PROPERTY_LABEL_MAX}
            className={inputCls}
          />
        </Field>
        <Field label="Kolejność" hint="Niższa = wcześniej.">
          <input
            type="number"
            step="1"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <IconPicker value={icon} onChange={setIcon} />

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="px-4 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {pending ? "Zapisuję…" : "Zapisz"}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="px-4 py-2.5 border border-red-300 dark:border-red-900 text-red-600 font-sans text-xs uppercase tracking-widest rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
        >
          Usuń
        </button>
        <span className="text-[11px] text-[var(--muted)]">
          {usedBy > 0 ? `Używa jej ${usedBy} tkanin(y).` : "Nieużywana przez żadną tkaninę."}
        </span>
      </div>
    </div>
  );
}

function NewPropertyForm({
  nextSort,
  onResult,
}: {
  nextSort: number;
  onResult: (res: ActionResult) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [labelDe, setLabelDe] = useState("");
  const [icon, setIcon] = useState<FabricPropertyIcon | null>(null);
  const [sortOrder, setSortOrder] = useState(String(nextSort));

  // Czyszczenie pól po dodaniu/anulowaniu. Kolejność ustawiamy jawnie, bo
  // formularz zostaje zamontowany (chowa się tylko `open`) i po dodaniu cechy
  // kolejna powinna proponować następny numer.
  function reset(nextValue: number) {
    setLabel("");
    setLabelDe("");
    setIcon(null);
    setSortOrder(String(nextValue));
  }

  function add() {
    const fd = new FormData();
    fd.set("label", label);
    fd.set("label_de", labelDe);
    fd.set("icon", icon ?? "");
    fd.set("sort_order", sortOrder);
    startTransition(async () => {
      const res = await createFabricProperty(fd);
      onResult(res);
      if (res.ok) {
        reset(nextSort + 1);
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start mt-4 px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
      >
        + Dodaj cechę
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 mt-4 bg-[var(--bg)] border border-dashed border-[var(--color-gold)] rounded-xl p-3">
      <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        Nowa cecha
      </p>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_7rem] gap-3">
        <Field label="Nazwa (PL)" required>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={FABRIC_PROPERTY_LABEL_MAX}
            placeholder="np. Odporna na plamy"
            className={inputCls}
          />
        </Field>
        <Field label="Nazwa (DE)" hint="Puste → na /de pokaże się polska.">
          <input
            value={labelDe}
            onChange={(e) => setLabelDe(e.target.value)}
            maxLength={FABRIC_PROPERTY_LABEL_MAX}
            placeholder="z. B. Fleckenresistent"
            className={inputCls}
          />
        </Field>
        <Field label="Kolejność" hint="Niższa = wcześniej.">
          <input
            type="number"
            step="1"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <IconPicker value={icon} onChange={setIcon} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={add}
          disabled={pending}
          className="px-4 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {pending ? "Dodaję…" : "Dodaj cechę"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset(nextSort);
            setOpen(false);
          }}
          disabled={pending}
          className="px-4 py-2.5 border border-[var(--border)] text-[var(--fg)] font-sans text-xs uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          Anuluj
        </button>
      </div>
    </div>
  );
}
