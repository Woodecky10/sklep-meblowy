"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/app/_context/ConfirmContext";
import { EmptyState, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import { formatPrice } from "@/app/_lib/format";
import { pluralForm } from "@/app/_lib/plural";
import type { ActionResult } from "@/app/_lib/types";
import { cancelSample, markSamplePacked, markSampleSent } from "./actions";
import {
  SAMPLE_GROUPS,
  SAMPLE_GROUP_ORDER,
  SAMPLE_PAYMENT_LABELS,
  SAMPLE_STATUS_LABELS,
  cancelSampleConfirmMessage,
  cancelSampleWarnings,
  formatSampleAddress,
  groupSampleOrders,
  sampleActionsFor,
  sampleAddressLines,
  sampleAddressMissing,
  sampleImageKey,
  type SampleGroupKey,
  type SampleOrderRow,
} from "./sample-groups";

// Lista zamówień próbek dla właścicielki. PL-only (cały panel).
//
// Po każdej akcji robimy router.refresh() zamiast lokalnej podmiany stanu:
// zamówienie zmienia sekcję, a przy anulowaniu zmienia się też darmowa pula
// klienta. Optymistyczna kopia w pamięci przeglądarki mogłaby pokazywać stan,
// którego w bazie nie ma — a tu chodzi o pieniądze i o to, co włożyć do koperty.

type ActionFn = (formData: FormData) => Promise<ActionResult>;

const TONE_RING: Record<NonNullable<(typeof SAMPLE_GROUPS)[SampleGroupKey]["tone"]>, string> = {
  alert: "border-red-400 dark:border-red-800 bg-red-50/60 dark:bg-red-950/30",
  warn: "border-amber-400 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30",
};

// Data zawsze w polskiej strefie — inaczej serwer (UTC) i przeglądarka
// wyrenderowałyby różne godziny i React zgłosiłby błąd hydracji.
function dateLabel(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  });
}

