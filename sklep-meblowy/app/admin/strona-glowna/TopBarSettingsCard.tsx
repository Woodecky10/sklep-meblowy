"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, inputCls } from "@/app/admin/_shared";
import type { ActionResult } from "@/app/_lib/types";
import type { TopBarSettingsRow } from "@/app/_lib/topbar-settings";
import { updateTopBarSettings } from "./actions";

// Górny pasek: kontakt (telefon/email — działają w całym serwisie) + baner
// promocyjny (PL/DE, kolor, link, włącz/wyłącz). Placeholdery kontaktu =
// wartości domyślne z configu (puste pole = domyślne).
export default function TopBarSettingsCard({
  initial,
  contactDefaults,
  onResult,
}: {
  initial: TopBarSettingsRow | null;
  contactDefaults: { phone: string; email: string };
  onResult: (r: ActionResult) => void;
}) {
  const [saving, startSave] = useTransition();
  const router = useRouter();

  function submit(formData: FormData) {
    startSave(async () => {
      const res = await updateTopBarSettings(formData);
      onResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <Card>
      <h2 className="font-display text-xl font-semibold text-[var(--fg)] mb-2">Górny pasek</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        Numer telefonu i email (działają w całym serwisie: pasek, stopka, kontakt, regulamin) oraz baner promocyjny na samej górze strony.
      </p>
      <form action={submit} className="flex flex-col gap-6" data-guard-section>
        {/* Kontakt */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Telefon" hint="Puste = domyślny numer z konfiguracji.">
            <input name="contact_phone" defaultValue={initial?.contact_phone ?? ""} placeholder={contactDefaults.phone} className={inputCls} />
          </Field>
          <Field label="Email" hint="Puste = domyślny email z konfiguracji.">
            <input name="contact_email" defaultValue={initial?.contact_email ?? ""} placeholder={contactDefaults.email} className={inputCls} />
          </Field>
        </div>

        {/* Baner promocyjny */}
        <div className="pt-4 border-t border-[var(--border)] flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm text-[var(--fg)] cursor-pointer">
            <input type="checkbox" name="promo_enabled" value="1" defaultChecked={initial?.promo_enabled ?? false} className="h-4 w-4 accent-[var(--color-gold)]" />
            Pokaż baner promocyjny na górze strony
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Tekst promocji" hint="Wymagany — bez tekstu baner się nie pokaże, nawet przy zaznaczonym „Pokaż”.">
              <input name="promo_text" defaultValue={initial?.promo_text ?? ""} placeholder="np. -20% na wszystko do niedzieli!" className={inputCls} />
            </Field>
            <Field label="Tekst promocji DE">
              <input name="promo_text_de" defaultValue={initial?.promo_text_de ?? ""} className={inputCls} />
            </Field>
            <Field label="Link (opcjonalnie)" hint="np. /sklep albo pełny adres. Puste = baner nieklikalny.">
              <input name="promo_link" defaultValue={initial?.promo_link ?? ""} placeholder="/sklep" className={inputCls} />
            </Field>
            <Field label="Kolor tła">
              <select name="promo_color" defaultValue={initial?.promo_color ?? "gold"} className={inputCls}>
                <option value="gold">Złoty</option>
                <option value="navy">Navy (granatowy)</option>
                <option value="red">Czerwony (wyprzedaż)</option>
              </select>
            </Field>
          </div>
        </div>

        <div>
          <button type="submit" disabled={saving} data-guard-save className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50">
            {saving ? "Zapisuję..." : "Zapisz ustawienia paska"}
          </button>
        </div>
      </form>
    </Card>
  );
}
