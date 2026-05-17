import type { ShoppingItem, TabKey } from "../types.ts";

// ── Category definitions ───────────────────────────────────────────────────

export const SHOPPING_CATEGORIES = [
  {
    key: "obst",
    label: "Obst & Gemüse",
    color: "#30D158",
    keywords: [
      // Deutsch
      "apfel", "birne", "banane", "orange", "traube", "erdbeere", "heidelbeere", "kirsche", "pflaume", "mango", "ananas", "melone", "kiwi", "zitrone", "avocado", "tomate", "gurke", "paprika", "zucchini", "aubergine", "karotte", "möhre", "sellerie", "lauch", "zwiebel", "knoblauch", "kartoffel", "brokkoli", "blumenkohl", "kohl", "spinat", "salat", "rucola", "feldsalat", "pilze", "champignon", "ingwer", "erbsen", "bohnen", "mais",
      // English
      "apple", "pear", "grape", "strawberry", "blueberry", "cherry", "plum", "pineapple", "lemon", "lime", "peach", "apricot", "cucumber", "eggplant", "aubergine", "carrot", "celery", "leek", "onion", "garlic", "potato", "broccoli", "cauliflower", "cabbage", "spinach", "lettuce", "arugula", "mushroom", "ginger", "peas", "beans", "corn", "pepper", "zucchini", "beet", "radish", "asparagus", "artichoke", "fennel",
      // Español
      "manzana", "pera", "uva", "fresa", "frambuesa", "cereza", "ciruela", "piña", "limón", "lima", "melocotón", "durazno", "albaricoque", "pepino", "berenjena", "zanahoria", "apio", "puerro", "cebolla", "ajo", "patata", "papa", "brócoli", "coliflor", "repollo", "espinaca", "lechuga", "rúcula", "champiñón", "jengibre", "guisante", "judía", "maíz", "pimiento", "calabacín", "remolacha", "rábano", "espárrago", "alcachofa", "hinojo",
      "platano", "plátano", "platanos", "plátanos", "mandarina", "pomelo", "coco", "sandía", "melón", "higo", "dátil", "mora", "arándano", "tomate", "brote", "verdura", "fruta", "vegetal", "ensalada",
    ],
  },
  {
    key: "milch",
    label: "Milch & Kühlwaren",
    color: "#64D2FF",
    keywords: [
      // Deutsch
      "milch", "butter", "sahne", "joghurt", "quark", "frischkäse", "käse", "mozzarella", "parmesan", "gouda", "cheddar", "brie", "camembert", "ei", "eier", "obers", "schmand", "kefir", "buttermilch", "kühle",
      // English
      "milk", "cream", "yogurt", "yoghurt", "cheese", "egg", "eggs", "sour cream", "kefir",
      // Español
      "leche", "mantequilla", "nata", "crema", "yogur", "queso", "huevo", "huevos", "requesón",
    ],
  },
  {
    key: "fleisch",
    label: "Fleisch & Fisch",
    color: "#FF9F0A",
    keywords: [
      // Deutsch
      "fleisch", "rind", "schwein", "huhn", "hähnchen", "pute", "lamm", "hack", "hackfleisch", "wurst", "schinken", "speck", "salami", "bratwurst", "schnitzel", "steak", "filet", "fisch", "lachs", "thunfisch", "forelle", "makrele", "garnelen", "shrimps", "meeresfrüchte",
      // English
      "meat", "beef", "pork", "chicken", "turkey", "lamb", "minced", "sausage", "ham", "bacon", "fish", "salmon", "tuna", "trout", "shrimp", "prawns", "seafood", "cod", "tilapia",
      // Español
      "carne", "ternera", "cerdo", "pollo", "pavo", "cordero", "picada", "salchicha", "jamón", "tocino", "pescado", "salmón", "atún", "trucha", "gambas", "camarones", "mariscos", "bacalao",
    ],
  },
  {
    key: "backwaren",
    label: "Backwaren & Nudeln",
    color: "#FF6B47",
    keywords: [
      // Deutsch
      "brot", "brötchen", "toast", "croissant", "baguette", "semmel", "vollkornbrot", "ciabatta", "kuchen", "muffin", "keks", "mehl", "hefe", "pasta", "nudeln", "spaghetti", "penne", "reis", "vollkorn",
      // English
      "bread", "roll", "cake", "cookie", "biscuit", "flour", "yeast", "noodle", "rice", "cereal", "oats", "granola", "cracker",
      // Español
      "pan", "bollo", "pastel", "galleta", "harina", "levadura", "arroz", "fideos", "cereal", "avena", "tostada",
    ],
  },
  {
    key: "getraenke",
    label: "Getränke",
    color: "#BF5AF2",
    keywords: [
      // Deutsch
      "wasser", "saft", "cola", "limo", "limonade", "bier", "wein", "sekt", "kaffee", "tee", "espresso", "kakao", "smoothie", "energy", "mineralwasser", "sprudel",
      // English
      "water", "juice", "beer", "wine", "sparkling", "coffee", "tea", "cocoa", "cider", "lemonade", "soda", "drink",
      // Español
      "agua", "jugo", "zumo", "cerveza", "vino", "cava", "café", "té", "cacao", "gaseosa", "refresco", "bebida", "limonada",
    ],
  },
  {
    key: "haushalt",
    label: "Haushalt & Pflege",
    color: "#8E8E93",
    keywords: [
      // Deutsch
      "putzmittel", "spülmittel", "waschmittel", "toilettenpapier", "klopapier", "küchenpapier", "müllbeutel", "schwamm", "seife", "shampoo", "duschgel", "zahnpasta", "rasierer", "desinfektionsmittel", "wattepads",
      // English
      "detergent", "cleaner", "toilet paper", "paper towel", "trash bag", "garbage bag", "sponge", "soap", "conditioner", "toothpaste", "razor", "disinfectant", "cotton pad",
      // Español
      "detergente", "limpiador", "papel higiénico", "papel de cocina", "bolsa de basura", "esponja", "jabón", "champú", "gel de ducha", "pasta de dientes", "maquinilla", "desinfectante",
    ],
  },
  {
    key: "sonstiges",
    label: "Sonstiges",
    color: "#636366",
    keywords: [],
  },
] as const;

