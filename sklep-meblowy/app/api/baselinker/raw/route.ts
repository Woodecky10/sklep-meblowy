import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/app/_lib/admin";
import {
  getInventories,
  getInventoryProductsData,
} from "@/app/_lib/baselinker";

// Endpoint diagnostyczny dla wariantów BL i całego payloadu produktu.
// GET /api/baselinker/raw?productId=<baselinker_id>
//
// Zwraca surowy BLInventoryProduct (text_fields, features, variants, images,
// prices, stock) z pierwszego magazynu BL — bez naszego mappingu. Używane
// w akordeonie "Surowe dane z BL" w /admin/produkty/[id] żeby zobaczyć
// co dokładnie BL daje (np. czy nazwy wariantów mają format "Kolor:
// Beżowy, Strona: Lewa" — wtedy parser rozpoznaje wiele opcji).
export async function GET(request: NextRequest) {
  await requireAdmin();

  const productId = request.nextUrl.searchParams.get("productId")?.trim();
  if (!productId) {
    return NextResponse.json({ error: "Brak productId" }, { status: 400 });
  }

  try {
    const inventories = await getInventories();
    if (inventories.length === 0) {
      return NextResponse.json(
        { error: "Brak magazynów w BaseLinker" },
        { status: 404 }
      );
    }

    // Próbujemy znaleźć produkt w pierwszym magazynie. Jeśli BL ma wiele
    // magazynów, sprawdzamy je po kolei — pierwszy match wygrywa.
    for (const inv of inventories) {
      try {
        const data = await getInventoryProductsData(inv.inventory_id, [productId]);
        const product = data.products?.[productId];
        if (product) {
          return NextResponse.json({
            inventory: { id: inv.inventory_id, name: inv.name },
            product,
          });
        }
      } catch {
        // Pomijamy magazyn który nie ma tego produktu
      }
    }

    return NextResponse.json(
      { error: `Produkt ${productId} nie znaleziony w żadnym magazynie BL` },
      { status: 404 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Nieznany błąd";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
