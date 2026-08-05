// Server-side: wprowadza w życie zaplanowane promocje. Jedyne miejsce w kodzie,
// które pisze products.sale_price. Po każdej zmianie ceny woła istniejące
// recordPriceHistory → wiersz historii i omnibus_price powstają w JEDNEJ
// transakcji (RPC apply_price_changes, migracja 39). Zero nowej logiki Omnibusa.
import { createAdminClient } from "./supabase/server";
import { recordPriceHistory } from "./price-history";
import { planSaleActivation, warsawToday, type SaleScheduleRow } from "./sale-schedule";

const SCHEDULE_COLUMNS =
  "id, price, sale_price, sale_price_planned, sale_from, sale_to, promo_badge";

export async function applySaleSchedule(
  ids?: string[]
): Promise<{ id: string; sale_price: number | null }[]> {
  const supabase = await createAdminClient();

  let query = supabase.from("products").select(SCHEDULE_COLUMNS);
  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  } else {
    // Cron: tylko wiersze, które MOGĄ wymagać przełączenia — nie cała tabela.
    query = query.or("sale_price_planned.not.is.null,sale_price.not.is.null");
  }
  const { data, error } = await query;
  if (error) throw new Error(`applySaleSchedule select failed: ${error.message}`);

  const rows = ((data ?? []) as unknown as SaleScheduleRow[]).map((r) => ({
    ...r,
    price: Number(r.price),
    sale_price: r.sale_price === null ? null : Number(r.sale_price),
    sale_price_planned:
      r.sale_price_planned === null ? null : Number(r.sale_price_planned),
  }));

  const changes = planSaleActivation(rows, warsawToday());

  for (const c of changes) {
    const { error: updErr } = await supabase
      .from("products")
      .update({ sale_price: c.sale_price } as never)
      .eq("id", c.id);
    if (updErr) throw new Error(`applySaleSchedule update failed: ${updErr.message}`);
    // Kolejność jest istotna: recordPriceHistory czyta świeży stan z bazy.
    await recordPriceHistory(c.id);
  }

  return changes;
}
