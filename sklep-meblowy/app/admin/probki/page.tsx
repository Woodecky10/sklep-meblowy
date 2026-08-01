import { requireAdmin } from "@/app/_lib/admin";
import { getFabricImageMap } from "@/app/_lib/fabrics";
import { getSampleOrders } from "@/app/_lib/samples";
import SampleOrdersList from "./SampleOrdersList";

export const metadata = { title: "Próbki — Admin" };

// ⚠️ ODCZYT MUSI IŚĆ PRZEZ WARSTWĘ DANYCH (createAdminClient / service role).
// Na `sample_orders` jest polityka „owner read" (user_id = auth.uid()) i NIE MA
// polityki admina — świadomie, bo cały zapis idzie service_rolem. Gdyby ta
// strona czytała klientem sesyjnym, właścicielka zobaczyłaby wyłącznie SWOJE
// zamówienia, po cichu i bez żadnego błędu. `sample_order_items` ma RLS bez
// polityk (default deny), więc pozycje nie doszłyby w ogóle.
export default async function AdminSamplesPage() {
  await requireAdmin();
  // Równolegle — dwa niezależne odczyty, a lista bez miniatur wzornika jest
  // dla właścicielki bezużyteczna (sama nazwa „Riviera 16" nic nie mówi).
  const [orders, fabricImages] = await Promise.all([
    getSampleOrders(),
    getFabricImageMap(),
  ]);

  return <SampleOrdersList orders={orders} fabricImages={fabricImages} />;
}
