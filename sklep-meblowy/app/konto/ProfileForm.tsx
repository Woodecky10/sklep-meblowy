"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "./actions";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import type { Profile } from "@/app/_lib/types";

export default function ProfileForm({
  profile,
  email,
}: {
  profile: Profile | null;
  email: string;
}) {
  const de = useClientLocale() === "de";
  const c = de
    ? {
        email: "Email",
        fullName: "Vor- und Nachname",
        defaultAddress: "Standard-Lieferadresse",
        street: "Straße und Hausnummer",
        postalCode: "Postleitzahl",
        city: "Stadt",
        country: "Land",
        defaultCountry: "Polen",
        saved: "Änderungen gespeichert.",
        saving: "Wird gespeichert...",
        save: "Änderungen speichern",
      }
    : {
        email: "Email",
        fullName: "Imię i nazwisko",
        defaultAddress: "Domyślny adres dostawy",
        street: "Ulica i numer",
        postalCode: "Kod pocztowy",
        city: "Miasto",
        country: "Kraj",
        defaultCountry: "Polska",
        saved: "Zapisano zmiany.",
        saving: "Zapisuję...",
        save: "Zapisz zmiany",
      };

  const [state, action, pending] = useActionState<ProfileState, FormData>(
    updateProfile,
    null
  );

  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label={c.email} name="email" value={email} disabled />
      <Field
        label={c.fullName}
        name="full_name"
        defaultValue={profile?.full_name ?? ""}
        required
      />

      <h3 className="font-display text-lg font-bold text-[var(--fg)] pt-4">
        {c.defaultAddress}
      </h3>

      <Field
        label={c.street}
        name="street"
        defaultValue={profile?.address?.street ?? ""}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label={c.postalCode}
          name="postal_code"
          placeholder="00-000"
          defaultValue={profile?.address?.postal_code ?? ""}
        />
        <Field
          label={c.city}
          name="city"
          defaultValue={profile?.address?.city ?? ""}
        />
      </div>
      <Field
        label={c.country}
        name="country"
        defaultValue={profile?.address?.country ?? c.defaultCountry}
      />

      {state?.error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-300 rounded-xl px-4 py-3 text-sm">
          {c.saved}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start px-8 py-3.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
      >
        {pending ? c.saving : c.save}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  value,
  placeholder,
  disabled,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        {label}
      </span>
      <input
        name={name}
        defaultValue={defaultValue}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        readOnly={value !== undefined}
        className="px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </label>
  );
}
