import { useId } from "react";

// Statyczny wyświetlacz ocen — ma wsparcie dla „pół gwiazdki" (dla średnich np. 4.3).
// size: rozmiar pojedynczej gwiazdki w px.
export default function StarRating({
  value,
  size = 16,
  className = "",
}: {
  value: number; // 0..5
  size?: number;
  className?: string;
}) {
  const full = Math.floor(value);
  const hasHalf = value - full >= 0.25 && value - full < 0.75;
  const rounded = value - full >= 0.75 ? full + 1 : full;

  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${value} / 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const showFull = hasHalf ? i < full : i < rounded;
        const showHalf = hasHalf && i === full;
        return (
          <Star key={i} size={size} filled={showFull} half={showHalf} />
        );
      })}
    </div>
  );
}

function Star({ size, filled, half }: { size: number; filled: boolean; half: boolean }) {
  const color = filled || half ? "var(--color-gold)" : "var(--border)";
  // useId zamiast Math.random — stabilne między renderami i zgodne z SSR
  // (random ID powodował hydration mismatch przy pół-gwiazdce).
  const id = `half-${useId()}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {half && (
        <defs>
          <linearGradient id={id}>
            <stop offset="50%" stopColor="var(--color-gold)" />
            <stop offset="50%" stopColor="var(--border)" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2 l3.09 6.26 L22 9.27 l-5 4.87 L18.18 22 L12 18.27 L5.82 22 L7 14.14 l-5 -4.87 L8.91 8.26 z"
        fill={half ? `url(#${id})` : color}
      />
    </svg>
  );
}
