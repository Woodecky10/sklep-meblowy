import { getReviewsForModeration } from "@/app/_lib/reviews-admin";
import OpinieList from "./OpinieList";

export const metadata = { title: "Opinie — panel" };

export default async function OpiniePage() {
  const [oczekujace, zatwierdzone, odrzucone] = await Promise.all([
    getReviewsForModeration("pending"),
    getReviewsForModeration("approved"),
    getReviewsForModeration("rejected"),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-3xl font-bold mb-1">Opinie</h1>
        <p className="text-sm text-[var(--muted)]">
          Opinia staje się publiczna dopiero po zatwierdzeniu.
        </p>
      </div>
      <OpinieList
        oczekujace={oczekujace}
        zatwierdzone={zatwierdzone}
        odrzucone={odrzucone}
      />
    </div>
  );
}
