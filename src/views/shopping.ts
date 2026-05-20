import type { ShoppingItem } from "../types.ts";

// ── Category definitions ───────────────────────────────────────────────────

export const SHOPPING_CATEGORIES = [
  {
    key: "obst",
    label: "Obst & Gemüse",
    color: "#30D158",
    keywords: [
      // Deutsch – Obst
      "apfel", "birne", "banane", "orange", "mandarine", "clementine", "grapefruit", "pomelo",
      "traube", "weintraube", "erdbeere", "himbeere", "brombeere", "heidelbeere", "johannisbeere",
      "kirsche", "pflaume", "zwetschge", "pfirsich", "aprikose", "nektarine", "mango", "papaya",
      "ananas", "melone", "wassermelone", "kiwi", "zitrone", "limette", "avocado", "feige",
      "granatapfel", "passionsfrucht", "guave", "lychee", "kokosnuss", "datteln", "trockenfrüchte",
      "rosinen", "cranberries", "obst", "frisches obst", "früchte", "frucht", "fruchtig",
      "äpfel", "birnen", "erdbeeren", "himbeeren", "brombeeren",
      "zuckerschoten", "physalis", "kumquat", "maracuja",
      // Deutsch – Gemüse
      "tomate", "gurke", "paprika", "zucchini", "aubergine", "karotte", "möhre", "sellerie",
      "lauch", "zwiebel", "schalotte", "frühlingszwiebel", "knoblauch", "kartoffel", "süßkartoffel",
      "brokkoli", "blumenkohl", "rotkohl", "weißkohl", "chinakohl", "rosenkohl", "kohlrabi",
      "wirsing", "spinat", "mangold", "rucola", "salat", "feldsalat", "kopfsalat", "eisbergsalat",
      "rucola", "pilze", "champignon", "steinpilz", "pfifferling", "kräuterseitling",
      "ingwer", "erbsen", "bohnen", "edamame", "mais", "maiskolben", "maiskörner",
      "rote bete", "steckrübe", "pastinake",
      "radieschen", "spargel", "artischocke", "fenchel", "kürbis", "hokkaido", "butternut",
      "pak choi", "koriander", "petersilie", "basilikum", "schnittlauch", "thymian", "rosmarin",
      "salbei", "minze", "dill", "estragon", "oregano frisch", "gemüse", "frisches gemüse",
      "blattsalat", "rucola", "chicorée", "endivie", "grünkohl", "staudensellerie",
      // Österreichische Begriffe
      "marille", "marillen", "zwetschke", "zwetschken", "ribisel",
      "paradeiser", "paradeisern", "fisolen", "karfiol", "erdäpfel", "erdapfel",
      "kukuruz", "vogerlsalat", "vogerl", "kren",
      "weintrauben", "trauben", "beeren",
      "maracuja", "yam", "süßkartoffeln",
      // English – Fruit
      "apple", "pear", "banana", "orange", "mandarin", "clementine", "grapefruit",
      "grape", "strawberry", "raspberry", "blackberry", "blueberry", "cranberry",
      "cherry", "plum", "peach", "apricot", "nectarine", "mango", "papaya",
      "pineapple", "melon", "watermelon", "kiwi", "lemon", "lime", "avocado",
      "fig", "pomegranate", "passion fruit", "guava", "lychee", "coconut",
      "date", "dried fruit", "raisins", "prunes", "fruit",
      // English – Vegetables
      "tomato", "tomatoes", "cucumber", "bell pepper", "capsicum", "zucchini", "courgette",
      "eggplant", "aubergine", "carrot", "celery", "leek", "onion", "shallot",
      "spring onion", "green onion", "scallion", "garlic", "potato", "sweet potato",
      "broccoli", "cauliflower", "red cabbage", "cabbage", "bok choy", "pak choi",
      "brussels sprout", "kohlrabi", "savoy", "spinach", "swiss chard", "arugula",
      "rocket", "lettuce", "romaine", "iceberg", "mushroom", "shiitake", "portobello",
      "ginger", "peas", "green beans", "edamame", "corn", "beetroot", "turnip",
      "parsnip", "radish", "asparagus", "artichoke", "fennel", "pumpkin", "squash",
      "butternut", "kale", "coriander", "parsley", "basil", "chives", "thyme",
      "rosemary", "mint", "dill", "sage", "oregano fresh", "vegetable", "vegetables",
      "salad", "greens", "herbs",
      // Español – Fruta
      "manzana", "pera", "platano", "plátano", "platanos", "plátanos",
      "banano", "bananos",
      "naranja", "mandarina", "clementina",
      "pomelo", "uva", "fresa", "frambuesa", "mora", "arándano", "cereza",
      "ciruela", "melocotón", "durazno", "albaricoque", "nectarina", "mango", "papaya",
      "piña", "melón", "sandía", "kiwi", "limón", "lima", "aguacate", "higo",
      "granada", "maracuyá", "guayaba", "lichi", "coco", "dátil", "ciruela pasa",
      "frutas secas", "pasas", "fruta", "frutas",
      // Español – Verdura
      "tomate", "pepino", "pimiento", "calabacín", "berenjena", "zanahoria", "apio",
      "puerro", "cebolla", "chalota", "cebolleta", "cebollino", "ajo", "patata",
      "papa", "boniato", "batata", "brócoli", "coliflor", "lombarda", "repollo",
      "col china", "coles de bruselas", "colinabo", "berza", "espinaca", "acelga",
      "rúcula", "lechuga", "champiñón", "seta", "boletus", "jengibre", "guisante",
      "judía verde", "edamame", "maíz", "remolacha", "nabo", "chirivía", "rábano",
      "espárrago", "alcachofa", "hinojo", "calabaza", "col rizada", "kale",
      "cilantro", "perejil", "albahaca", "menta", "tomillo", "romero", "salvia",
      "eneldo", "estragón", "verdura", "verduras", "ensalada", "hierbas",
    ],
  },
  {
    key: "milch",
    label: "Milch & Kühlwaren",
    color: "#64D2FF",
    keywords: [
      // Deutsch — "ei" entfernt; nur "eier" verwenden
      "milch", "vollmilch", "fettarme milch", "laktosefreie milch", "hafermilch", "mandelmilch",
      "sojamilch", "kokosmilch getränk", "butter", "margarine", "sahne", "schlagsahne", "schlagobers", "topfen", "topfenaufstrich",
      "kaffeesahne", "obers", "joghurt", "naturjoghurt", "griechischer joghurt", "kefir",
      "buttermilch", "quark", "magerquark", "frischkäse", "hüttenkäse", "ricotta",
      "mascarpone", "crème fraîche", "schmand", "sauerrahm", "skyr",
      "käse", "schnittkäse", "weichkäse", "mozzarella", "parmesan", "gouda", "edamer",
      "cheddar", "brie", "camembert", "emmentaler", "gruyère", "feta", "halloumi",
      "raclette", "manchego", "bergkäse", "tilsiter",
      "eier", "freilandeier", "bioeier",
      // Kühlregal Extras
      "tofu", "seidentofu", "räuchertofu", "tempeh",
      "tzatziki", "hummus", "guacamole",
      "aufschnitt", "wurst aufschnitt", "kassler", "pastete",
      "sojajoghurt", "kokosjoghurt", "hafermilchjoghurt", "mandeljoghurt",
      "pflanzenmilch",
      // English
      "milk", "whole milk", "skimmed milk", "semi-skimmed", "oat milk", "almond milk",
      "soy milk", "coconut milk drink", "butter", "margarine", "cream", "whipping cream",
      "heavy cream", "double cream", "single cream", "sour cream", "crème fraîche",
      "yogurt", "yoghurt", "greek yogurt", "kefir", "buttermilk", "quark",
      "cream cheese", "cottage cheese", "ricotta", "mascarpone", "skyr",
      "cheese", "mozzarella", "parmesan", "gouda", "edam", "cheddar", "brie",
      "camembert", "emmental", "gruyere", "feta", "halloumi", "manchego",
      "eggs", "free range eggs", "organic eggs",
      "tofu", "silken tofu", "smoked tofu", "tempeh",
      "tzatziki", "hummus", "guacamole",
      "cold cuts", "deli meat",
      "soy yogurt", "coconut yogurt", "oat yogurt", "dairy-free yogurt",
      // Español
      "leche", "leche entera", "leche desnatada", "leche semidesnatada", "leche sin lactosa",
      "bebida de avena", "bebida de almendras", "bebida de soja",
      "mantequilla", "margarina", "nata", "nata para montar", "crema de leche",
      "nata agria", "crème fraîche", "yogur", "yogur griego", "kefir", "suero de leche",
      "quark", "requesón", "ricotta", "mascarpone", "queso crema", "queso cottage", "skyr",
      "queso", "mozzarella", "parmesano", "gouda", "edam", "cheddar", "brie",
      "camembert", "emmental", "gruyère", "feta", "halloumi", "manchego",
      "huevos", "huevos camperos", "huevos ecológicos",
      "tofu", "tempeh",
      "tzatziki", "hummus", "guacamole",
      "embutido", "charcutería",
      "yogur de soja", "yogur de coco", "yogur de avena",
    ],
  },
  {
    key: "fleisch",
    label: "Fleisch & Fisch",
    color: "#FF9F0A",
    keywords: [
      // Deutsch
      "fleisch", "rind", "rindfleisch", "rindersteak", "rinderhack", "entrecôte",
      "schwein", "schweinefleisch", "schweineschnitzel", "schweinekotelett",
      "huhn", "hähnchen", "hühnerbrust", "hühnerfilet", "hühnerkeule", "hähnchenflügel",
      "pute", "putenbrust", "putenfilet", "ente", "entenbrust", "entenkeule", "entenschenkel",
      "gans", "gänsebraten", "lamm", "lammkeule", "lammkotelett",
      "kaninchen", "wild", "hirsch", "reh", "wildschwein",
      "hack", "hackfleisch", "wurst", "bratwurst", "currywurst", "weißwurst", "wiener",
      "schinken", "kochschinken", "rohschinken", "parmaschinken", "speck", "pancetta",
      "salami", "pepperoni", "chorizo", "mortadella", "leberwurst", "blutwurst", "faschiertes", "faschiertes fleisch", "leberkäse", "leberkässemmel", "extrawurst", "käsekrainer", "debreziner", "cabanossi", "surschnitzel", "geselchtes", "selchfleisch", "grammelschmalz", "zunge", "lunge",
      "fleischkäse", "lyoner", "schnitzel", "steak", "filet", "kotelett", "spare ribs",
      "fisch", "lachs", "lachsfilet", "räucherlachs", "thunfisch", "forelle", "makrele",
      "hering", "sardine", "kabeljau", "dorsch", "seelachs", "pangasius", "tilapia",
      "zander", "barsch", "heilbutt", "wolfsbarsch",
      "garnelen", "shrimps", "crevetten", "krabben", "muscheln", "miesmuscheln",
      "venusmuscheln", "tintenfisch", "oktopus", "meeresfrüchte", "surimi", "fischstäbchen",
      // English
      "meat", "beef", "ground beef", "mince", "minced beef", "sirloin", "ribeye",
      "pork", "pork chop", "pork belly",
      "chicken", "chicken breast", "chicken thigh", "chicken wing", "chicken drumstick",
      "turkey", "turkey breast", "duck", "goose", "lamb", "leg of lamb", "lamb chop",
      "rabbit", "venison", "game", "wild boar",
      "sausage", "bratwurst", "chorizo", "salami", "pepperoni", "mortadella",
      "ham", "prosciutto", "serrano", "bacon", "pancetta", "liverwurst", "black pudding",
      "chop", "steak", "fillet", "spare ribs", "cutlet",
      "fish", "salmon", "smoked salmon", "tuna", "trout", "mackerel", "herring",
      "sardine", "cod", "haddock", "sea bass", "seabass", "tilapia", "halibut",
      "sole", "plaice",
      "shrimp", "prawns", "crab", "mussels", "clams", "squid", "octopus",
      "seafood", "fish fingers", "fish sticks", "surimi",
      // Español
      "carne", "ternera", "vacuno", "carne picada", "filete de ternera", "entrecot",
      "cerdo", "lomo de cerdo", "costilla de cerdo", "chuleta de cerdo",
      "pollo", "pechuga de pollo", "muslo de pollo", "alita de pollo", "contramuslo",
      "pavo", "pechuga de pavo", "pato", "ganso", "cordero", "pierna de cordero",
      "chuleta de cordero", "conejo", "venado", "caza",
      "salchicha", "chorizo", "salami", "pepperoni", "mortadela",
      "jamón", "jamón serrano", "jamón ibérico", "jamón york", "tocino", "panceta",
      "morcilla", "fuet", "butifarra", "sobrasada", "filete", "chuleta", "costilla",
      "pescado", "salmón", "salmón ahumado", "atún", "trucha", "caballa", "arenque",
      "sardina", "bacalao", "merluza", "rape", "dorada", "lubina", "tilapia", "halibut",
      "lenguado",
      "gambas", "langostino", "camarón", "cangrejo", "mejillón", "almeja",
      "calamar", "pulpo", "marisco", "surimi", "palitos de cangrejo",
    ],
  },
  {
    key: "backwaren",
    label: "Backwaren & Nudeln",
    color: "#FF6B47",
    keywords: [
      // Deutsch
      "brot", "weizenbrot", "vollkornbrot", "roggenbrot", "sauerteigbrot", "dinkelbrot",
      "brötchen", "semmel", "laugenbrezel", "brezel", "toast", "toastbrot", "croissant",
      "baguette", "ciabatta", "focaccia", "pittabrot", "pita", "tortilla", "wrap",
      "kuchen", "torte", "hefezopf", "stollen", "muffin", "keks", "waffel",
      "zwieback", "knäckebrot", "cracker", "reiswaffel", "semmelbrösel", "paniermehl",
      "mehl", "weizenmehl", "vollkornmehl", "dinkelmehl", "roggenmehl", "maismehl",
      "hefe", "backpulver", "natron", "speisestärke",
      "pasta", "nudeln", "spaghetti", "penne", "rigatoni", "fusilli", "farfalle",
      "tagliatelle", "linguine", "lasagne", "gnocchi", "spätzle", "mie-nudeln",
      "reis", "basmatireis", "jasminreis", "vollkornreis", "risottoreis", "wildreis",
      "quinoa", "couscous", "bulgur", "hirse", "buchweizen", "polenta", "grieß",
      "haferflocken", "müsli", "granola", "cornflakes", "cerealien", "porridge",
      // Österreichische Backwaren
      "kaisersemmel", "handsemmel", "kornspitz", "mohnweckerl", "kürbiskernweckerl", "laugenstangerl", "vollkornweckerl",
      "kipferl", "buchteln", "topfenstrudel", "apfelstrudel", "milchrahmstrudel",
      "kürbiskernbrot", "wachauer laib", "roggenmischbrot",
      "linsen", "rote linsen", "kichererbsen", "kidneybohnen", "weiße bohnen",
      // English
      "bread", "wholemeal bread", "sourdough", "rye bread", "spelt bread",
      "roll", "bun", "pretzel", "toast", "croissant", "baguette", "ciabatta",
      "focaccia", "pita", "pitta", "tortilla", "wrap", "flatbread",
      "cake", "muffin", "cookie", "biscuit", "waffle", "crispbread",
      "crackers", "rice cake", "breadcrumbs",
      "flour", "wholemeal flour", "spelt flour", "rye flour", "cornmeal",
      "yeast", "baking powder", "baking soda", "cornstarch",
      "pasta", "noodles", "spaghetti", "penne", "rigatoni", "fusilli", "farfalle",
      "tagliatelle", "linguine", "lasagna", "lasagne", "gnocchi", "ramen", "udon",
      "rice", "basmati rice", "jasmine rice", "brown rice", "risotto rice", "wild rice",
      "arborio",
      "quinoa", "couscous", "bulgur", "millet", "buckwheat", "polenta", "semolina",
      "oats", "oatmeal", "rolled oats", "muesli", "granola", "cornflakes", "cereal",
      "lentils", "red lentils", "chickpeas", "kidney beans", "white beans", "black beans",
      // Español
      "pan", "pan integral", "pan de centeno", "pan de masa madre", "pan de espelta",
      "panecillo", "bollo", "pretzel", "tostada", "pan de molde", "croissant",
      "baguette", "ciabatta", "focaccia", "pita", "tortilla de trigo", "wrap",
      "pastel", "muffin", "galleta", "gofre", "biscote", "cracker", "torta de arroz",
      "pan rallado",
      "harina", "harina integral", "harina de espelta", "harina de centeno",
      "harina de maíz", "levadura", "levadura química", "bicarbonato", "maicena",
      "pasta", "fideos", "espagueti", "penne", "rigatoni", "fusilli", "farfalle",
      "tallarín", "lasaña", "ñoqui", "gnocchi", "fideos chinos",
      "arroz", "arroz basmati", "arroz jazmín", "arroz integral", "arroz para risotto",
      "arroz salvaje",
      "quinoa", "cuscús", "bulgur", "mijo", "trigo sarraceno", "polenta", "sémola",
      "avena", "copos de avena", "muesli", "granola", "copos de maíz", "cereales",
      "lentejas", "lentejas rojas", "garbanzos", "alubias", "judías", "frijoles",
    ],
  },
  {
    key: "tiefkuehl",
    label: "Tiefkühl",
    color: "#5AC8FA",
    keywords: [
      // Deutsch
      "tiefkühl", "tiefgefroren", "gefroren", "gefrorene", "tk-",
      "speiseeis", "eiscreme", "eisbecher", "eis am stiel", "sorbet", "gelato",
      "fischstäbchen", "garnelen tiefkühl", "lachs tiefkühl",
      "pommes", "pommes frites", "kroketten", "rösti",
      "nuggets", "chicken nuggets", "schnitzel tiefkühl",
      "tiefkühlgemüse", "tiefkühlerbsen", "tiefkühlspinat", "tiefkühlbohnen",
      "tiefkühlbeeren", "blaubeeren gefroren", "erdbeeren gefroren",
      "fertigpizza", "tiefkühlpizza", "flammkuchen tiefkühl",
      // English
      "frozen", "ice cream", "gelato", "sorbet", "popsicle", "ice lolly", "ice pop",
      "frozen peas", "frozen spinach", "frozen vegetables", "frozen berries",
      "frozen fish", "fish fingers", "fish sticks",
      "frozen pizza", "frozen fries", "french fries", "hash brown",
      "nuggets", "frozen chicken",
      // Español
      "congelado", "congelada", "congelados", "congeladas",
      "helado", "sorbete", "polo",
      "verduras congeladas", "guisantes congelados", "espinacas congeladas",
      "pescado congelado", "gambas congeladas",
      "pizza congelada", "papas fritas congeladas", "croquetas congeladas",
      "nuggets", "pollo congelado",
    ],
  },
  {
    key: "konserven",
    label: "Konserven & Vorräte",
    color: "#FF375F",
    keywords: [
      // Deutsch
      "konserve", "konserven", "dose", "dosen", "büchse", "büchsen", "eingemacht", "eingelegt", "einmachglas",
      "öl", "speiseöl",
      "tomatensoße", "passata", "tomatenmark", "geschälte tomaten", "dosentomaten",
      "ketchup", "senf", "mayonnaise", "mayo", "soße", "sauce", "bratensauce",
      "sojasauce", "worcester", "tabasco", "sriracha", "chilisauce", "currysauce",
      "hollandaise", "béchamel", "pesto", "tapenade",
      "olivenöl", "rapsöl", "sonnenblumenöl", "kokosöl", "sesamöl", "walnussöl",
      "essig", "weinessig", "balsamico", "apfelessig",
      "zucker", "rohrzucker", "puderzucker", "brauner zucker",
      "salz", "meersalz", "himalayasalz",
      "pfeffer", "schwarzer pfeffer", "weißer pfeffer", "paprikapulver", "cayennepfeffer",
      "zimt", "kardamom", "kurkuma", "curry", "kreuzkümmel", "koriander gemahlen",
      "muskatnuss", "nelken", "lorbeer", "gewürzmischung", "grillgewürz",
      "vanille", "vanillezucker", "vanilleextrakt",
      "marmelade", "konfitüre", "gelee", "honig", "ahornsirup", "agavendicksaft",
      "nussmus", "erdnussbutter", "mandelmus", "nutella", "nuss-nougat-creme",
      "schokolade", "zartbitterschokolade", "vollmilchschokolade", "weiße schokolade",
      "kakaopulver", "trinkschokolade",
      "nüsse", "mandeln", "cashewnüsse", "walnüsse", "erdnüsse", "haselnüsse",
      "paranüsse", "pecannüsse", "pistazien", "macadamia", "mischung",
      "chips", "kartoffelchips", "salzstangen", "brezel snack", "popcorn",
      "thunfisch dose", "sardinen dose", "mais dose", "linsen dose", "bohnen dose",
      "kokosmilch", "kokosnussmilch",
      // Spezialzutaten
      "tahini", "tahin",
      "miso", "misopaste",
      "reisnudeln", "glasnudeln", "fadennudeln",
      "kokoswasser",
      "soßenbinder", "instant", "liptauer", "verhackertes",
      // Österreichische Gewürze/Vorräte
      "kürbiskernöl", "steirisches kürbiskernöl", "essig most", "ringlottenmarmelade",
      "fertigsuppe", "brühe", "instant brühe",
      "breadcrumbs",
      // English
      "canned", "tinned", "jar", "preserve", "pickle", "pickled",
      "tomato sauce", "tomato paste", "passata", "pasta sauce", "crushed tomatoes",
      "ketchup", "mustard", "mayonnaise", "mayo", "hot sauce", "soy sauce",
      "worcestershire", "sriracha", "chili sauce", "curry sauce", "pesto", "tapenade",
      "olive oil", "vegetable oil", "sunflower oil", "coconut oil", "sesame oil",
      "vinegar", "wine vinegar", "balsamic", "apple cider vinegar",
      "sugar", "caster sugar", "icing sugar", "brown sugar",
      "salt", "sea salt", "himalayan salt",
      "pepper", "black pepper", "white pepper", "paprika", "cayenne",
      "cinnamon", "cardamom", "turmeric", "cumin", "coriander powder",
      "nutmeg", "cloves", "bay leaf", "mixed spice", "spice",
      "vanilla", "vanilla extract", "vanilla sugar",
      "jam", "jelly", "marmalade", "honey", "maple syrup", "agave",
      "peanut butter", "almond butter", "nut butter", "nutella", "hazelnut spread",
      "chocolate", "dark chocolate", "milk chocolate", "white chocolate",
      "cocoa powder", "drinking chocolate",
      "nuts", "almonds", "cashews", "walnuts", "peanuts", "hazelnuts",
      "brazil nuts", "pecans", "pistachios", "macadamia", "mixed nuts",
      "crisps", "chips", "pretzels", "popcorn", "crackers", "snack",
      "canned tuna", "canned sardines", "canned corn", "canned tomatoes", "canned beans",
      "coconut milk",
      "tahini", "miso paste",
      "rice noodles", "glass noodles", "vermicelli",
      "coconut water", "coconut cream",
      "instant noodles", "instant soup", "broth", "bouillon",
      // Español
      "conserva", "lata", "bote", "frasco", "encurtido", "escabeche",
      "salsa de tomate", "tomate triturado", "concentrado de tomate", "tomate frito",
      "ketchup", "mostaza", "mayonesa", "salsa picante", "salsa de soja",
      "worcestershire", "sriracha", "pesto", "tapenade",
      "aceite de oliva", "aceite de girasol", "aceite de coco", "aceite de sésamo",
      "vinagre", "vinagre de vino", "vinagre balsámico", "vinagre de manzana",
      "azúcar", "azúcar moreno", "azúcar glas",
      "sal", "sal marina", "sal del himalaya",
      "pimienta", "pimienta negra", "pimienta blanca", "pimentón", "cayena",
      "canela", "cúrcuma", "comino", "cilantro molido", "cardamomo",
      "nuez moscada", "clavo", "laurel", "especias",
      "vainilla", "extracto de vainilla", "azúcar vainillado",
      "mermelada", "confitura", "jalea", "miel", "sirope de arce", "agave",
      "mantequilla de cacahuete", "mantequilla de almendras", "nutella", "crema de cacao",
      "chocolate", "chocolate negro", "chocolate con leche", "chocolate blanco",
      "cacao en polvo", "cacao puro",
      "frutos secos", "almendras", "anacardos", "nueces", "cacahuetes", "avellanas",
      "nueces de Brasil", "pacanas", "pistachos", "macadamia",
      "patatas fritas", "palomitas", "aperitivos", "snacks",
      "atún en lata", "sardinas en lata", "maíz en lata", "judías en lata",
      "leche de coco",
      "tahini", "pasta de sésamo",
      "pasta de miso",
      "fideos de arroz", "fideos de cristal",
      "agua de coco", "crema de coco",
      "caldo instantáneo", "caldo", "fideos instantáneos",
    ],
  },
  {
    key: "getraenke",
    label: "Getränke",
    color: "#BF5AF2",
    keywords: [
      // Deutsch
      "wasser", "mineralwasser", "sprudel", "stilles wasser",
      "saft", "orangensaft", "apfelsaft", "traubensaft", "tomatensaft", "multivitaminsaft",
      "fruchtsaft", "nektar", "smoothie", "eistee",
      // compound juice types (needed because "saft" is now exact-token only)
      "mangosaft", "birnensaft", "ananassaft", "kirschsaft", "pflaumensaft",
      "cranberrysaft", "johannisbeersaft", "grapefruitsaft", "traubensaft",
      "guavensaft", "maracujasaft", "holundersaft", "rhabarbersaft",
      "cola", "limo", "limonade", "fanta", "sprite", "energydrink", "energy drink",
      "sportgetränk", "sirup", "brause", "spezi", "radler alkoholfrei",
      "bier", "pils", "weizen", "weizenbier", "radler", "alkoholfreies bier",
      "wein", "rotwein", "weißwein", "rosé", "prosecco", "sekt", "champagner", "cava",
      "schnaps", "gin", "rum", "vodka", "whisky", "whiskey", "likör", "aperol", "campari",
      "kaffee", "kaffeebohnen", "filterkaffee", "espresso", "cappuccino",
      "tee", "grüntee", "schwarztee", "kräutertee", "früchtetee", "kamillentee",
      "kakao", "heiße schokolade",
      // Marken & Österreich
      "red bull", "redbull", "monster energy", "monster", "burn energy", "burn", "rockstar",
      "almdudler", "vöslauer", "römerquelle", "waldquelle", "güssinger",
      "ottakringer", "schwechater", "zipfer", "puntigamer", "göss", "murauer", "kaiser bier", "wieselburger",
      "coca-cola", "coca cola", "pepsi cola", "pepsi max", "pepsi light", "coca cola zero", "coke zero",
      "rauch", "hohes c", "pfanner", "tropicana", "capri sonne", "capri sun",
      "hugo", "aperol spritz", "spritzer", "weinschorle",
      "melange", "verlängerter", "mokka", "schwarzer", "brauner", "einspänner",
      "protein shake", "proteinshake", "iso drink", "isodrink",
      "leitungswasser",
      // English
      "water", "sparkling water", "mineral water", "still water",
      "juice", "orange juice", "apple juice", "grape juice", "tomato juice",
      "fruit juice", "smoothie", "iced tea", "nectar",
      "cola", "coke", "pepsi", "lemonade", "soda", "energy drink", "sports drink",
      "syrup", "squash", "cordial",
      "beer", "lager", "ale", "stout", "cider", "non-alcoholic beer",
      "wine", "red wine", "white wine", "rosé", "rose wine", "prosecco",
      "sparkling wine", "champagne",
      "spirits", "gin", "rum", "vodka", "whisky", "whiskey", "liqueur",
      "coffee", "coffee beans", "filter coffee", "espresso", "cappuccino", "latte",
      "tea", "green tea", "black tea", "herbal tea", "fruit tea", "chamomile",
      "cocoa", "hot chocolate",
      "drink", "beverage",
      // Español
      "agua", "agua mineral", "agua con gas", "agua sin gas",
      "zumo", "jugo", "zumo de naranja", "zumo de manzana", "zumo de uva",
      "zumo de tomate", "néctar", "smoothie", "batido", "té helado",
      "refresco", "cola", "naranjada", "limonada", "bebida energética", "bebida isotónica",
      "sirope", "jarabe",
      "cerveza", "cerveza rubia", "cerveza negra", "sidra", "cerveza sin alcohol",
      "vino", "vino tinto", "vino blanco", "vino rosado", "rosado", "prosecco",
      "cava", "champán", "vino espumoso",
      "licor", "ginebra", "ron", "vodka", "whisky", "whiskey", "aperitivo",
      "café", "granos de café", "café molido", "espresso", "cappuccino", "café con leche",
      "té", "té verde", "té negro", "infusión", "manzanilla", "tila",
      "cacao", "chocolate caliente",
      "bebida", "refresco",
    ],
  },
  {
    key: "haushalt",
    label: "Haushalt & Pflege",
    color: "#8E8E93",
    keywords: [
      // Deutsch
      "putzmittel", "allzweckreiniger", "badreiniger", "wcreiniger", "glasreiniger",
      "spülmittel", "spültabs", "geschirrspülmittel", "entkalker", "backofenreiniger",
      "abflussreiniger", "waschmittel", "colorwaschmittel", "weichspüler", "fleckentferner",
      "toilettenpapier", "klopapier", "küchenpapier", "haushaltsrolle",
      "müllbeutel", "mistbeutel", "gefrierbeutel", "frischhaltefolie", "alufolie", "backpapier",
      "schwamm", "spülschwamm", "reinigungstuch", "microfasertuch", "schrubber",
      "seife", "handseife", "flüssigseife", "körperseife", "duschgel", "badeschaum",
      "shampoo", "haarshampoo", "spülung", "haarspülung", "haarkur",
      "zahnpasta", "zahncreme", "zahnbürste", "mundwasser", "zahnseide",
      "deo", "deodorant", "antitranspirant", "parfüm", "aftershave",
      "bodylotion", "körperlotion", "handcreme", "gesichtscreme", "sonnencreme", "lippenpflege",
      "wattepads", "wattestäbchen", "rasierer", "rasierschaum", "rasiercreme",
      "windeln", "babywindeln", "feuchttücher", "babytücher", "taschentücher", "papiertaschentücher",
      "tampons", "binden", "slipeinlage", "damenbinden", "monatshygiene",
      "desinfektionsmittel", "pflaster", "verbandsmaterial",
      // Kosmetik & Schönheit
      "make-up", "makeup", "schminke", "lippenstift", "lipgloss",
      "mascara", "wimperntusche", "eyeliner", "kajal", "lidschatten",
      "concealer", "foundation", "puder", "rouge", "blush", "highlighter",
      "nagellack", "nagelentferner", "nagelfeile",
      "haargel", "haarwachs", "haarspray", "haarmousse", "haarpflegemittel",
      "kontaktlinsen", "kontaktlinsenflüssigkeit", "pflegelösung linsen",
      // English
      "detergent", "all-purpose cleaner", "bathroom cleaner", "toilet cleaner",
      "glass cleaner", "dish soap", "dishwasher tablet", "dishwasher pods",
      "descaler", "oven cleaner", "drain cleaner",
      "laundry detergent", "washing powder", "fabric softener", "stain remover",
      "toilet paper", "paper towels", "kitchen roll",
      "trash bag", "garbage bag", "freezer bag", "zip lock", "cling film",
      "aluminium foil", "baking paper", "parchment paper",
      "sponge", "cleaning cloth", "microfiber cloth",
      "soap", "hand soap", "body wash", "shower gel", "bath foam",
      "shampoo", "conditioner", "hair mask",
      "toothpaste", "toothbrush", "mouthwash", "dental floss",
      "deodorant", "antiperspirant", "perfume",
      "body lotion", "hand cream", "face cream", "moisturiser", "sunscreen", "lip balm",
      "cotton pads", "cotton buds", "razor", "shaving foam", "shaving cream",
      "diapers", "nappies", "wet wipes", "baby wipes",
      "tampons", "sanitary pads", "panty liners", "sanitary towels", "feminine hygiene",
      "tissues", "paper tissues", "facial tissues", "handkerchiefs",
      "disinfectant", "plasters", "bandages",
      // Cosmetics & Beauty
      "makeup", "cosmetics", "lipstick", "lip gloss", "lip liner",
      "mascara", "eyeliner", "eyeshadow", "concealer", "foundation", "powder",
      "blush", "bronzer", "highlighter", "nail polish", "nail varnish", "nail remover",
      "hair gel", "hairspray", "hair mousse", "hair wax",
      "contact lenses", "lens solution",
      // Español
      "limpiador multiusos", "limpiador de baño", "limpiainodoros",
      "limpiacristales", "lavavajillas", "pastillas lavavajillas", "descalcificador",
      "limpiahornos", "desatascador",
      "detergente para ropa", "detergente líquido", "suavizante", "quitamanchas",
      "papel higiénico", "papel de cocina", "rollo de cocina",
      "bolsa de basura", "bolsa zip", "film transparente", "papel de aluminio", "papel de horno",
      "estropajo", "bayeta", "microfibra",
      "jabón", "jabón de manos", "jabón líquido", "gel de ducha", "espuma de baño",
      "champú", "acondicionador", "mascarilla capilar",
      "pasta de dientes", "cepillo de dientes", "enjuague bucal", "hilo dental",
      "desodorante", "antitranspirante", "perfume", "colonia",
      "loción corporal", "crema de manos", "crema facial", "protector solar", "bálsamo labial",
      "discos desmaquillantes", "bastoncillos", "maquinilla", "espuma de afeitar",
      "pañales", "toallitas húmedas", "toallitas de bebé",
      "tampones", "compresas", "salvaslip",
      "toallas sanitarias", "toallas íntimas", "compresas sanitarias",
      "higiene femenina", "higiene íntima", "protector diario",
      "toallitas", "pañuelos", "kleenex",
      "desinfectante", "tiritas", "vendas",
      // Cosmética
      "maquillaje", "labial", "pintalabios", "lápiz labial", "brillo de labios",
      "máscara de pestañas", "rímel", "delineador", "sombra de ojos",
      "colorete", "iluminador", "corrector", "base de maquillaje", "polvo compacto",
      "esmalte de uñas", "quitaesmalte", "lima de uñas",
      "gomina", "laca capilar", "mousse capilar",
      "lentillas", "líquido para lentillas", "solución para lentillas",
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

// Priority order matters: checked top-to-bottom, first match wins.
// Drinks first so "Apfelsaft"/"Jugo de manzana" match "saft"/"jugo" before "apfel"/"manzana".
const CATEGORIZATION_PRIORITY = [
  "getraenke", "tiefkuehl", "milch", "fleisch", "haushalt", "konserven", "backwaren", "obst",
] as const;

export function categorizeShoppingItem(name: string): string {
  const lower = name.toLowerCase().trim();
  // Split on whitespace and common separators for word-level matching
  const tokens = lower.split(/[\s\-\/,;]+/).filter(Boolean);

  for (const key of CATEGORIZATION_PRIORITY) {
    const cat = SHOPPING_CATEGORIES.find((c) => c.key === key);
    if (!cat) continue;
    if (
      (cat.keywords as readonly string[]).some((kw) => {
        if (kw.length <= 4) {
          // Short keywords (≤4 chars) must be exact tokens to avoid false positives:
          // "lata" (tin) inside "platanos", "agua" inside "aguacate",
          // "wein" (wine) inside "Schweinefleisch", "pan" inside "Pfanne", etc.
          return tokens.includes(kw);
        }
        // Longer keywords use substring match for German compound words:
        // "Apfelsaft" → "apfelsaft" keyword, "Vollkornbrot" → "vollkornbrot" keyword.
        return lower.includes(kw);
      })
    )
      return cat.key;
  }
  return "sonstiges";
}

// ── Storage ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "nanoclaw-shopping";
const TS_KEY = "nanoclaw-shopping-ts";
const BACKUP_KEY = "nanoclaw-shopping-backup";
const HA_ENTITY = "sensor.familienkalender_shopping";

interface HAConfig { baseUrl: string; token: string }

function haConfig(): HAConfig | null {
  try {
    const raw = localStorage.getItem("ha-config");
    return raw ? (JSON.parse(raw) as HAConfig) : null;
  } catch { return null; }
}

export function loadShoppingItems(): ShoppingItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const items = JSON.parse(raw) as ShoppingItem[];
      if (items.length > 0) return items;
    }
    // Primary key empty — try backup
    const backup = localStorage.getItem(BACKUP_KEY);
    if (backup) {
      const items = JSON.parse(backup) as ShoppingItem[];
      if (items.length > 0) {
        localStorage.setItem(STORAGE_KEY, backup);
        return items;
      }
    }
    return [];
  } catch {
    return [];
  }
}

