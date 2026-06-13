import LocalizedLink from "../ui/LocalizedLink";

// Serce w navbarze z liczbą ulubionych. SSR — count przekazany z Navbar.
// Renderujemy nawet gdy count = 0 (puste serce zachęca do dodawania).
export default function WishlistIcon({ count }: { count: number }) {
  return (
    <LocalizedLink
      href="/ulubione"
      className="relative w-9 h-9 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] transition-colors"
      aria-label="Ulubione"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={count > 0 ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={count > 0 ? "text-red-500" : ""}
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--color-gold)] text-white text-[10px] font-bold flex items-center justify-center leading-none">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </LocalizedLink>
  );
}