export default function SampleOrdersList({
  orders,
  fabricImages,
}: {
  orders: SampleOrderRow[];
  // Mapa „Nazwa Numer" → URL zdjęcia wzornika (getFabricImageMap).
  fabricImages: Record<string, string>;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<Toast>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const groups = useMemo(() => groupSampleOrders(orders), [orders]);

  function showToast(next: NonNullable<Toast>) {
    setToast(next);
    // Sukces znika sam; błąd ZOSTAJE do zamknięcia — komunikat w rodzaju
    // „anulowano, ale zwrot puli nie zadziałał" jest do przeczytania i zgłoszenia,
    // nie do przegapienia w trzy sekundy.
    if (next.type === "success") setTimeout(() => setToast(null), 4000);
  }

  async function runAction(action: ActionFn, formData: FormData) {
    try {
      const res = await action(formData);
      showToast(
        res.ok
          ? { type: "success", message: res.message ?? "Zapisano" }
          : { type: "error", message: res.error }
      );
    } catch (err) {
      console.error("[admin/probki] akcja nieudana:", err);
      showToast({
        type: "error",
        message:
          "Nie udało się połączyć z serwerem. Odśwież stronę i sprawdź, czy zmiana się zapisała.",
      });
    }
    // Odświeżamy ZAWSZE, także po błędzie: anulowanie potrafi zawieść dopiero
    // przy zwrocie darmowej puli, kiedy status jest już zmieniony.
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Mollien
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          Zamówienia próbek
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl leading-relaxed">
          Wycinki tkanin zamawiane przez klientów ze strony „Zamów próbki”. Pierwsze
          3 próbki w ciągu roku są dla klienta darmowe, każda kolejna kosztuje 15 zł,
          dostawa jest zawsze bezpłatna. Pracuj z góry na dół: najpierw pakowanie,
          potem wysyłka.
        </p>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {orders.length === 0 ? (
        <EmptyState message="Nie ma jeszcze żadnego zamówienia próbek." />
      ) : (
        SAMPLE_GROUP_ORDER.map((key) => {
          const list = groups[key];
          if (list.length === 0) return null;
          const meta = SAMPLE_GROUPS[key];
          const collapsible = meta.collapsed === true;
          const open = !collapsible || showCancelled;

          return (
            <section
              key={key}
              className={
                meta.tone
                  ? `rounded-2xl border-2 p-5 ${TONE_RING[meta.tone]}`
                  : undefined
              }
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                <h2 className="font-display text-2xl font-bold text-[var(--fg)]">
                  {meta.title}
                </h2>
                <span className="text-sm text-[var(--muted)]">
                  {list.length}{" "}
                  {pluralForm(list.length, {
                    one: "zamówienie",
                    few: "zamówienia",
                    many: "zamówień",
                  })}
                </span>
                {collapsible && (
                  <button
                    type="button"
                    onClick={() => setShowCancelled((v) => !v)}
                    aria-expanded={open}
                    className="ml-auto px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--muted)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
                  >
                    {open ? "Zwiń" : "Pokaż"}
                  </button>
                )}
              </div>
              <p className="text-sm text-[var(--muted)] mb-4 max-w-3xl leading-relaxed">
                {meta.note}
              </p>

              {open && (
                <ul className="flex flex-col gap-4">
                  {list.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      fabricImages={fabricImages}
                      onRun={runAction}
                      onToast={showToast}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

// ============================================================
// Karta jednego zamówienia
// ============================================================

function OrderCard({
  order,
  fabricImages,
  onRun,
  onToast,
}: {
  order: SampleOrderRow;
  fabricImages: Record<string, string>;
  onRun: (action: ActionFn, formData: FormData) => Promise<void>;
  onToast: (t: NonNullable<Toast>) => void;
}) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [tracking, setTracking] = useState("");
  const actions = sampleActionsFor(order);
  const warnings = cancelSampleWarnings(order);
  const missing = sampleAddressMissing(order);
  const needsRefund = order.status === "cancelled" && order.payment_status === "paid";

  function submit(action: ActionFn, extra?: Record<string, string>) {
    const formData = new FormData();
    formData.set("id", order.id);
    for (const [k, v] of Object.entries(extra ?? {})) formData.set(k, v);
    startTransition(async () => {
      await onRun(action, formData);
    });
  }

  async function onCancelClick() {
    const ok = await confirm({
      title: "Anulowanie zamówienia",
      message: cancelSampleConfirmMessage(order),
      // ⚠️ Etykiety MUSZĄ być jednoznaczne. Domyślne „Potwierdź / Anuluj" w oknie
      // dotyczącym anulowania zamówienia to rzut monetą: „Anuluj" znaczy tu
      // „nie rób nic", a nie „anuluj zamówienie".
      confirmLabel: "Tak, anuluj",
      cancelLabel: "Nie, zostaw",
      danger: true,
    });
    if (!ok) return;
    submit(cancelSample);
  }

  return (
    <li className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-5 flex flex-col gap-4">
      {/* Nagłówek: co to za zamówienie i w jakim jest stanie */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 py-0.5 text-[10px] font-sans font-bold uppercase tracking-widest rounded-full bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)]">
          {SAMPLE_STATUS_LABELS[order.status]}
        </span>
        <PaymentBadge order={order} />
        <span className="text-xs text-[var(--muted)]">{dateLabel(order.created_at)}</span>
        <span className="ml-auto text-xs text-[var(--muted)]">
          {order.free_count > 0 && <>{order.free_count} gratis</>}
          {order.free_count > 0 && order.paid_count > 0 && " + "}
          {order.paid_count > 0 && (
            <>
              {order.paid_count} płatne ={" "}
              <strong className="text-[var(--fg)]">
                {formatPrice(order.amount_total, "pl")}
              </strong>
            </>
          )}
        </span>
      </div>

      {/* ⚠️ Pieniądze klienta leżą u nas — jedyne miejsce, w którym to widać */}
      {needsRefund && (
        <div className="rounded-xl border-2 border-red-400 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-4 py-3 flex flex-col gap-2">
          <p className="font-sans text-xs font-bold uppercase tracking-widest text-red-700 dark:text-red-300">
            Do zwrotu: {formatPrice(order.amount_total, "pl")}
          </p>
          <p className="text-sm text-[var(--fg)] leading-relaxed">
            Zamówienie jest anulowane, ale klient zapłacił. Zwrot zrób ręcznie
            w panelu Przelewy24 — wyszukaj tam transakcję:
          </p>
          {/* ⚠️ ANULOWANE ZAMÓWIENIE MOŻE BYĆ JUŻ WYSŁANE. Bez tego zdania karta
              mówi wyłącznie „zrób zwrot", a wycinki fizycznie pojechały pocztą
              — właścicielka oddałaby pieniądze za dostarczony towar. */}
          {order.sent_at && (
            <p className="text-sm font-semibold text-[var(--fg)] leading-relaxed">
              Uwaga: próbki zostały wysłane {dateLabel(order.sent_at)}
              {order.tracking ? ` (numer nadania ${order.tracking})` : ""} — zdecyduj,
              czy zwrot się należy.
            </p>
          )}
          {order.payment_ref ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-mono text-sm px-2 py-1 rounded-lg bg-[var(--card-bg)] border border-[var(--border)] text-[var(--fg)] break-all">
                {order.payment_ref}
              </code>
              <CopyButton
                text={order.payment_ref}
                label="Kopiuj numer"
                title="Kopiuj numer transakcji Przelewy24"
                onToast={onToast}
              />
            </div>
          ) : (
            <p className="text-sm text-[var(--fg)]">
              Numer transakcji się nie zapisał — szukaj w Przelewy24 po dacie{" "}
              {dateLabel(order.created_at)} i kwocie {formatPrice(order.amount_total, "pl")}.
            </p>
          )}
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Ta pozycja zostanie tu również po zrobieniu zwrotu — panel nie ma gdzie
            zapisać, że pieniądze już wróciły.
          </p>
        </div>
      )}

      {/* Klient + adres */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="text-sm">
          <p className="font-display text-base font-semibold text-[var(--fg)]">
            {order.customer_name || "(brak imienia)"}
          </p>
          <p className="mt-1">
            <a
              href={`mailto:${order.customer_email}`}
              className="text-[var(--color-gold)] hover:underline break-all"
            >
              {order.customer_email}
            </a>
          </p>
          {order.customer_phone && (
            <p className="mt-0.5">
              <a
                href={`tel:${order.customer_phone}`}
                className="text-[var(--color-gold)] hover:underline"
              >
                {order.customer_phone}
              </a>
            </p>
          )}
        </div>

        <div className="rounded-xl bg-[var(--bg)] border border-[var(--border)] p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
              Adres wysyłki
            </p>
            <CopyButton
              text={formatSampleAddress(order)}
              label="Kopiuj"
              title="Kopiuj cały adres"
              onToast={onToast}
            />
          </div>
          <address className="not-italic text-sm text-[var(--fg)] mt-2 leading-relaxed">
            {/* Klucz z indeksem, bo linie potrafią się powtórzyć
                (np. miasto identyczne z nazwą ulicy). */}
            {sampleAddressLines(order).map((line, i) => (
              <span key={`${i}-${line}`} className="block">
                {line}
              </span>
            ))}
          </address>
          {missing.length > 0 && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400 leading-relaxed">
              Adres jest niekompletny — brakuje {missing.join(", ")}. Dopytaj klienta
              przed wysyłką.
            </p>
          )}
        </div>
      </div>

      {/* Co wyciąć ze wzornika */}
      {order.items.length === 0 ? (
        // ⚠️ Zamówienie bez pozycji — patrz createSampleOrder: po nieudanym
        // skasowaniu osieroconego zamówienia zostaje sam nagłówek.
        <div className="rounded-xl border border-amber-400 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-4 py-3 text-sm text-[var(--fg)] leading-relaxed">
          <strong>Nie zapisały się pozycje tego zamówienia</strong> — nie wiadomo,
          które próbki wybrał klient, więc nie ma czego wysłać. Anuluj je (darmowe
          próbki wrócą klientowi do puli) i poproś o złożenie zamówienia jeszcze raz.
        </div>
      ) : (
        <div>
          <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
            Do wycięcia ({order.items.length})
          </p>
          <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {order.items.map((item) => {
              const src = fabricImages[sampleImageKey(item)];
              return (
                <li key={item.id} className="flex flex-col gap-1">
                  {/* Kontener MUSI być blokowy — aspect-* na inline <span> nie
                      wymusza wymiaru i obrazek wychodzi poza kafelek (PR #79). */}
                  <div className="relative block w-full aspect-square rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-center text-[10px] leading-tight px-1 text-[var(--muted)]">
                        brak zdjęcia we wzorniku
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-[var(--fg)] leading-tight">
                    {item.fabric_name}
                  </span>
                  <span className="text-xs text-[var(--fg)]">nr {item.color}</span>
                  <span
                    className={
                      item.is_free
                        ? "text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                        : "text-xs text-[var(--muted)]"
                    }
                  >
                    {item.is_free ? "gratis" : formatPrice(item.unit_price, "pl")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Ślad wysyłki zostaje na karcie NA ZAWSZE — warunek po `sent_at`, a nie
          po statusie. Po anulowaniu wysłanego zamówienia status to „cancelled",
          więc warunek na statusie ukryłby fakt, że paczka już poszła. */}
      {order.sent_at && (
        <p className="text-sm text-[var(--muted)]">
          Wysłano {dateLabel(order.sent_at)}
          {order.tracking ? (
            <>
              {" · "}numer nadania:{" "}
              <span className="font-mono text-[var(--fg)]">{order.tracking}</span>
            </>
          ) : (
            " · bez numeru nadania"
          )}
        </p>
      )}

      {/* Akcje */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {actions.canPack && (
          <button
            type="button"
            onClick={() => submit(markSamplePacked)}
            disabled={pending}
            className="px-4 py-2 text-xs font-sans uppercase tracking-widest rounded-full bg-[var(--color-navy)] text-white hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
          >
            Spakowane
          </button>
        )}

        {actions.canSend && (
          <form
            // ⚠️ onSubmit, NIE <form action={...}> — React 19 po akcji z `action=`
            // sam czyści formularz (produkcyjny bug, PR #83).
            onSubmit={(e) => {
              e.preventDefault();
              submit(markSampleSent, { tracking });
            }}
            className="flex flex-wrap items-center gap-2"
          >
            {/* Szerokość na opakowaniu, bo inputCls ma w-full — dwie klasy
                szerokości w jednym elemencie rozstrzygałaby kolejność w CSS. */}
            <div className="w-56">
              <input
                type="text"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="numer nadania (jeśli jest)"
                aria-label="Numer nadania"
                disabled={pending}
                className={inputCls}
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-xs font-sans uppercase tracking-widest rounded-full bg-[var(--color-navy)] text-white hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
            >
              Wysłane
            </button>
          </form>
        )}

        {actions.canCancel && (
          <button
            type="button"
            onClick={onCancelClick}
            disabled={pending}
            className="ml-auto px-4 py-2 text-xs font-sans uppercase tracking-widest rounded-full border border-red-300 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
          >
            Anuluj zamówienie
          </button>
        )}
      </div>

      {/* Czego anulowanie NIE zrobi — widoczne PRZED kliknięciem, nie tylko
          w oknie potwierdzenia. */}
      {actions.canCancel && warnings.length > 0 && (
        <ul className="text-xs text-[var(--muted)] leading-relaxed list-disc pl-4">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {order.payment_status === "pending" && order.status !== "cancelled" && (
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          Do czasu wpłaty nie ma tu przycisków pakowania i wysyłki — żeby nie wysłać
          paczki, za którą nikt nie zapłacił. Anulowanie odda klientowi darmowe próbki.
        </p>
      )}
    </li>
  );
}

// ============================================================
// Drobiazgi
// ============================================================

function PaymentBadge({ order }: { order: SampleOrderRow }) {
  const cls =
    order.payment_status === "pending"
      ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      : order.payment_status === "paid"
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
        : "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300";
  return (
    <span
      className={`px-2 py-0.5 text-[10px] font-sans font-bold uppercase tracking-widest rounded-full ${cls}`}
      title={
        order.payment_status === "none"
          ? "Same darmowe próbki — nie ma za co płacić"
          : undefined
      }
    >
      {SAMPLE_PAYMENT_LABELS[order.payment_status]}
    </span>
  );
}

function CopyButton({
  text,
  label,
  title,
  onToast,
}: {
  text: string;
  label: string;
  title: string;
  onToast: (t: NonNullable<Toast>) => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      title={title}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard bywa zablokowany (brak HTTPS, uprawnienia przeglądarki).
          // Milczące nic-się-nie-stało byłoby gorsze niż wklejony pusty adres.
          onToast({
            type: "error",
            message:
              "Przeglądarka nie pozwoliła skopiować. Zaznacz tekst myszką i skopiuj ręcznie (Ctrl+C).",
          });
        }
      }}
      className="shrink-0 px-3 py-1 text-[10px] font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--muted)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
    >
      {copied ? "Skopiowano" : label}
    </button>
  );
}
