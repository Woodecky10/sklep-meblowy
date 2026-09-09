"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";
import { ACCEPTED_MAIL_MAX_LENGTH } from "@/app/_lib/order-accepted-mail";
import { sendExternalOrderMail } from "../actions";

// Sekcja „Wiadomość do klienta" na karcie zamówienia SPOZA SKLEPU. Odpowiedź na
// zgłoszenie pracownicy obsługującej panel (2026-09-09): maila „Dziękujemy za
// zamówienie" nie widziała, nie mogła zmienić jego treści i nie wiedziała, czy
// go wysłała. Wszystkie trzy braki są tu naprawione — treść w polu tekstowym,
// stan wysyłki na wierzchu, wysyłka wyłącznie przyciskiem.
//
// Podglądu HTML-a maila świadomie NIE MA: to, co widać w polu, jest dokładnie
// tym, co przeczyta klient — ramkę (logo, przycisk, stopkę) dokłada szablon
// i nie da się jej stąd zmienić, więc nie ma czego podglądać.
type Props = {
  orderId: string;
  // Adres, na który pójdzie wiadomość — pracownica ma go widzieć PRZED
  // kliknięciem, a nie szukać w karcie „Klient" wyżej.
  customerEmail: string | null;
  // Data wysyłki sformatowana po polsku na serwerze (jak pozostałe daty na
  // karcie). null = jeszcze nie wysłano. Formatowanie zostaje na serwerze,
  // żeby data nie mrugała po hydracji.
  sentAtLabel: string | null;
  // Treść wysłana ostatnim razem, a gdy jeszcze nie wysyłano — propozycja
  // z buildAcceptedMailBody (liczona na serwerze).
  defaultBody: string;
};

export default function CustomerMailCard({
  orderId,
  customerEmail,
  sentAtLabel,
  defaultBody,
}: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [body, setBody] = useState(defaultBody);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 5000);
  }

  async function send() {
    if (sentAtLabel) {
      const ok = await confirm({
        title: "Wysłać wiadomość jeszcze raz?",
        message:
          `Ta wiadomość poszła już do klienta (${sentAtLabel}).\n\n` +
          "Jeśli wyślesz ponownie, klient dostanie drugiego maila.",
        confirmLabel: "Wyślij ponownie",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const res = await sendExternalOrderMail(orderId, body);
      if (res.ok) {
        showToast({ type: "success", message: res.message ?? "Wiadomość wysłana" });
        router.refresh();
      } else {
        showToast({ type: "error", message: res.error });
      }
    });
  }

  return (
    <Card>
      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-3">Wiadomość do klienta</h3>

      {sentAtLabel ? (
        <p className="mb-4 px-4 py-3 rounded-xl text-sm border bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200">
          Wysłano {sentAtLabel}
          {customerEmail ? ` na adres ${customerEmail}` : ""}. Poniżej jest treść, którą dostał
          klient.
        </p>
      ) : (
        // Głośno i na bursztynowo: to jedyny mail, jaki klient z Allegro/OLX
        // dostaje od nas po zakupie, a nic go nie wyśle samo.
        //
        // Świadomie NIE piszemy „klient nic od nas nie dostał": zamówienia
        // sprzed 2026-09-09 dostały tę wiadomość automatem, a ślad wysyłki
        // (migracja 83) zaczyna się dopiero teraz — panel ma mówić o tym, co
        // wie, a nie zgadywać za starą wersję kodu.
        <p className="mb-4 px-4 py-3 rounded-xl text-sm font-semibold border bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200">
          Jeszcze nie wysłano — nic nie pójdzie do klienta, dopóki nie klikniesz przycisku
          poniżej.
        </p>
      )}

      <p className="text-sm text-[var(--muted)] mb-4">
        Sprawdź i popraw tekst, a potem kliknij „{sentAtLabel ? "Wyślij ponownie" : "Wyślij do klienta"}”.
        Klient dostanie dokładnie ten tekst
        {customerEmail ? (
          <>
            {" "}
            na adres <span className="font-semibold text-[var(--fg)]">{customerEmail}</span>
          </>
        ) : null}
        , w firmowej ramce Mollien (logo, przycisk do sklepu, stopka z danymi firmy). Piszesz
        zwykły tekst — pusta linia robi odstęp między akapitami.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          Treść wiadomości
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={18}
          maxLength={ACCEPTED_MAIL_MAX_LENGTH}
          className={`${inputCls} font-sans leading-relaxed`}
          placeholder="Dzień dobry, …"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={isPending || body.trim() === ""}
          onClick={send}
          className="px-5 py-2 bg-[var(--color-navy)] text-white font-sans text-sm uppercase tracking-widest rounded-lg hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Wysyłam…" : sentAtLabel ? "Wyślij ponownie" : "Wyślij do klienta"}
        </button>
        {body.trim() === "" && (
          <span className="text-xs text-[var(--muted)]">Wpisz treść wiadomości.</span>
        )}
        {body !== defaultBody && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setBody(defaultBody)}
            className="text-xs text-[var(--muted)] hover:text-[var(--color-gold)] underline transition-colors"
          >
            Przywróć poprzednią treść
          </button>
        )}
      </div>
    </Card>
  );
}
