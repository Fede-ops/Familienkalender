// Mehrsprachiger Schnell-Parser (DE / EN / ES): wandelt gesprochenen/getippten
// Text wie "Zahnarzt Dienstag um 15 Uhr", "dentist tomorrow at 3pm" oder
// "médico el lunes a las 4 de la tarde" in Titel + Start/Ende + ganztägig um.
// Bewusst tolerant — das Ergebnis füllt nur den Termin-Dialog vor, der User
// bestätigt/korrigiert danach.

export interface ParsedEvent {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
}

const WEEKDAYS: Record<string, number> = {
  // DE
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonnabend: 6,
  // EN
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
  // ES
  domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3, jueves: 4, viernes: 5, sábado: 6, sabado: 6,
};

const MONTHS: Record<string, number> = {
  // DE
  januar: 0, jänner: 0, jaenner: 0, februar: 1, märz: 2, maerz: 2, april: 3, mai: 4, juni: 5, juli: 6,
  august: 7, september: 8, oktober: 9, november: 10, dezember: 11,
  // EN
  january: 0, february: 1, march: 2, may: 4, june: 5, july: 6, october: 9, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  // ES
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7,
  septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

// Unicode-korrekte Wortgrenzen: JS-\b zählt Umlaute/Akzente (ü, ä, ñ, í) als
// Nicht-Buchstaben, daher würde \bübermorgen\b nie matchen. Lookarounds mit
// \p{L} (erfordert u-Flag) behandeln sie richtig.
const LB = "(?<![\\p{L}\\p{N}_])";
const RB = "(?![\\p{L}\\p{N}_])";
const rx = (body: string): RegExp => new RegExp(LB + body + RB, "iu");

// Optionaler Zeit-Präfix in allen Sprachen: "um" / "at" / "a las" / "a la".
const TP = "(?:um\\s+|at\\s+|a\\s+las?\\s+)?";

export function parseQuickEvent(input: string, now: Date = new Date()): ParsedEvent | null {
  if (!input.trim()) return null;
  let text = ` ${input.trim()} `;

  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      text = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`;
    }
    return m;
  };

  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;
  let dayOffset: number | null = null;
  let hour: number | null = null;
  let minute = 0;
  let daypart: "am" | "pm" | null = null;
  let ampmExplicit = false;
  let durationMin: number | null = null;
  let m: RegExpMatchArray | null;

  // ── Tageszeit (früh, damit sie die Uhrzeit-Heuristik steuert) ─────────────
  if (take(rx("(morgens|vormittags|früh|in the morning|this morning|morning|de la mañana|por la mañana)"))) {
    daypart = "am";
  } else if (take(rx("(nachmittags|abends|nachts|am abend|am nachmittag|in the afternoon|in the evening|this afternoon|this evening|at night|tonight|afternoon|evening|night|de la tarde|de la noche|por la tarde|por la noche)"))) {
    daypart = "pm";
  } else if (take(rx("(mittags|zu mittag|noon|midday|at noon|mediodía|mediodia|al mediodía|al mediodia)"))) {
    hour = 12; daypart = "pm";
  }

  // ── Dauer ─────────────────────────────────────────────────────────────────
  if ((m = take(rx("(?:für|for|durante)\\s+(\\d+)\\s*(stunden?|std|hours?|hrs?|horas?|h)"))) ||
      (m = take(rx("(\\d+)\\s*(stunden?|std|hours?|hrs?|horas?)\\s*(lang|long)?")))) {
    durationMin = parseInt(m[1], 10) * 60;
  } else if ((m = take(rx("(?:für|for|durante)\\s+(\\d+)\\s*(minuten?|minutes?|mins?|minutos?|min)"))) ||
             (m = take(rx("(\\d+)\\s*(minuten?|minutes?|mins?|minutos?)\\s*(lang|long)?")))) {
    durationMin = parseInt(m[1], 10);
  } else if (take(rx("(eine\\s+)?halbe?\\s+stunde|half\\s+an\\s+hour|media\\s+hora"))) {
    durationMin = 30;
  } else if (take(rx("eine?\\s+stunde|an\\s+hour|one\\s+hour|una\\s+hora"))) {
    durationMin = 60;
  }

  // ── Datum: dd.mm(.yyyy) bzw. dd/mm ─────────────────────────────────────────
  if ((m = take(new RegExp(`${LB}(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{4}|\\d{2}))?`, "iu")))) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    // Tag-zuerst (europäisch) als Default; per Wertebereich korrigieren.
    if (a > 12 && b <= 12) { day = a; month = b - 1; }
    else if (b > 12 && a <= 12) { month = a - 1; day = b; }
    else { day = a; month = b - 1; }
    if (m[3]) year = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
  }

  // ── Datum mit Monatsnamen: "15. März" / "15 de marzo" / "March 15" ────────
  if (day === null) {
    const mn = Object.keys(MONTHS).join("|");
    if ((m = take(rx(`(\\d{1,2})(?:st|nd|rd|th|º|\\.)?\\s*(?:de\\s+|of\\s+)?(${mn})`)))) {
      day = parseInt(m[1], 10); month = MONTHS[m[2].toLowerCase()];
    } else if ((m = take(rx(`(${mn})\\s+(\\d{1,2})(?:st|nd|rd|th)?`)))) {
      month = MONTHS[m[1].toLowerCase()]; day = parseInt(m[2], 10);
    }
  }

  // ── Relative Tage ─────────────────────────────────────────────────────────
  if (day === null && dayOffset === null) {
    if (take(rx("übermorgen|day after tomorrow|pasado\\s+mañana"))) dayOffset = 2;
    else if (take(rx("morgen|tomorrow|mañana"))) dayOffset = 1;
    else if (take(rx("heute|today|hoy"))) dayOffset = 0;
  }

  // ── Wochentag ─────────────────────────────────────────────────────────────
  if (day === null && dayOffset === null) {
    const wd = Object.keys(WEEKDAYS).join("|");
    if ((m = take(rx(`(am\\s+|n[äa]chsten\\s+|kommenden\\s+|diesen\\s+|on\\s+|next\\s+|this\\s+|el\\s+|próximo\\s+|proximo\\s+)?(${wd})`)))) {
      const target = WEEKDAYS[m[2].toLowerCase()];
      const forceNext = /n[äa]chsten|kommenden|next|próximo|proximo/i.test(m[1] ?? "");
      if (forceNext) {
        // "nächsten X" = X in der NÄCHSTEN Kalenderwoche (Mo–So), nicht der
        // schon kommende Tag dieser Woche.
        let toNextMonday = (1 - now.getDay() + 7) % 7;   // Tage bis kommenden Montag
        if (toNextMonday === 0) toNextMonday = 7;         // heute Montag → nächster Montag
        const offFromMon = target === 0 ? 6 : target - 1; // Mo=0 … So=6
        dayOffset = toNextMonday + offFromMon;
      } else {
        dayOffset = (target - now.getDay() + 7) % 7;      // kommender (evtl. heute)
      }
    }
  }

  // ── Uhrzeit mit am/pm-Suffix: "3pm", "3:30 pm" ────────────────────────────
  if (hour === null && (m = take(new RegExp(`${LB}${TP}(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)${RB}`, "iu")))) {
    hour = parseInt(m[1], 10);
    if (m[2]) minute = parseInt(m[2], 10);
    const pm = /p/i.test(m[3]);
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
    ampmExplicit = true;
  }

  // ── Uhrzeit: HH:MM ────────────────────────────────────────────────────────
  if (hour === null && (m = take(rx(`${TP}(\\d{1,2}):(\\d{2})`)))) {
    hour = parseInt(m[1], 10); minute = parseInt(m[2], 10);
  }

  // ── Uhrzeit: "15 Uhr" / "3 o'clock" / "9 Uhr 30" ──────────────────────────
  if (hour === null && (m = take(rx(`${TP}(\\d{1,2})\\s*(?:uhr|o'?clock)(?:\\s*(\\d{1,2}))?`)))) {
    hour = parseInt(m[1], 10);
    if (m[2]) minute = parseInt(m[2], 10);
  }

  // ── Bruch-Zeiten DE (österreichisch + deutsch) ────────────────────────────
  if (hour === null && (m = take(rx("dreiviertel\\s+(\\d{1,2})")))) { hour = +m[1] - 1; minute = 45; }
  if (hour === null && (m = take(rx("viertel\\s+vor\\s+(\\d{1,2})")))) { hour = +m[1] - 1; minute = 45; }
  if (hour === null && (m = take(rx("viertel\\s+nach\\s+(\\d{1,2})")))) { hour = +m[1]; minute = 15; }
  if (hour === null && (m = take(rx("viertel\\s+(\\d{1,2})")))) { hour = +m[1] - 1; minute = 15; }
  if (hour === null && (m = take(rx("halb\\s+(\\d{1,2})")))) { hour = +m[1] - 1; minute = 30; }

  // ── Bruch-Zeiten EN ───────────────────────────────────────────────────────
  if (hour === null && (m = take(rx("half\\s+past\\s+(\\d{1,2})")))) { hour = +m[1]; minute = 30; }
  if (hour === null && (m = take(rx("quarter\\s+past\\s+(\\d{1,2})")))) { hour = +m[1]; minute = 15; }
  if (hour === null && (m = take(rx("quarter\\s+to\\s+(\\d{1,2})")))) { hour = +m[1] - 1; minute = 45; }

  // ── Bruch-Zeiten ES ───────────────────────────────────────────────────────
  if (hour === null && (m = take(rx(`${TP}(\\d{1,2})\\s+y\\s+media`)))) { hour = +m[1]; minute = 30; }
  if (hour === null && (m = take(rx(`${TP}(\\d{1,2})\\s+y\\s+cuarto`)))) { hour = +m[1]; minute = 15; }
  if (hour === null && (m = take(rx(`${TP}(\\d{1,2})\\s+menos\\s+cuarto`)))) { hour = +m[1] - 1; minute = 45; }

  // ── Uhrzeit: bloßes "um/at/a las 9" ───────────────────────────────────────
  if (hour === null && (m = take(rx("(?:um|at|a\\s+las?)\\s+(\\d{1,2})")))) {
    hour = parseInt(m[1], 10);
  }

  // ── Uhrzeit normalisieren ─────────────────────────────────────────────────
  if (hour !== null) {
    if (hour < 0) hour += 24;
    if (!ampmExplicit) {
      if (daypart === "pm" && hour < 12) hour += 12;
      else if (daypart === "am" && hour === 12) hour = 0;
      else if (daypart === null && hour >= 1 && hour <= 6) hour += 12; // Familienalltag: 1–6 = nachmittags
    }
    hour = ((hour % 24) + 24) % 24;
    if (minute > 59) minute = 59;
  }

  // ── Start-Datum ────────────────────────────────────────────────────────────
  const start = new Date(now);
  start.setSeconds(0, 0);
  if (day !== null) {
    if (month !== null) start.setMonth(month);
    start.setDate(day);
    if (year !== null) start.setFullYear(year);
    else if (start.getTime() < now.getTime() - 86_400_000) start.setFullYear(start.getFullYear() + 1);
  } else if (dayOffset !== null) {
    start.setDate(start.getDate() + dayOffset);
  }

  const hasDate = day !== null || dayOffset !== null;
  const hasTime = hour !== null;
  const allDay = hasDate && !hasTime;

  if (hasTime) {
    start.setHours(hour!, minute, 0, 0);
    if (!hasDate && start.getTime() < now.getTime()) start.setDate(start.getDate() + 1);
  } else if (allDay) {
    start.setHours(0, 0, 0, 0);
  } else {
    start.setMinutes(0, 0, 0);
    start.setHours(now.getHours() + 1);
  }

  const end = allDay
    ? new Date(start.getTime() + 86_400_000)
    : new Date(start.getTime() + (durationMin ?? 60) * 60_000);

  // ── Titel säubern ─────────────────────────────────────────────────────────
  let title = text
    .replace(new RegExp(`${LB}(um|am|für|lang|von|bis|at|on|for|of|long)${RB}`, "giu"), " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s,;.\-–]+/, "")
    .replace(/[\s,;.\-–]+$/, "")
    .trim();
  if (title) title = title.charAt(0).toUpperCase() + title.slice(1);

  return { title, start, end, allDay };
}