export function saveShoppingItems(items: ShoppingItem[]): void {
  const ts = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  localStorage.setItem(TS_KEY, String(ts));
  if (items.length > 0) {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(items));
  }
  const cfg = haConfig();
  if (!cfg) return;
  // Never overwrite the HA sensor with an empty list. Empty writes are almost
  // always a side effect of stale local state or a race condition, not a
  // deliberate user action — and they would wipe the canonical copy that other
  // devices rely on. If a user explicitly clears the list, the local empty
  // state still survives on this device; on next sync HA's items will be
  // pulled back (which is the desired "soft delete" UX).
  if (items.length === 0) return;
  void fetch(`${cfg.baseUrl}/api/states/${HA_ENTITY}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ state: new Date(ts).toISOString(), attributes: { items, ts } }),
  }).catch(() => {});
}

export async function syncShoppingFromHA(): Promise<ShoppingItem[] | null> {
  const cfg = haConfig();
  if (!cfg) return null;
  const localTs = Number(localStorage.getItem(TS_KEY) ?? "0");
  const localItems = loadShoppingItems();
  try {
    const res = await fetch(`${cfg.baseUrl}/api/states/${HA_ENTITY}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    // HA has no entity yet — push whatever we have locally
    if (!res.ok) {
      if (localItems.length > 0) saveShoppingItems(localItems);
      return null;
    }
    const data = (await res.json()) as { attributes?: { items?: ShoppingItem[]; ts?: number } };
    const haTs = data.attributes?.ts ?? 0;
    const haItems = data.attributes?.items;
    // HA empty → push local
    if (!haItems || haItems.length === 0) {
      if (localItems.length > 0) saveShoppingItems(localItems);
      return null;
    }
    // Local empty but HA has data → always pull
    if (localItems.length === 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(haItems));
      localStorage.setItem(TS_KEY, String(haTs || Date.now()));
      return haItems;
    }
    // Both have data — compare timestamps
    if (haTs > localTs) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(haItems));
      localStorage.setItem(TS_KEY, String(haTs));
      return haItems;
    }
    if (localTs > haTs) saveShoppingItems(localItems);
    return null;
  } catch { return null; }
}

// ── Icons (inline to keep view self-contained) ─────────────────────────────

const ICONS = {
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>`,
  todo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l2 2 4-4M4 14l2 2 4-4M12 7h8M12 15h8"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.4 12.5a2 2 0 0 0 2 1.5h8.4a2 2 0 0 0 2-1.5L22 7H6"/></svg>`,
};


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
    <div class="scroll-wrapper">
      <div class="sticky-nav">
        <header class="header list-header">
          <h1 class="header__title">Einkauf${totalActive > 0 ? ` <span class="header__badge">${totalActive}</span>` : ""}</h1>
        </header>
        <div class="list-add">
          <input class="list-add__input" id="list-input" placeholder="Artikel hinzufügen…" autocomplete="off" autocorrect="on" />
          <button class="list-add__btn" data-action="add-item">${ICONS.plus}</button>
        </div>
      </div>
      ${bodyHtml}
    </div>
  `;
}
