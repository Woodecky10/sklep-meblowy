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
  // `ids` podane (choćby puste) = zawężenie do konkretnych produktów. Pusta
  // tablica musi być no-opem, nie przypadkowym pełnym przebiegiem crona.
  if (ids) {
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

  // Poprzednia wartość sale_price dla każdego wiersza — z JUŻ znormalizowanych
  // `rows` (number | null), nie z surowego `data`. Potrzebna wyłącznie do
  // cofnięcia w razie nieudanego zapisu historii, więc liczymy ją tu, w
  // warstwie IO, zamiast zmieniać kontrakt planSaleActivation.
  const previousSalePriceById = new Map(rows.map((r) => [r.id, r.sale_price]));

  // Pierwszy błąd przerywa cały przebieg — i to jest bezpieczne, bo nieudany
  // zapis historii (blok catch niżej) COFA sale_price do poprzedniej wartości.
  // Dzięki temu wiersz, na którym padło, dalej różni się od stanu pożądanego,
  // więc planSaleActivation (idempotentna) zgłosi go ponownie przy następnym
  // przebiegu. Bez tego cofnięcia sale_price zostałby już przełączony, wiersz
  // przestałby się różnić od `desired` i żaden kolejny przebieg (ani ręczny
  // zapis w panelu) nigdy by go nie ponowił — awaria byłaby cicha i trwała.
  // Alternatywa (zbieranie błędów i jazda dalej) chowałaby ją w logu crona,
  // którego nikt nie czyta.
  for (const c of changes) {
    const { error: updErr } = await supabase
      .from("products")
      .update({ sale_price: c.sale_price } as never)
      .eq("id", c.id);
    // Id produktu MUSI być w komunikacie: to leci z crona bez nadzoru, po wielu
    // wierszach — bez id operator nie wie, który produkt zatrzymał przebieg.
    if (updErr)
      throw new Error(`applySaleSchedule update failed for ${c.id}: ${updErr.message}`);

    // Kolejność jest istotna: recordPriceHistory czyta świeży stan z bazy.
    try {
      await recordPriceHistory(c.id);
    } catch (histErr) {
      const histMessage = histErr instanceof Error ? histErr.message : String(histErr);
      const previous = previousSalePriceById.get(c.id) ?? null;

      // Cofnięcie MUSI iść przez ten sam mechanizm update — jeśli ono też
      // padnie (błąd zwrócony LUB rzucony wyjątek, np. zerwane połączenie),
      // produkt zostaje z sale_price bez wpisu w historii/omnibus, a to jest
      // dokładnie ta sytuacja, przed którą chronimy: obniżka bez ceny
      // referencyjnej wymaganej przez Omnibus.
      let revertOk = false;
      let revertMessage = "";
      try {
        const { error: revertErr } = await supabase
          .from("products")
          .update({ sale_price: previous } as never)
          .eq("id", c.id);
        if (revertErr) revertMessage = revertErr.message;
        else revertOk = true;
      } catch (revertThrown) {
        revertMessage = revertThrown instanceof Error ? revertThrown.message : String(revertThrown);
      }

      if (revertOk) {
        throw new Error(
          `applySaleSchedule: zapis historii cen nie powiódł się dla produktu ${c.id} — sale_price COFNIĘTY do poprzedniej wartości, kolejny przebieg bezpiecznie ponowi próbę. Błąd recordPriceHistory: ${histMessage}`
        );
      }
      // Cofnięcie też padło — to jest ten groźny, trwały stan częściowy.
      throw new Error(
        `applySaleSchedule: zapis historii cen nie powiódł się dla produktu ${c.id} I COFNIĘCIE sale_price TEŻ SIĘ NIE POWIODŁO — produkt ma NIESPÓJNY, TRWAŁY stan (sale_price zmieniony bez wpisu w historii/omnibus), wymaga RĘCZNEJ interwencji w bazie. Błąd recordPriceHistory: ${histMessage}. Błąd cofnięcia: ${revertMessage}`
      );
    }
  }

  return changes;
}
