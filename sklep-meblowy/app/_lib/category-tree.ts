// Czysta logika drzewa kategorii — BEZ ŻADNYCH server-only importów
// (next/cache, next/headers), więc bezpieczna do importu z komponentów
// klienckich (FilterBar.tsx, KategorieEditor.tsx). I/O i cache żyją w
// categories.ts — ten sam podział co collection-tiles.ts vs collections.ts.
//
// Wejściem jest zawsze PŁASKA lista węzłów (z categories.ts, już zlokalizowana),
// wyjściem gotowa projekcja. Żadna funkcja tu nie mutuje wejścia.

// Ile poziomów drzewa pokazuje megamenu. Głębsze poziomy są dostępne wyłącznie
// paskiem dzieci na stronie kategorii (CategoryChildren.tsx) — panel rozwijany
// ma skończoną wysokość, a wcięcia na wąskich ekranach zjadają szerokość.
export const MENU_MAX_DEPTH = 3;

export type CategoryNode = {
  id: string;
  slug: string;
  label: string;
  label_de: string | null;
  // null = węzeł najwyższego poziomu (pozycja w pasku nawigacji).
  parent_id: string | null;
  sort_order: number;
  active: boolean;
  crossSellCategories: string[];
};

export type CategoryTreeNode = CategoryNode & {
  depth: number; // 0 = najwyższy poziom
  children: CategoryTreeNode[];
};

export type MenuNode = { slug: string; label: string; children: MenuNode[] };

export type SelectOption = { slug: string; label: string; depth: number };
export type SelectGroup = { label: string; options: SelectOption[] };

// Kolejność rodzeństwa: sort_order rosnąco, przy remisie etykieta. Ten sam
// komparator obowiązuje w sklepie i w panelu — inaczej po pierwszym
// przeciągnięciu panel pokazywałby inny układ niż klient.
export function byTreeOrder(a: CategoryNode, b: CategoryNode): number {
  return a.sort_order - b.sort_order || a.label.localeCompare(b.label, "pl");
}

// Indeks dzieci po rodzicu — jedna iteracja zamiast filtrowania per węzeł.
function childrenByParent(nodes: CategoryNode[]): Map<string, CategoryNode[]> {
  const map = new Map<string, CategoryNode[]>();
  for (const n of nodes) {
    if (!n.parent_id) continue;
    const arr = map.get(n.parent_id) ?? [];
    arr.push(n);
    map.set(n.parent_id, arr);
  }
  for (const arr of map.values()) arr.sort(byTreeOrder);
  return map;
}

// Płaska lista → las. Węzeł, którego rodzic nie istnieje w podanej liście
// (sierota po usunięciu poza aplikacją), trafia na najwyższy poziom — inaczej
// zniknąłby z panelu i nikt by go nie naprawił. Węzły w cyklu też nie giną:
// pierwszy nieodwiedzony zostaje dopięty jako korzeń.
export function buildTree(nodes: CategoryNode[]): CategoryTreeNode[] {
  const byId = new Map<string, CategoryTreeNode>();
  for (const n of nodes) byId.set(n.id, { ...n, depth: 0, children: [] });

  const roots: CategoryTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  const seen = new Set<string>();
  function walk(list: CategoryTreeNode[], depth: number) {
    list.sort(byTreeOrder);
    for (const n of list) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      n.depth = depth;
      // Usuwamy back-edges aby przerwać cykle w strukturze drzewa
      n.children = n.children.filter(c => !seen.has(c.id));
      walk(n.children, depth + 1);
    }
  }
  walk(roots, 0);

  // Cykl: A→B→A nie jest osiągalny z żadnego korzenia. Dopinamy pierwszy
  // nieodwiedzony węzeł jako korzeń; `seen` gwarantuje, że walk się zatrzyma.
  for (const node of byId.values()) {
    if (seen.has(node.id)) continue;
    node.depth = 0;
    roots.push(node);
    seen.add(node.id);
    // Filtrujemy back-edges przed walk aby uniknąć cykli
    node.children = node.children.filter(c => !seen.has(c.id));
    walk(node.children, 1);
  }

  roots.sort(byTreeOrder);
  return roots;
}

// Slug węzła + slugi CAŁEGO poddrzewa, w kolejności DFS. To jest definicja
// „co pokazuje listing kategorii": produkty węzła i wszystkiego pod nim.
// Nie filtruje po `active` — ukrycie węzła zdejmuje go z nawigacji, a nie
// odbiera dostępu do produktów (patrz Global Constraints).
export function descendantSlugs(nodes: CategoryNode[], slug: string): string[] {
  const start = nodes.find((n) => n.slug === slug);
  if (!start) return [];

  const children = childrenByParent(nodes);
  const out: string[] = [];
  const seen = new Set<string>();

  function visit(node: CategoryNode) {
    if (seen.has(node.id)) return; // cykl
    seen.add(node.id);
    out.push(node.slug);
    for (const child of children.get(node.id) ?? []) visit(child);
  }
  visit(start);

  return out;
}

