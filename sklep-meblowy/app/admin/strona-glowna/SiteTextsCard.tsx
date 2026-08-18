"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, inputCls } from "@/app/admin/_shared";
import RichTextEditor from "@/app/admin/_shared/RichTextEditor";
import type { SiteTextsMap } from "@/app/_lib/site-texts";
import type { ActionResult } from "@/app/_lib/types";
import { updateSiteTexts } from "./actions";

// Teksty ogólne: slogan w pasku nad menu, opis marki w stopce oraz opis sklepu
// na stronie głównej (PL i DE).
export default function SiteTextsCard({
  initialTexts,
  onResult,
}: {
  initialTexts: SiteTextsMap;
  onResult: (r: ActionResult) => void;
}) {
  const [saving, startSave] = useTransition();
  const router = useRouter();
  // RichTextEditor jest kontrolowany, a formularz wysyła FormData — stąd stan
  // w komponencie i ukryte inputy, które przenoszą HTML do akcji serwerowej.
  const [about, setAbout] = useState(initialTexts.home_about?.value ?? "");
  const [aboutDe, setAboutDe] = useState(initialTexts.home_about?.value_de ?? "");

  function submit(formData: FormData) {
    startSave(async () => {
      const res = await updateSiteTexts(formData);
      onResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <Card>
      <h2 className="font-display text-xl font-semibold text-[var(--fg)] mb-2">Teksty ogólne</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        Slogan w cienkim pasku nad menu, krótki opis marki w stopce oraz opis sklepu
        na stronie głównej. Puste pole = tekst domyślny.
      </p>
      <form action={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-guard-section>
        <Field label="Slogan w pasku górnym">
          <input name="topbar_slogan" defaultValue={initialTexts.topbar_slogan?.value ?? ""} className={inputCls} />
        </Field>
        <Field label="Slogan w pasku górnym DE">
          <input name="topbar_slogan_de" defaultValue={initialTexts.topbar_slogan?.value_de ?? ""} className={inputCls} />
        </Field>
        <Field label="Opis marki w stopce">
          <textarea name="footer_tagline" rows={3} defaultValue={initialTexts.footer_tagline?.value ?? ""} className={inputCls} />
        </Field>
        <Field label="Opis marki w stopce DE">
          <textarea name="footer_tagline_de" rows={3} defaultValue={initialTexts.footer_tagline?.value_de ?? ""} className={inputCls} />
        </Field>

        <div className="sm:col-span-2 border-t border-[var(--border)] pt-4 mt-2">
          <p className="text-sm text-[var(--muted)] mb-4">
            {"Opis sklepu wyświetlany na stronie głównej, w sekcji „Dlaczego warto kupować u nas?” — nad ikonami. Nagłówki i akapity formatujesz poniżej."}
          </p>
          <Field label="Opis sklepu na stronie głównej" composite>
            <input type="hidden" name="home_about" value={about} />
            <RichTextEditor
              value={about}
              onChange={setAbout}
              ariaLabel="Opis sklepu na stronie głównej"
              placeholder="Zostaw puste, aby użyć tekstu domyślnego."
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Opis sklepu na stronie głównej DE" composite>
            <input type="hidden" name="home_about_de" value={aboutDe} />
            <RichTextEditor
              value={aboutDe}
              onChange={setAboutDe}
              ariaLabel="Opis sklepu na stronie głównej DE"
              placeholder="Zostaw puste, aby użyć wersji polskiej."
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <button type="submit" disabled={saving} data-guard-save className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50">
            {saving ? "Zapisuję..." : "Zapisz teksty"}
          </button>
        </div>
      </form>
    </Card>
  );
}
