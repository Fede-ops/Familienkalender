import type { FamilyMember, TodoItem, TabKey } from "../types.ts";

// ── Category definitions ───────────────────────────────────────────────────

export const TODO_CATEGORIES = [
  {
    key: "medizin",
    label: "Medizin & Chirurgie",
    color: "#FF6B47",
    keywords: [
      // ── Anamnese & Dokumentation ──────────────────────────────────────
      "anamnese", "anamneseerhebung", "anamnesebogen", "anamnesegespräch",
      "epikrise", "arztbrief", "entlassbrief", "arztbericht",
      "gutachten", "attest", "krankschreibung", "arbeitsunfähigkeit",
      "hauptdiagnose", "nebendiagnose", "einweisungsdiagnose",
      "aufnahme", "aufnahmedokumentation",
      "aufklären", "aufklärung", "aufklärungsgespräch", "aufklärungsbogen", "einwilligung",
      "konsil", "konsilbericht", "konsilanforderung",
      "bericht schreiben", "dokumentieren", "dokumentation",
      // ── Patienten ─────────────────────────────────────────────────────
      "patient", "patientin", "patientenakte", "patientengespräch", "patientenaufnahme",
      "entlassung", "entlassplanung", "einweisung",
      "stationsarzt", "stationsärztin", "facharzt", "fachärztin", "oberarzt", "oberärztin",
      // ── Chirurgie & OPs ───────────────────────────────────────────────
      "operation", "operieren", "operiert", "präoperativ", "postoperativ", "intraoperativ",
      "chirurgie", "chirurg", "chirurgin", "chirurgisch",
      "anästhesie", "anästhesist", "narkose", "lokalanästhesie",
      "aufklärung op", "op-vorbereitung", "op-liste",
      // ≤4-Zeichen Abkürzungen (Exact-Token-Match):
      "op", "ops", "med", "mri",
      "wundversorgung", "wundheilung", "naht", "verband",
      "blutung", "bluttransfusion", "transfusion",
      "nachsorge", "kontrolltermin",
      // ── Diagnostik ────────────────────────────────────────────────────
      "befund", "befunde", "laborbefund", "röntgenbefund",
      "diagnose", "differentialdiagnose", "diagnosestellung",
      "biopsie", "gewebeentnahme",
      "endoskopie", "gastroskopie", "koloskopie", "bronchoskopie",
      "arthroskopie", "laparoskopie",
      "röntgen", "ct", "mrt", "ultraschall", "sonographie", "echokardiogramm",
      "ekg", "elektrokardiogramm",
      "blutbild", "laborwerte", "labor",
      "radiologie", "radiologisch",
      "blutdruck", "puls", "sauerstoff",
      // ── Therapie & Behandlung ─────────────────────────────────────────
      "medikation", "dosierung", "arzneimittel", "medikament",
      "antibiose", "antibiotikum", "antibiotika",
      "infusion", "injektion", "katheter", "drainage",
      "schmerztherapie", "schmerzbehandlung",
      "chemotherapie", "strahlentherapie",
      "intensivmedizin", "palliativmedizin",
      "medikamentöse",
      // ── Stationsalltag & Dienste ──────────────────────────────────────
      "visite", "morgenvisite", "abendvisite", "chefarztvisite", "oberarztvisite",
      "dienst", "bereitschaftsdienst", "nachtdienst", "wochenenddienst", "spätdienst", "frühdienst",
      "fallbesprechung", "tumorboard", "morgenkonferenz",
      "stationsbesprechung", "übergabe",
      // ── Einrichtungen ─────────────────────────────────────────────────
      "klinik", "krankenhaus", "spital", "klinikum",
      "station", "normalstation", "intensivstation",
      "notaufnahme", "notfall",
      "ambulanz", "ambulant", "poliklinik", "praxis",
      "pflegepersonal", "pflegekraft", "krankenschwester", "pfleger",
      "instrumentierschwester", "op-saal",
      // ── Fachbereiche ──────────────────────────────────────────────────
      "onkologie", "orthopädie", "neurologie", "kardiologie", "gynäkologie",
      "pädiatrie", "unfallchirurgie", "gefäßchirurgie", "herz", "thorax",
      "komplikation", "komplikationen",
      // ── English ───────────────────────────────────────────────────────
      "anamnesis", "patient history", "medical history",
      "patient", "surgery", "surgical", "operation", "anesthesia", "anaesthesia",
      "ward", "round", "ward round", "diagnosis", "diagnose",
      "clinic", "hospital", "emergency", "outpatient",
      "radiology", "ultrasound", "scan", "x-ray", "mri", "ct scan",
      "ecg", "ekg", "blood pressure", "heart rate",
      "lab results", "blood test", "medication", "dosage",
      "biopsy", "endoscopy", "colonoscopy", "arthroscopy",
      "infusion", "injection", "catheter", "drainage",
      "wound care", "suture", "sutures", "bandage",
      "bleeding", "transfusion", "discharge", "admission",
      "informed consent", "complication", "post-operative", "pre-operative",
      "on call", "night shift", "weekend duty",
      "handover", "ward round", "case conference",
      "oncology", "orthopedics", "neurology", "cardiology",
      "gynecology", "pediatrics", "vascular", "thoracic",
      "intensive care", "palliative",
      "antibiotics", "antibiotic", "iv", "drip",
      "discharge letter", "referral", "medical report",
      // Medikamente & Verordnungen
      "tabletten", "kapsel", "kapseln", "tropfen", "salbe", "creme",
      "zäpfchen", "inhalator", "spray", "pflaster medizin",
      "blutabnahme", "blutabnehmen", "laborabnahme",
      "krankmeldung", "arbeitsunfähigkeitsbescheinigung",
      "befundbrief", "laborergebnis", "laborbericht",
      "überweisung arzt", "einweisung klinik",
      "rezept", "verschreibung",
      // ── Español ───────────────────────────────────────────────────────
      "anamnesis", "historia clínica",
      "paciente", "cirugía", "quirúrgico", "operación", "anestesia",
      "visita", "ronda", "diagnóstico", "diagnosticar",
      "clínica", "hospital", "urgencias", "ambulatorio",
      "radiología", "ecografía", "radiografía", "resonancia", "tomografía",
      "electrocardiograma", "presión arterial",
      "análisis", "resultado", "medicación", "dosis",
      "biopsia", "endoscopia", "colonoscopia",
      "infusión", "inyección", "catéter", "drenaje",
      "cura", "sutura", "vendaje",
      "hemorragia", "transfusión", "alta", "ingreso",
      "consentimiento", "complicación", "postoperatorio",
      "guardia", "turno de noche", "guardia de fin de semana",
      "antibiótico", "antibióticos",
      "oncología", "ortopedia", "neurología", "cardiología",
    ],
  },
  {
    key: "technologie",
    label: "Technologie",
    color: "#5E5CE6",
    keywords: [
      // Deutsch
      "programmieren", "coden", "entwickeln", "entwicklung",
      "software", "anwendung", "webseite", "webapp",
      "bug", "fehler beheben", "debugging", "testen", "testen",
      "feature", "funktion", "implementieren",
      "deployment", "release", "launch", "rollout",
      "server", "konfigurieren", "infrastruktur",
      "datenbank", "datenmigration", "migration",
      "schnittstelle", "integration",
      "repository", "branch", "commit", "merge", "review",
      "sprint", "backlog", "ticket", "iteratio",
      "dokumentation", "technische docs",
      "refactoring", "optimierung", "performance",
      "security", "sicherheit", "authentifizierung",
      "cloud", "hosting", "domain",
      "machine learning", "künstliche intelligenz",
      "monitoring", "logging", "alerts",
      "frontend", "backend", "fullstack",
      // English
      "programming", "coding", "developing", "development",
      "software", "application", "website", "webapp",
      "bug fix", "debugging", "testing", "unit test",
      "feature", "implement", "build",
      "deploy", "deployment", "release", "launch",
      "server", "configure", "infrastructure",
      "database", "data migration",
      "api", "integration", "endpoint",
      "repository", "pull request", "commit", "merge",
      "sprint", "backlog", "ticket", "iteration",
      "documentation", "technical docs",
      "refactor", "optimize", "performance",
      "security", "authentication", "authorization",
      "cloud", "hosting", "domain",
      "machine learning", "artificial intelligence",
      "monitoring", "logging", "alerts",
      "code review", "pull request", "merge request",
      "unit test", "integration test", "e2e test",
      "ci/cd", "pipeline", "automation",
      "tech debt", "architecture", "system design",
      "database schema", "data model",
      "ui design", "ux design", "wireframe", "mockup", "prototype",
      "accessibility", "localization",
      "load testing", "stress test",
      "backup", "restore", "disaster recovery",
      "seo", "analytics", "tracking",
      "a/b test", "feature flag",
      "onboarding technical", "runbook",
      "frontend", "backend", "fullstack",
      "react", "typescript", "python", "javascript", "node",
      "vue", "angular", "svelte", "nextjs", "nuxt", "remix",
      "java", "kotlin", "swift", "rust", "golang", "ruby", "php", "scala",
      "django", "fastapi", "express", "springboot", "laravel",
      "mysql", "postgres", "postgresql", "mongodb", "redis", "elasticsearch",
      "firebase", "supabase", "vercel", "netlify",
      "aws", "azure", "gcp",
      "terraform", "ansible", "jenkins", "circleci",
      "figma", "sketch", "zeplin", "storybook",
      "postman", "swagger", "graphql", "rest",
      "linux", "bash", "shell", "terminal",
      "npm", "yarn", "pip", "cargo", "gradle", "maven",
      "html", "css", "sass", "webpack", "vite",
      // short exact-token tech abbreviations
      "sdk", "cli", "sql", "ssl", "vpn",
      "docker", "kubernetes", "devops",
      "github", "gitlab", "jira", "confluence",
      // Español
      "programar", "codificar", "desarrollar", "desarrollo",
      "software", "aplicación", "sitio web",
      "error", "depurar", "probar", "prueba",
      "funcionalidad", "implementar",
      "despliegue", "lanzamiento",
      "servidor", "configurar", "infraestructura",
      "base de datos", "migración de datos",
      "integración", "punto de conexión",
      "repositorio", "solicitud de extracción",
      "iteración", "sprint", "tarea",
      "documentación técnica",
      "refactorizar", "optimizar",
      "seguridad", "autenticación",
      "nube", "alojamiento",
      "inteligencia artificial", "aprendizaje automático",
    ],
  },
  {
    key: "vertrieb",
    label: "Vertrieb & Sales",
    color: "#0A84FF",
    keywords: [
      // Deutsch
      "meeting", "besprechung", "konferenz", "call", "telefonkonferenz",
      "email schreiben", "email senden", "bericht schreiben", "protokoll",
      "präsentation vorbereiten", "vortrag", "agenda",
      "verkaufen", "verkauf", "vertrieb",
      "akquise", "kaltakquise", "neukundengewinnung",
      "angebot erstellen", "angebotserstellung", "angebot senden",
      "pitch", "präsentation halten", "demo",
      "lead", "leads", "interessent",
      "pipeline", "verkaufspipeline",
      "deal", "abschluss", "vertragsabschluss",
      "umsatz", "umsatzziel", "quartalsziel", "jahresziel",
      "messe", "fachmesse", "networking event",
      "follow-up", "nachfassen",
      "verhandlung", "verhandeln", "rabatt",
      "provision", "vergütung",
      "partnerschaft", "kooperation", "b2b",
      "lizenz", "lizenzvertrag",
      "crm", "kundendaten",
      "onboarding kunde", "kundenbetreuung",
      "upselling", "cross-selling",
      // English
      "selling", "sales", "revenue",
      "prospecting", "cold call", "cold calling",
      "proposal", "quote", "offer",
      "pitch", "demo", "presentation",
      "lead", "leads", "prospect",
      "pipeline",
      "deal", "close", "closing",
      "target", "quota", "forecast",
      "trade show", "networking",
      "follow up",
      "negotiation", "negotiate", "discount",
      "commission",
      "partnership", "cooperation",
      "license",
      "upsell", "cross-sell",
      "onboarding",
      // Español
      "vender", "ventas", "comercial",
      "prospección", "llamada en frío",
      "propuesta", "presupuesto", "oferta",
      "presentación", "demo",
      "cliente potencial", "prospecto",
      "tubería de ventas",
      "cierre", "negociación",
      "objetivo", "cuota",
      "feria", "exposición",
      "seguimiento",
      "descuento", "rebaja",
      "comisión",
      "asociación", "colaboración",
      "licencia",
    ],
  },
  {
    key: "natur",
    label: "Natur & Umwelt",
    color: "#32D74B",
    keywords: [
      // Deutsch
      "naturschutz", "naturschutzprojekt",
      "umweltschutz", "umweltprojekt", "umweltarbeit",
      "biodiversität", "artenvielfalt", "artenschutz",
      "ökosystem", "ökologie", "ökologisch",
      "klimaschutz", "klimawandel", "klimaprojekt",
      "nachhaltigkeit", "nachhaltig", "nachhaltigkeitsbericht",
      "renaturierung", "revitalisierung",
      "aufforstung", "bepflanzung", "baumpflanzung",
      "fauna", "flora", "habitat",
      "wildtier", "wildtiermonitoring",
      "biotop", "schutzgebiet", "naturreservat", "nationalpark",
      "feldarbeit", "freilandarbeit", "geländearbeit",
      "monitoring natur", "naturbeobachtung",
      "erosion", "bodenqualität", "wasserqualität",
      "solar", "windenergie", "erneuerbare energie", "photovoltaik",
      "emissionen", "treibhausgas",
      "umweltbericht", "umweltaudit",
      // English
      "nature conservation", "conservation project",
      "environmental protection", "environmental project",
      "biodiversity", "species protection",
      "ecosystem", "ecology", "ecological",
      "climate protection", "climate change", "climate project",
      "sustainability", "sustainable", "sustainability report",
      "rewilding", "restoration",
      "reforestation", "afforestation", "tree planting",
      "fauna", "flora", "habitat",
      "wildlife", "wildlife monitoring",
      "nature reserve", "national park", "protected area",
      "fieldwork", "field survey",
      "nature monitoring",
      "erosion", "soil quality", "water quality",
      "solar energy", "wind energy", "renewable energy",
      "emissions", "greenhouse gas",
      "environmental report", "environmental audit",
      // Español
      "conservación de la naturaleza", "proyecto de conservación",
      "protección ambiental", "proyecto ambiental",
      "biodiversidad", "protección de especies",
      "ecosistema", "ecología", "ecológico",
      "protección climática", "cambio climático",
      "sostenibilidad", "sostenible",
      "renaturalización", "restauración",
      "reforestación", "plantación de árboles",
      "fauna", "flora", "hábitat",
      "vida silvestre", "monitoreo de fauna",
      "reserva natural", "parque nacional",
      "trabajo de campo",
      "energía solar", "energía eólica", "energía renovable",
      "emisiones", "gases de efecto invernadero",
    ],
  },
  {
    key: "freizeit",
    label: "Freizeit",
    color: "#64D2FF",
    keywords: [
      // Deutsch
      "konzert", "konzertticket",
      "kino", "film schauen",
      "theater", "oper", "musical", "ausstellung", "museum",
      "restaurant", "essen gehen", "reservierung restaurant",
      "freunde treffen", "freunde einladen",
      "party", "feier", "feiern",
      "fußball", "basketball", "tennis", "volleyball", "schwimmen",
      "radfahren", "fahrrad", "mountainbike",
      "wandern", "trekking", "klettern",
      "laufen", "joggen", "marathon",
      "lesen", "buch", "bibliothek",
      "podcast hören", "musik hören",
      "serie", "netflix", "streaming",
      "urlaub planen", "reise buchen", "hotel buchen", "flug buchen",
      "ausflug planen",
      "hobby", "basteln", "zeichnen", "malen", "fotografieren",
      "musik", "instrument", "gitarre", "piano", "klavier",
      "kochen lernen", "rezept ausprobieren",
      "spieleabend", "gesellschaftsspiel",
      "spa", "wellness",
      // English
      "concert", "concert ticket",
      "cinema", "movie", "watch film",
      "theater", "opera", "musical", "exhibition",
      "restaurant", "dinner out", "reservation",
      "meet friends", "invite friends",
      "party", "celebration",
      "football", "soccer", "basketball", "tennis", "volleyball", "swimming",
      "cycling", "mountain bike", "bike",
      "hiking", "trekking", "climbing",
      "running", "jogging", "marathon",
      "reading", "book", "library",
      "podcast", "listen music",
      "series", "netflix", "streaming",
      "plan vacation", "book hotel", "book flight",
      "trip", "getaway",
      "hobby", "crafting", "drawing", "painting", "photography",
      "music", "guitar", "piano",
      "cooking class", "try recipe",
      "game night", "board game",
      "wellness", "massage",
      // Español
      "concierto", "entrada concierto",
      "cine", "película", "ver película",
      "teatro", "ópera", "musical", "exposición", "museo",
      "restaurante", "cenar fuera", "reservar restaurante",
      "quedar con amigos", "invitar amigos",
      "fiesta", "celebración",
      "fútbol", "baloncesto", "tenis", "natación",
      "ciclismo", "bicicleta",
      "senderismo", "trekking", "escalada",
      "correr", "jogging", "maratón",
      "leer", "libro", "biblioteca",
      "podcast", "escuchar música",
      "serie", "streaming",
      "planear vacaciones", "reservar hotel", "reservar vuelo",
      "excursión",
      "hobby", "manualidades", "dibujar", "pintar", "fotografía",
      "música", "guitarra", "piano",
      "clase de cocina", "probar receta",
      "juegos de mesa",
    ],
  },
  {
    key: "familie",
    label: "Familie",
    color: "#FF9F0A",
    keywords: [
      // Deutsch
      "kind", "kinder", "kind", "sohn", "tochter",
      "schule", "schulaufgabe", "hausaufgabe", "schulanmeldung",
      "kindergarten", "kita", "hort", "krippe",
      "babysitter", "kinderbetreuung",
      "elternabend", "elternsprechtag",
      "geburtstag", "geburtstagsfeier", "geburtstagsgeschenk",
      "kinderarzt", "kieferorthopäde", "kinderzahnarzt",
      "impfung kind",
      "spielplatz", "kinderkurs", "nachhilfe",
      "ferienbetreuung", "ferienprogramm",
      "familien ausflug", "familienurlaub",
      "oma", "opa", "großeltern", "eltern besuchen",
      "hochzeit", "taufe", "kommunion", "konfirmation",
      "spielzeug", "kinderzimmer",
      // Schule & Aktivitäten
      "zeugnis", "klassenarbeit", "prüfung", "klausur",
      "klassenfahrt", "schulausflug", "projekttag",
      "nachhilfe geben", "nachhilfe nehmen",
      "sportverein", "fußballtraining", "tanzstunde", "musikstunde",
      "kurs", "kursanmeldung",
      "schulbus", "fahrgemeinschaft",
      "schulranzen", "schulbedarf", "schulmaterial",
      "impfung", "vorsorgeuntersuchung kind",
      "betreuung", "ferienkurs",
      // English
      "child", "children", "kids", "son", "daughter",
      "school", "homework", "school enrollment",
      "kindergarten", "daycare", "nursery",
      "babysitter", "childcare",
      "parent meeting", "parent-teacher",
      "birthday", "birthday party", "birthday gift",
      "pediatrician",
      "vaccination", "immunization",
      "playground", "kids class", "tutoring",
      "summer camp", "holiday program",
      "family trip", "family vacation",
      "grandparents", "visit parents",
      "wedding", "baptism", "communion",
      "report card", "exam", "test", "quiz",
      "school trip", "field trip", "project day",
      "tutoring", "private lessons",
      "sports club", "football practice", "dance class", "music lesson",
      "class", "enrollment", "registration",
      "school supplies", "backpack", "stationery",
      "checkup", "pediatric checkup",
      "after school care",
      // Español
      "niño", "niños", "hijo", "hija",
      "colegio", "tarea", "deberes", "matrícula",
      "guardería", "jardín de infancia",
      "canguro", "cuidado de niños",
      "reunión de padres", "tutoría",
      "cumpleaños", "fiesta de cumpleaños", "regalo cumpleaños",
      "pediatra",
      "vacunación",
      "parque infantil", "clase niños", "clases particulares",
      "campamento", "programa vacacional",
      "excursión familiar", "vacaciones en familia",
      "abuelos", "visitar padres",
      "boda", "bautizo", "comunión",
      "boletín", "nota", "examen", "prueba",
      "excursión escolar", "salida escolar",
      "clases particulares", "academia",
      "club deportivo", "entrenamiento fútbol", "clase de baile", "clase de música",
      "material escolar", "mochila", "papelería",
      "revisión pediátrica", "control del niño",
    ],
  },
  {
    key: "gesundheit",
    label: "Gesundheit",
    color: "#FF2D55",
    keywords: [
      // Deutsch – persönliche Gesundheit
      "arzt", "ärztin", "arzttermin", "hausarzt",
      "zahnarzt", "zahnarzttermin",
      "physiotherapie", "physio termin",
      "apotheke", "medikament abholen", "rezept einlösen",
      "bluttest", "blutuntersuchung", "check-up",
      "impfung", "impftermin",
      "psychologe", "therapie", "beratung",
      "yoga", "meditieren", "entspannen",
      "fitnessstudio", "trainieren", "trainingsplan",
      "abnehmen", "gewicht", "ernährung",
      "brille", "augenarzt",
      "operationen persönlich", "krankenversicherung",
      // Medikamente & Selbstfürsorge
      "medikamente", "tabletten holen", "pille", "antibiotika",
      "vitamine", "vitamin d", "vitamin c", "magnesium", "zink", "omega",
      "nahrungsergänzung", "supplement", "probiotika",
      "rezept holen", "rezept einlösen",
      "blutabnahme", "urintest",
      "massage", "chiropraktiker", "osteopath", "akupunktur",
      "krankmeldung", "krank",
      "schmerzmittel", "ibuprofen", "paracetamol",
      "krankenkasse", "krankenversicherung",
      // Mental health
      "psychotherapie", "psychiater", "coaching",
      "meditation", "achtsamkeit", "burnout",
      "schlaf", "schlafroutine",
      // English
      "doctor", "doctor appointment", "gp",
      "dentist", "dental appointment",
      "physiotherapy", "physio",
      "pharmacy", "pick up medication", "prescription",
      "blood test", "check-up", "health screening",
      "vaccination appointment",
      "psychologist", "therapy", "counseling",
      "yoga", "meditate", "relax",
      "gym", "workout", "training plan",
      "lose weight", "nutrition", "diet",
      "optician", "eye test",
      "medication", "prescription", "pick up prescription",
      "vitamins", "supplements", "probiotics", "omega 3",
      "massage", "chiropractor", "osteopath", "acupuncture",
      "sick note", "sick leave",
      "pain relief", "painkiller",
      "psychotherapy", "psychiatrist", "coaching",
      "meditation", "mindfulness",
      "sleep", "sleep routine",
      "health insurance",
      // Español
      "médico", "cita médica", "médico de cabecera",
      "dentista", "cita dentista",
      "fisioterapia", "fisio",
      "farmacia", "recoger medicamentos", "receta",
      "análisis de sangre", "revisión médica",
      "cita vacunación",
      "psicólogo", "terapia",
      "yoga", "meditar", "relajarse",
      "gimnasio", "entrenar", "plan de entrenamiento",
      "perder peso", "nutrición", "dieta",
      "óptica", "revisión vista",
      "medicamentos", "pastillas", "antibióticos",
      "vitaminas", "suplementos", "probióticos",
      "masaje", "quiropráctico", "osteopatía", "acupuntura",
      "baja médica", "baja por enfermedad",
      "analgésico",
      "psicoterapia", "psiquiatra", "coaching",
      "meditación", "mindfulness",
      "sueño", "rutina de sueño",
    ],
  },
  {
    key: "finanzen",
    label: "Finanzen",
    color: "#BF5AF2",
    keywords: [
      // Deutsch
      "rechnung bezahlen", "rechnung überweisen",
      "steuer", "steuererklärung", "steuern",
      "versicherung", "versicherungsvertrag",
      "bank", "bankkonto", "konto", "sparkonto",
      "überweisung", "dauerauftrag",
      "kredit", "darlehen", "hypothek",
      "budget", "haushaltsbuch", "ausgaben",
      "miete", "miete überweisen",
      "strom", "gasrechnung", "internetrechnung",
      "sparplan", "investition", "aktien", "fonds",
      "rente", "altersvorsorge", "pension",
      "gehaltsabrechnung", "gehalt",
      "finanzplan", "finanzberatung",
      "kreditkarte", "lastschrift",
      "auto versicherung", "haftpflicht",
      "finanzen",
      // English
      "pay bill", "pay invoice", "bank transfer",
      "tax", "tax return", "taxes",
      "insurance", "insurance contract",
      "bank", "bank account", "savings account",
      "transfer", "standing order",
      "loan", "mortgage",
      "budget", "expenses",
      "rent", "rent payment",
      "electricity bill", "gas bill", "internet bill",
      "savings plan", "investment", "stocks", "funds",
      "pension", "retirement",
      "payroll", "salary",
      "financial planning", "financial advice",
      "credit card",
      "car insurance", "liability insurance",
      "finances",
      // Español
      "pagar factura", "transferencia bancaria",
      "impuesto", "declaración de impuestos",
      "seguro", "contrato de seguro",
      "banco", "cuenta bancaria", "cuenta de ahorro",
      "transferencia", "domiciliación",
      "préstamo", "hipoteca",
      "presupuesto", "gastos",
      "alquiler", "pagar alquiler",
      "factura luz", "factura gas", "factura internet",
      "plan de ahorro", "inversión", "acciones",
      "jubilación", "pensión",
      "nómina", "salario",
      "planificación financiera",
      "tarjeta de crédito",
      "seguro de coche",
      "finanzas",
    ],
  },
  {
    key: "haushalt",
    label: "Haushalt",
    color: "#30D158",
    keywords: [
      // Deutsch – Reinigung & Ordnung
      "putzen", "reinigen", "saubermachen",
      "waschen", "wäsche",
      "kochen", "essen kochen", "mahlzeit", "abendessen",
      "bügeln",
      "aufräumen", "sortieren", "entrümpeln",
      "staubsaugen", "saugen", "kehren", "wischen",
      "müll rausbringen", "müll", "abfall", "recycling",
      "küche putzen", "bad putzen", "toilette putzen",
      "fenster putzen", "fenster",
      // Deutsch – Garten & Pflanzen
      "garten", "rasen mähen", "unkraut jäten",
      "pflanzen", "pflanzen gießen", "blumen gießen", "gießen", "bewässern",
      "umtopfen", "blumenerde", "dünger", "kompost",
      "balkon", "terrasse",
      // Deutsch – Einkauf & Besorgungen
      "einkaufen", "lebensmittel", "supermarkt",
      "post abholen", "pakete", "pakete abholen",
      "schlüssel", "schlüssel nachmachen",
      // Deutsch – Reparatur & Handwerker
      "reparieren", "reparatur",
      "handwerker", "handwerker bestellen", "handwerker anrufen",
      "installateur", "klempner", "sanitär", "rohre",
      "elektriker", "strom",
      "heizung", "heizung warten", "heizungsmonteur",
      "maler", "malerarbeiten",
      "tischler", "schreiner", "zimmermann",
      "dachdecker",
      "lampe", "glühbirne wechseln", "leuchtmittel",
      "keller", "dachboden",
      // Deutsch – Geräte
      "trockner", "waschmaschine",
      "geschirrspüler", "spülmaschine",
      "kühlschrank", "herd", "mikrowelle", "backofen",
      "umzug", "einrichten", "möbel",
      // English
      "cleaning", "clean the house", "tidy up",
      "laundry", "washing",
      "cooking", "meal prep", "dinner",
      "ironing",
      "tidying", "declutter", "sorting",
      "vacuuming", "vacuum", "sweep", "mop",
      "take out trash", "garbage", "recycling",
      "clean kitchen", "clean bathroom",
      "clean windows",
      "garden", "mow lawn", "weeding",
      "water plants", "water the plants", "watering",
      "repot", "potting soil", "fertilizer",
      "balcony", "terrace", "patio",
      "grocery shopping", "groceries", "supermarket",
      "collect mail", "packages", "parcel",
      "keys", "spare key",
      "repair", "fix",
      "handyman", "plumber", "electrician", "installer",
      "heating", "boiler", "pipes",
      "painter", "carpenter",
      "lightbulb", "change lightbulb",
      "basement", "attic",
      "dishwasher", "washing machine", "dryer",
      "fridge", "oven",
      "moving", "furnishing", "furniture",
      // Español
      "limpiar", "limpiar la casa", "ordenar",
      "lavar ropa", "lavadora",
      "cocinar", "preparar comida", "cena",
      "planchar",
      "recoger", "clasificar",
      "aspirar", "barrer", "fregar suelo",
      "sacar basura", "basura", "reciclaje",
      "limpiar cocina", "limpiar baño",
      "limpiar ventanas",
      "jardín", "cortar césped", "quitar hierbas",
      "regar plantas", "regar", "regar las plantas",
      "trasplantar", "tierra para macetas", "fertilizante", "abono",
      "balcón", "terraza",
      "hacer la compra", "compra", "supermercado",
      "recoger correo", "paquetes",
      "llaves", "copia de llave",
      "reparar", "arreglar",
      "fontanero", "electricista", "instalador",
      "calefacción", "calderas", "tuberías",
      "pintor",
      "carpintero",
      "bombilla", "cambiar bombilla",
      "sótano", "trastero",
      "lavavajillas", "lavadora", "secadora",
      "nevera", "horno",
      "mudanza", "muebles",
    ],
  },
  {
    key: "sonstiges",
    label: "Sonstiges",
    color: "#636366",
    keywords: [],
  },
] as const;