// Cross-sell: zaznaczenie węzła w panelu ma znaczyć „ten węzeł i wszystko pod
// nim" — dokładnie jak resolveCategoryFilter dla listingu. Bez tego zaznaczenie
// korzenia z 0 własnymi produktami (wszystko wisi w podkategoriach — np.
// „MATERACE" nad kieszeniowe/nawierzchniowe/piankowe) gasi całą sekcję
// cross-sellu bez żadnego błędu w logach, bo `.in("category", ['materace'])`
// nie znajduje nic.
//
// Nieznany slug (kategoria usunięta z tabeli — `cross_sell_categories` to
// zwykła tablica tekstów, żaden FK jej nie pilnuje) zostaje wstawiony BEZ ZMIAN,
// nie zgubiony po cichu — panel go zapisał, więc dalej ma prawo działać.
//
// `sourceSlugs` filtrujemy PO rozwinięciu każdego targetu, nie tylko na
// surowych wpisach: gdy cross-sell źródłowej kategorii wskazuje na jej własny
// korzeń (łóżko wisi pod „materace" wskazującym na „materace"), korzeń
// rozwija się i źródło wraca jako potomek — bez tego dodatkowego filtra
// dostajemy same-sell zamiast cross-sell.
//
// Kolejność wyniku = kolejność pierwszego wystąpienia po rozwinięciu (czyli
// kolejność drzewa, ustawiana przeciąganiem w panelu), bez duplikatów. To ma
// znaczenie: `getSizeMatchedCrossSell` przekazuje wynik jako trzeci argument
// do `pickSizeMatched`, gdzie steruje priorytetem karuzeli (pełnowartościowe
// materace mają iść przed cienkimi topperami).
export function expandCrossSellTargets(
  nodes: CategoryNode[],
  rawTargets: string[],
  sourceSlugs: string[]
): string[] {
  const sources = new Set(sourceSlugs);
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of rawTargets) {
    const expanded = descendantSlugs(nodes, raw);
    const slugs = expanded.length > 0 ? expanded : [raw];
    for (const slug of slugs) {
      if (sources.has(slug)) continue;
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push(slug);
    }
  }

  return out;
}

// Ścieżka od korzenia do węzła — nagłówek i okruszki. Pusta, gdy sluga nie ma.
export function pathTo(nodes: CategoryNode[], slug: string): CategoryNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: CategoryNode[] = [];
  const seen = new Set<string>();

  let cur = nodes.find((n) => n.slug === slug);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id); // cykl
    path.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return path;
}

