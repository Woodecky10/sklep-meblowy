import { NextResponse } from "next/server";
import {
  getInventories,
  getInventoryCategories,
  getInventoryProductsList,
  getInventoryProductsData,
  getOrderStatusList,
  BaseLinkerError,
} from "@/app/_lib/baselinker";

// Endpoint testowy — sprawdza:
// 1. Czy token API działa (getInventories)
// 2. Czy są jakieś magazyny (Inventory) i jakie ID
// 3. Pobiera kategorie z pierwszego magazynu
// 4. Pobiera listę produktów z pierwszego magazynu
// 5. Pobiera pełne dane pierwszych ~3 produktów (żeby zobaczyć strukturę)
//
// Zwraca surowy JSON — żebyśmy zobaczyli, jak BL zwraca dane.
// Po teście usuniemy ten endpoint lub zabezpieczymy auth-em.

export async function GET() {
  try {
    const inventories = await getInventories();

    if (inventories.length === 0) {
      return NextResponse.json({
        ok: true,
        warning: "Token działa, ale brak magazynów (Inventory) w BaseLinker. " +
          "Produkt jest pewnie w starszym 'Catalog' (deprecated). " +
          "W BL idź: Magazyn → utwórz nowy magazyn i przenieś produkt.",
        inventories: [],
      });
    }

    const firstInv = inventories[0];

    const [categories, productsList, orderStatuses] = await Promise.all([
      getInventoryCategories(firstInv.inventory_id),
      getInventoryProductsList(firstInv.inventory_id, 1),
      getOrderStatusList(),
    ]);

    const productIds = Object.keys(productsList.products ?? {}).slice(0, 5);
    const productsData = productIds.length
      ? await getInventoryProductsData(firstInv.inventory_id, productIds)
      : { products: {} };

    return NextResponse.json({
      ok: true,
      summary: {
        inventories_count: inventories.length,
        first_inventory: firstInv.name,
        first_inventory_id: firstInv.inventory_id,
        categories_count: categories.length,
        products_in_first_inventory: Object.keys(productsList.products ?? {}).length,
        order_statuses_count: orderStatuses.length,
      },
      inventories,
      categories,
      order_statuses: orderStatuses,
      products_list_sample: productsList.products,
      products_full_data_sample: productsData.products,
    });
  } catch (err) {
    if (err instanceof BaseLinkerError) {
      return NextResponse.json(
        {
          ok: false,
          where: "BaseLinker API",
          method: err.method,
          code: err.errorCode,
          message: err.message,
        },
        { status: 502 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "Nieznany błąd",
      },
      { status: 500 }
    );
  }
}
