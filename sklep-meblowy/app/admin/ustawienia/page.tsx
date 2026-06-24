import { getEurRate } from "@/app/_lib/store-settings";
import SettingsForm from "./SettingsForm";

// Panel admina jest PL-only.
export default async function AdminSettingsPage() {
  const rate = await getEurRate();
  return (
    <div className="max-w-xl">
      <h1 className="font-display text-2xl font-semibold mb-6">Ustawienia sklepu</h1>
      <SettingsForm initialRate={rate} />
    </div>
  );
}