export type TodoCategoryKey = (typeof TODO_CATEGORIES)[number]["key"];

// ── Auto-categorize ────────────────────────────────────────────────────────

// Priority: most specific professional terms first, broad household last.
const CATEGORIZATION_PRIORITY = [
  "medizin", "technologie", "vertrieb", "natur",
  "freizeit", "familie", "gesundheit", "finanzen", "haushalt",
] as const;

export function categorizeTodoItem(title: string): string {
  const lower = title.toLowerCase().trim();
  const tokens = lower.split(/[\s\-\/,;]+/).filter(Boolean);

  for (const key of CATEGORIZATION_PRIORITY) {
    const cat = TODO_CATEGORIES.find((c) => c.key === key);
    if (!cat) continue;
    if (
      (cat.keywords as readonly string[]).some((kw) => {
        if (kw.length <= 4) return tokens.includes(kw);
        return lower.includes(kw);
      })
    )
      return cat.key;
  }
  return "sonstiges";
}

// ── Storage ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "nanoclaw-todos";

export function loadTodoItems(): TodoItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TodoItem[]) : [];
  } catch {
    return [];
  }
}

export function saveTodoItems(items: TodoItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ── Icons ──────────────────────────────────────────────────────────────────

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

function shade(hex: string, pct: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v + Math.round((255 * pct) / 100)));
  return `rgb(${clamp((n >> 16) & 0xff)},${clamp((n >> 8) & 0xff)},${clamp(n & 0xff)})`;
}