export type ShoppingCategoryKey = (typeof SHOPPING_CATEGORIES)[number]["key"];

// ── Auto-categorize ────────────────────────────────────────────────────────

// Check drinks before fruit/veg so "Jugo de manzana", "Apfelsaft" etc.
// don't match fruit keywords before the drink keyword is tested.
const CATEGORIZATION_PRIORITY = ["getraenke", "milch", "fleisch", "haushalt", "backwaren", "obst"] as const;

export function categorizeShoppingItem(name: string): string {
  const lower = name.toLowerCase();
  for (const key of CATEGORIZATION_PRIORITY) {
    const cat = SHOPPING_CATEGORIES.find((c) => c.key === key);
    if (cat && (cat.keywords as readonly string[]).some((kw) => lower.includes(kw))) return cat.key;
  }
  return "sonstiges";
}

// ── Storage ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "nanoclaw-shopping";

export function loadShoppingItems(): ShoppingItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShoppingItem[]) : [];
  } catch {
    return [];
  }
}

export function saveShoppingItems(items: ShoppingItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ── Icons (inline to keep view self-contained) ─────────────────────────────

const ICONS = {
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>`,
  todo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l2 2 4-4M4 14l2 2 4-4M12 7h8M12 15h8"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.4 12.5a2 2 0 0 0 2 1.5h8.4a2 2 0 0 0 2-1.5L22 7H6"/></svg>`,
};

function tabBar(active: TabKey): string {
  const items: { key: TabKey; icon: keyof typeof ICONS; label: string }[] = [
    { key: "kalender", icon: "home", label: "Kalender" },
    { key: "todo", icon: "todo", label: "To-Do" },
    { key: "einkauf", icon: "cart", label: "Einkauf" },
  ];
  return `<nav class="tab-bar">${items
    .map(
      (it) =>
        `<button class="tab-bar__item${it.key === active ? " tab-bar__item--active" : ""}" data-action="tab-${it.key}">
          <span class="tab-bar__icon">${ICONS[it.icon]}</span>
          <span class="tab-bar__label">${it.label}</span>
        </button>`
    )
    .join("")}</nav>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Render ─────────────────────────────────────────────────────────────────

export function renderShoppingView(items: ShoppingItem[]): string {
  const active = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);

  const groups = SHOPPING_CATEGORIES.map((cat) => ({
    cat,
    items: active.filter((i) => i.category === cat.key),
  })).filter((g) => g.items.length > 0);

  let bodyHtml = "";

  for (const { cat, items: groupItems } of groups) {
    const rows = groupItems
      .map(
        (item) => `
        <button class="list-item" data-action="toggle-item" data-id="${item.id}">
          <span class="list-item__check"></span>
          <span class="list-item__name">${escHtml(item.name)}</span>
        </button>`
      )
      .join("");
    bodyHtml += `
      <div class="category-group">
        <div class="category-header">
          <span class="category-dot" style="background:${cat.color};box-shadow:0 0 6px ${cat.color}55;"></span>
          <span class="category-label">${cat.label}</span>
          <span class="category-count">${groupItems.length}</span>
        </div>
        <div class="list-items">${rows}</div>
      </div>`;
  }

  if (done.length > 0) {
    const rows = done
      .map(
        (item) => `
        <button class="list-item list-item--checked" data-action="toggle-item" data-id="${item.id}">
          <span class="list-item__check list-item__check--done">${ICONS.check}</span>
          <span class="list-item__name">${escHtml(item.name)}</span>
        </button>`
      )
      .join("");
    bodyHtml += `
      <div class="category-group category-group--done">
        <div class="category-header">
          <span class="category-label category-label--muted">Erledigt (${done.length})</span>
          <button class="category-clear" data-action="clear-checked">Löschen</button>
        </div>
        <div class="list-items">${rows}</div>
      </div>`;
  }

  if (!bodyHtml) {
    bodyHtml = `<div class="list-empty">
      <div class="list-empty__icon">${ICONS.cart}</div>
      <p class="list-empty__text">Liste ist leer</p>
      <p class="list-empty__hint">Artikel oben hinzufügen</p>
    </div>`;
  }

  const totalActive = active.length;

  return `
    <header class="header list-header">
      <h1 class="header__title">Einkauf${totalActive > 0 ? ` <span class="header__badge">${totalActive}</span>` : ""}</h1>
    </header>
    <div class="list-add">
      <input class="list-add__input" id="list-input" placeholder="Artikel hinzufügen…" autocomplete="off" autocorrect="on" />
      <button class="list-add__btn" data-action="add-item">${ICONS.plus}</button>
    </div>
    <div class="list-body">${bodyHtml}</div>
    ${tabBar("einkauf")}
  `;
}
