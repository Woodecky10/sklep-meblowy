import type { Metadata } from "next";
import { requireAdmin } from "@/app/_lib/admin";
import { getAllPagesAdmin } from "@/app/_lib/pages-server";
import CreatePageForm from "./CreatePageForm";
import PagesList from "./PagesList";

export const metadata: Metadata = { title: "Podstrony — panel admina" };

export default async function AdminPagesPage() {
  await requireAdmin();
  const pages = await getAllPagesAdmin();
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Mollien
        </p>
        <h1 className="font-display text-3xl font-bold text-[var(--fg)]">Podstrony</h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
          Własne strony sklepu (np. „Pielęgnacja mebli") składane z tych samych
          sekcji co strona główna. Nowa strona zaczyna jako szkic — publikujesz
          ją, gdy będzie gotowa.
        </p>
      </div>
      <CreatePageForm />
      <PagesList initialPages={pages} />
    </div>
  );
}