// ── View state ─────────────────────────────────────────────────────────────

export interface TodoViewState {
  items: TodoItem[];
  members: FamilyMember[];
  activeMemberId: string;
}

// ── Render ─────────────────────────────────────────────────────────────────

export function renderTodoView(viewState: TodoViewState): string {
  const { items, members, activeMemberId } = viewState;
  const open = items.filter((i) => !i.completed);
  const done = items.filter((i) => i.completed);

  // Member filter strip
  const memberChips = [
    `<button class="todo-member-chip${!activeMemberId ? " todo-member-chip--active" : ""}" data-action="todo-filter" data-member-id="">
      <span class="todo-member-chip__label">Alle</span>
    </button>`,
    ...members.map((m) => {
      const grad = `linear-gradient(135deg,${m.color} 0%,${shade(m.color, -30)} 100%)`;
      const active = m.id === activeMemberId;
      return `<button class="todo-member-chip${active ? " todo-member-chip--active" : ""}" data-action="todo-filter" data-member-id="${m.id}" style="${active ? `--chip-accent:${m.color};` : ""}">
        <span class="todo-member-chip__avatar" style="background:${grad};">${m.initial}</span>
        <span class="todo-member-chip__label">${m.name}</span>
      </button>`;
    }),
  ].join("");

  const groups = TODO_CATEGORIES.map((cat) => ({
    cat,
    items: open.filter((i) => i.category === cat.key),
  })).filter((g) => g.items.length > 0);

  let bodyHtml = "";

  for (const { cat, items: groupItems } of groups) {
    const rows = groupItems
      .map((item) => {
        const member = members.find((m) => m.id === item.memberId);
        const avatarHtml = member
          ? `<span class="list-item__member-dot" style="background:${member.color};"></span>`
          : "";
        return `
        <button class="list-item" data-action="complete-todo" data-id="${item.id}">
          <span class="list-item__check"></span>
          <span class="list-item__name">${escHtml(item.title)}</span>
          ${avatarHtml}
        </button>`;
      })
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
        <button class="list-item list-item--checked" data-action="complete-todo" data-id="${item.id}">
          <span class="list-item__check list-item__check--done">${ICONS.check}</span>
          <span class="list-item__name">${escHtml(item.title)}</span>
        </button>`
      )
      .join("");
    bodyHtml += `
      <div class="category-group category-group--done">
        <div class="category-header">
          <span class="category-label category-label--muted">Erledigt (${done.length})</span>
          <button class="category-clear" data-action="clear-done-todos">Löschen</button>
        </div>
        <div class="list-items">${rows}</div>
      </div>`;
  }

  if (!bodyHtml) {
    const hint = activeMemberId
      ? "Aufgabe oben hinzufügen"
      : "Person auswählen oder Aufgabe hinzufügen";
    bodyHtml = `<div class="list-empty">
      <div class="list-empty__icon">${ICONS.todo}</div>
      <p class="list-empty__text">Keine Aufgaben</p>
      <p class="list-empty__hint">${hint}</p>
    </div>`;
  }

  const totalOpen = open.length;

  return `
    <header class="header list-header">
      <h1 class="header__title">To-Do${totalOpen > 0 ? ` <span class="header__badge">${totalOpen}</span>` : ""}</h1>
    </header>
    <div class="todo-member-filter">${memberChips}</div>
    <div class="list-add">
      <input class="list-add__input" id="list-input" placeholder="Aufgabe hinzufügen…" autocomplete="off" autocorrect="on" />
      <button class="list-add__btn" data-action="add-todo">${ICONS.plus}</button>
    </div>
    <div class="list-body">${bodyHtml}</div>
    ${tabBar("todo")}
  `;
}