// Slugi widoczne w nawigacji: węzeł ORAZ wszyscy jego przodkowie muszą być
// aktywni. Bez tego wyłączenie „MEBLI" zostawia ich dzieci w pasku jako
// pozycje najwyższego poziomu. Sierota (rodzica nie ma w liście) jest widoczna
// — nie ma kto jej ukryć, a chowanie jej po cichu ukrywałoby produkty.
export function effectiveActive(nodes: CategoryNode[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visible = new Set<string>();

  for (const n of nodes) {
    const seen = new Set<string>();
    let cur: CategoryNode | undefined = n;
    let ok = true;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (!cur.active) {
        ok = false;
        break;
      }
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    if (ok) visible.add(n.slug);
  }
  return visible;
}

function visibleTree(nodes: CategoryNode[]): CategoryTreeNode[] {
  const visible = effectiveActive(nodes);
  return buildTree(nodes.filter((n) => visible.has(n.slug)));
}

// Projekcja dla paska i stopki: poziom 1 = pozycje paska, 2 = nagłówki kolumn,
// 3 = linki. Głębsze poziomy są odcięte świadomie (patrz MENU_MAX_DEPTH).
export function menuProjection(
  nodes: CategoryNode[],
  maxDepth: number = MENU_MAX_DEPTH
): MenuNode[] {
  function project(list: CategoryTreeNode[], depth: number): MenuNode[] {
    if (depth >= maxDepth) return [];
    return list.map((n) => ({
      slug: n.slug,
      label: n.label,
      children: project(n.children, depth + 1),
    }));
  }
  return project(visibleTree(nodes), 0);
}

// Projekcja dla <select> w formularzach produktu. HTML nie zna zagnieżdżonych
// <optgroup>, więc grupa to KORZEŃ, a opcje to wszyscy jego potomkowie
// z głębokością do wcięcia. Korzeń jest też opcją — produkt może wisieć
// na dowolnym węźle.
//
// Świadomie BEZ filtra widoczności (inaczej niż menuProjection): decyduje
// wołający. Formularz „nowy produkt" podaje getCategories() (tylko widoczne),
// a edytor istniejącego produktu getAllCategories() — produkt siedzący
// w ukrytej kategorii musi widzieć swoją własną wartość na liście, bo inaczej
// przeglądarka pokaże pierwszą opcję, a „Zapisz" po cichu go przeniesie.
export function flattenForSelect(nodes: CategoryNode[]): SelectGroup[] {
  return buildTree(nodes).map((root) => {
    const options: SelectOption[] = [];
    function walk(n: CategoryTreeNode, depth: number) {
      options.push({ slug: n.slug, label: n.label, depth });
      for (const c of n.children) walk(c, depth + 1);
    }
    walk(root, 0);
    return { label: root.label, options };
  });
}

// Lista do pola „Rodzic" w panelu: całe drzewo BEZ samego węzła i bez jego
// potomków. Wybór potomka odciąłby gałąź od drzewa (baza i tak odrzuci to
// triggerem, ale lepiej nie pokazywać opcji, która zawsze kończy się błędem).
// Pusty `id` (nowy węzeł) → całe drzewo.
export function allowedParents(
  nodes: CategoryNode[],
  id: string
): { id: string; label: string; depth: number }[] {
  const blocked = new Set<string>();
  const start = nodes.find((n) => n.id === id);
  if (start) {
    const bySlug = new Map(nodes.map((n) => [n.slug, n]));
    for (const slug of descendantSlugs(nodes, start.slug)) {
      const n = bySlug.get(slug);
      if (n) blocked.add(n.id);
    }
  }

  const out: { id: string; label: string; depth: number }[] = [];
  function walk(n: CategoryTreeNode, depth: number) {
    if (blocked.has(n.id)) return; // potomkowie też wypadają
    out.push({ id: n.id, label: n.label, depth });
    for (const c of n.children) walk(c, depth + 1);
  }
  for (const root of buildTree(nodes)) walk(root, 0);
  return out;
}

// JEDYNE miejsce, w którym rozstrzyga się, co filtruje listing. `kategoria`
// wygrywa nad legacy `sekcja` (klient kliknął konkretniejszy filtr), a wynik to
// zawsze CAŁE poddrzewo. Nieznany slug zwraca pustą listę slugów, a nie null —
// listing ma wtedy pokazać zero produktów, nie wszystkie.
export function resolveCategoryFilter(
  nodes: CategoryNode[],
  params: { kategoria?: string; sekcja?: string }
): { slug: string; slugs: string[] } | null {
  const raw = params.kategoria?.trim() || params.sekcja?.trim();
  if (!raw) return null;
  return { slug: raw, slugs: descendantSlugs(nodes, raw) };
}

// Liczniki dla panelu: własne produkty i produkty z całego poddrzewa. Sam
// licznik poddrzewa ukrywałby fakt, że rodzic nie ma nic swojego.
export function subtreeProductCounts(
  nodes: CategoryNode[],
  ownCounts: Record<string, number>
): Map<string, { own: number; subtree: number }> {
  const result = new Map<string, { own: number; subtree: number }>();
  for (const n of nodes) {
    const subtree = descendantSlugs(nodes, n.slug).reduce(
      (sum, slug) => sum + (ownCounts[slug] ?? 0),
      0
    );
    result.set(n.slug, { own: ownCounts[n.slug] ?? 0, subtree });
  }
  return result;
}

// Przesunięcie węzła wśród RODZEŃSTWA — czysta logika za przeciąganiem w panelu.
// Rodzeństwo liczymy TU (parent_id === parentId, `null` porównywane z `null`,
// więc najwyższy poziom to węzły BEZ rodzica, nie "wszystkie węzły"), po
// byTreeOrder — jedno źródło prawdy, żeby wynik przeciągania i to, co idzie
// do reorder_categories, nigdy się nie rozjechały.
//
// `null`, gdy żądanie nie ma sensu: activeId === overId, albo któryś z nich
// nie należy do tego rodzeństwa (inna gałąź/inny poziom). RPC ma klauzulę
// `parent_id is not distinct from p_parent` i taki wiersz po cichu zignoruje
// — lepiej nie wysłać żądania niż wysłać połowiczną kolejność.
//
// BEZ arrayMove z @dnd-kit/sortable: ten moduł jest celowo bez zależności
// (importują go i serwer, i komponenty klienckie), więc przesunięcie robimy
// zwykłym splice — usuń, potem wstaw w już-skróconą tablicę (identyczny
// efekt jak arrayMove, patrz jego implementacja).
export function reorderSiblings(
  items: CategoryNode[],
  parentId: string | null,
  activeId: string,
  overId: string
): { items: CategoryNode[]; ids: string[] } | null {
  if (activeId === overId) return null;

  const siblings = items.filter((n) => n.parent_id === parentId).sort(byTreeOrder);

  const oldIndex = siblings.findIndex((n) => n.id === activeId);
  const newIndex = siblings.findIndex((n) => n.id === overId);
  if (oldIndex === -1 || newIndex === -1) return null;

  const reordered = siblings.slice();
  const [moved] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, moved);

  const orderById = new Map(reordered.map((n, i) => [n.id, i]));
  const newItems = items.map((n) =>
    orderById.has(n.id) ? { ...n, sort_order: orderById.get(n.id)! } : n
  );

  return { items: newItems, ids: reordered.map((n) => n.id) };
}
