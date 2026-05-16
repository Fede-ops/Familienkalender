import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const view = process.argv[2] ?? "week";

const DAY_NAMES_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WEEKDAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_NAMES_DE_FULL = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const MONTH_NAMES_DE_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

const MEMBERS = [
  { id: "calendar.fede", initial: "F", color: "#0A84FF" },
  { id: "calendar.pita", initial: "P", color: "#30D158" },
  { id: "calendar.bebos", initial: "B", color: "#FF9F0A" },
  { id: "calendar.fede_trabajo", initial: "T", color: "#BF5AF2" },
];

const today = new Date();

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, days) {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const weekStart = startOfWeek(today);

function dayAt(offset, h, m) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + offset);
  d.setHours(h, m, 0, 0);
  return d;
}

const EVENTS = [
  { summary: "Yoga", start: dayAt(0, 7, 0), end: dayAt(0, 8, 0), memberId: "calendar.fede", allDay: false },
  { summary: "Schule", start: dayAt(0, 8, 30), end: dayAt(0, 14, 0), memberId: "calendar.bebos", allDay: false },
  { summary: "Standup", start: dayAt(1, 9, 30), end: dayAt(1, 10, 0), memberId: "calendar.fede_trabajo", allDay: false },
  { summary: "Pilates", start: dayAt(1, 19, 0), end: dayAt(1, 20, 30), memberId: "calendar.pita", allDay: false },
  { summary: "Kundenmeeting", start: dayAt(2, 10, 0), end: dayAt(2, 11, 30), memberId: "calendar.fede_trabajo", allDay: false },
  { summary: "Bebos Geburtstag", start: dayAt(3, 0, 0), end: dayAt(4, 0, 0), memberId: "calendar.bebos", allDay: true },
  { summary: "Abendessen Familie", start: dayAt(4, 19, 30), end: dayAt(4, 21, 0), memberId: "calendar.pita", allDay: false },
  { summary: "Wandern", start: dayAt(5, 9, 0), end: dayAt(5, 16, 0), memberId: "calendar.fede", allDay: false },
];

function fmtTime(d) {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function hexToRgba(hex, alpha) {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderEvent(ev) {
  const m = MEMBERS.find((x) => x.id === ev.memberId);
  const accent = m?.color ?? "#8E8E93";
  const bg = hexToRgba(accent, 0.16);
  const timeLabel = ev.allDay ? "Ganztägig" : `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`;
  return `<div class="event" style="background:${bg};">
    <div class="event__bar" style="background:${accent};"></div>
    <div class="event__content">
      <span class="event__title">${ev.summary}</span>
      <span class="event__time">${timeLabel}</span>
    </div>
    <div class="event__avatar" style="background:${accent};">${m?.initial ?? "?"}</div>
  </div>`;
}

function toolbarBtn(icon, label) {
  return `<button class="toolbar__button"><span class="toolbar__icon">${icon}</span><span class="toolbar__label">${label}</span></button>`;
}

function renderWeekView() {
  function renderRow(date) {
    const evs = EVENTS.filter((e) => isSameDay(e.start, date));
    const isToday = isSameDay(date, today);
    const eventsHtml = evs.length ? evs.map(renderEvent).join("") : `<div class="event event--empty">Keine Termine</div>`;
    return `<div class="week-row">
      <div class="week-row__day ${isToday ? "week-row__day--today" : ""}">
        <span class="week-row__day-name">${DAY_NAMES_DE[date.getDay()]}</span>
        <span class="week-row__day-number">${date.getDate()}</span>
      </div>
      <div class="week-row__events">${eventsHtml}</div>
    </div>`;
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const rows = days.map(renderRow).join("");
  const end = addDays(weekStart, 6);
  const sm = MONTH_NAMES_DE_SHORT[weekStart.getMonth()];
  const em = MONTH_NAMES_DE_SHORT[end.getMonth()];
  const title = weekStart.getMonth() === end.getMonth()
    ? `${weekStart.getDate()}. – ${end.getDate()}. ${sm}`
    : `${weekStart.getDate()}. ${sm} – ${end.getDate()}. ${em}`;

  return `
    <header class="header">
      <button class="header__back">‹</button>
      <h1 class="header__title">${title}</h1>
    </header>
    <nav class="toolbar">
      ${toolbarBtn("‹", "Zurück")}
      ${toolbarBtn("●", "Heute")}
      ${toolbarBtn("›", "Weiter")}
      ${toolbarBtn("▦", "Monat")}
      ${toolbarBtn("⊘", "Filter")}
      ${toolbarBtn("⌕", "Suche")}
    </nav>
    <main class="week-list">${rows}</main>
    <button class="fab">+</button>
  `;
}

function renderMonthView() {
  const monthStart = startOfMonth(today);
  const monthLabel = `${MONTH_NAMES_DE_FULL[monthStart.getMonth()]} ${monthStart.getFullYear()}`;

  const firstWeekday = monthStart.getDay();
  const offset = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const gridStart = addDays(monthStart, -offset);

  const weekdayHeader = WEEKDAYS_DE.map((d) => `<div class="month-weekdays__day">${d}</div>`).join("");

  const rows = [];
  for (let w = 0; w < 6; w++) {
    const cells = [];
    let hasCurrentMonth = false;
    for (let d = 0; d < 7; d++) {
      const date = addDays(gridStart, w * 7 + d);
      const isOther = date.getMonth() !== monthStart.getMonth();
      if (!isOther) hasCurrentMonth = true;
      const isToday = isSameDay(date, today);
      const events = EVENTS.filter((e) => isSameDay(e.start, date)).slice(0, 3);
      const eventsHtml = events.map((ev) => {
        const m = MEMBERS.find((x) => x.id === ev.memberId);
        const color = m?.color ?? "#8E8E93";
        return `<div class="month-cell__event" style="background:${hexToRgba(color, 0.85)};">${ev.summary}</div>`;
      }).join("");
      cells.push(`<div class="month-cell ${isOther ? "month-cell--other-month" : ""} ${isToday ? "month-cell--today" : ""}">
        <span class="month-cell__number">${date.getDate()}</span>
        ${eventsHtml}
      </div>`);
    }
    if (hasCurrentMonth || w === 0) {
      rows.push(`<div class="month-row">${cells.join("")}</div>`);
    }
  }

  return `
    <header class="header">
      <button class="header__back">‹</button>
      <h1 class="header__title">${monthLabel}</h1>
    </header>
    <nav class="toolbar">
      ${toolbarBtn("‹", "Zurück")}
      ${toolbarBtn("●", "Heute")}
      ${toolbarBtn("›", "Weiter")}
      ${toolbarBtn("≡", "Woche")}
      ${toolbarBtn("⊘", "Filter")}
      ${toolbarBtn("⌕", "Suche")}
    </nav>
    <div class="month-grid">
      <div class="month-weekdays">${weekdayHeader}</div>
      ${rows.join("")}
    </div>
    <button class="fab">+</button>
  `;
}

const body = view === "month" ? renderMonthView() : renderWeekView();
const css = readFileSync(resolve(root, "src/style.css"), "utf8");
const filename = view === "month" ? "demo-month.html" : "demo-week.html";

const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Familienkalender Demo</title>
  <style>${css}</style>
</head>
<body>
  <div id="app">${body}</div>
</body>
</html>`;

writeFileSync(resolve(root, `dist/${filename}`), html);
console.log(`Wrote dist/${filename}`);
