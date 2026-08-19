import { getReviewsForBucket } from "@/app/_lib/reviews-admin";
import OpinieList from "./OpinieList";

export const metadata = { title: "Opinie — panel" };

export default async function OpiniePage() {
  const [nowe, opublikowane, usuniete] = await Promise.all([
    getReviewsForBucket("nowe"),
    getReviewsForBucket("opublikowane"),
    getReviewsForBucket("usuniete"),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-3xl font-bold mb-1">Opinie</h1>
        <p className="text-sm text-[var(--muted)]">
          Opinie klientów publikują się od razu. Tutaj je przeglądasz i
          zdejmujesz ze strony, jeśli coś jest nie tak.
        </p>
      </div>
      <OpinieList nowe={nowe} opublikowane={opublikowane} usuniete={usuniete} />
    </div>
  );
}
