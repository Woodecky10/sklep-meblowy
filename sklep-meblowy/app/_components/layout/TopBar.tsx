import { Suspense } from "react";
import { COMPANY } from "@/app/_lib/company";
import LanguageSwitcher from "./LanguageSwitcher";

// Cienki pasek nad headerem z kontaktem i krótką informacją o dostawie.
// Ciemne tło (navy) + jasny tekst — identyczny wygląd w light i dark mode.
export default function TopBar() {
  return (
    <div className="bg-[var(--color-navy)] text-white/80 text-xs">
      <div className="max-w-7xl mx-auto px-6 h-9 flex items-center justify-between gap-4">
        {/* Kontakt */}
        <div className="flex items-center gap-5">
          <a
            href={`mailto:${COMPANY.email}`}
            className="flex items-center gap-1.5 hover:text-[var(--color-gold)] transition-colors"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-10 5L2 7" />
            </svg>
            <span className="hidden sm:inline">{COMPANY.email}</span>
            <span className="sm:hidden">E-mail</span>
          </a>

          {COMPANY.phone && (
            <a
              href={`tel:${COMPANY.phone.replace(/\s/g, "")}`}
              className="flex items-center gap-1.5 hover:text-[var(--color-gold)] transition-colors"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>{COMPANY.phone}</span>
            </a>
          )}
        </div>

        {/* Slogan + przełącznik języka po prawej */}
        <div className="flex items-center gap-5">
          <span className="hidden md:inline text-white/70 tracking-wide">
            Polski producent mebli tapicerowanych
          </span>
          <Suspense fallback={<div className="w-12 h-4" />}>
            <LanguageSwitcher className="text-white/80" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
