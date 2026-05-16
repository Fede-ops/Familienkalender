import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const DAY_NAMES_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTH_NAMES_DE_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

const MEMBERS = [
  { id: "calendar.fede", initial: "F", color: "#2196f3" },
  { id: "calendar.pita", initial: "P", color: "#4caf50" },
  { id: "calendar.bebos", initial: "B", color: "#ff9800" },
  { id: "calendar.fede_trabajo", initial: "T", color: "#9c27b0" },
];

const today = new Date();
const weekStart = (() => {
  const d = new Date(today);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
})();

function addDays(date, days) {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

function day(offset, h, m) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + offset);
  d.setHours(h, m, 0, 0);
  return d;
}

const EVENTS = [
  { summary: "Fede Sport", start: day(0, 7, 0), end: day(0, 8, 0), memberId: "calendar.fede", allDay: false },
  { summary: "Bebos Schule", start: day(0, 8, 30), end: day(0, 14, 0), memberId: "calendar.bebos", allDay: false },
  { summary: "Pita Yoga", start: day(1, 19, 0), end: day(1, 20, 30), memberId: "calendar.pita", allDay: false },
  { summary: "Fede Trabajo Meeting", start: day(2, 10, 0), end: day(2, 11, 30), memberId: "calendar.fede_trabajo", allDay: false },
  { summary: "Bebos Geburtstag", start: day(3, 0, 0), end: day(4, 0, 0), memberId: "calendar.bebos", allDay: true },
  { summary: "Pita Abendessen", start: day(4, 22, 0), end: day(4, 23, 0), memberId: "calendar.pita", allDay: false },
  { summary: "Familie Wochenende", start: day(5, 12, 0), end: day(5, 18, 0), memberId: "calendar.fede", allDay: false },
];

function fmtTime(d) {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function darken(hex, amount = 80) {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `rgb(${r}, ${g}, ${b})`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function renderTitle() {
  const end = addDays(weekStart, 6);
  const sm = MONTH_NAMES_DE_SHORT[weekStart.getMonth()];
  const em = MONTH_NAMES_DE_SHORT[end.getMonth()];
  if (weekStart.getMonth() === end.getMonth()) {
    return `${weekStart.getDate()}. - ${end.getDate()}. ${sm}`;
  }
  return `${weekStart.getDate()}. ${sm} - ${end.getDate()}. ${em}`;
}

function toolbarBtn(icon, label) {
  return `<button class="toolbar__button"><span class="toolbar__icon">${icon}</span><span class="toolbar__label">${label}</span></button>`;
}

function renderEvent(ev) {
  const m = MEMBERS.find((x) => x.id === ev.memberId);
  const bg = m ? darken(m.color, 90) : "#3a2030";
  const avatarBg = m?.color ?? "#7a3a4a";
  const initial = m?.initial ?? "?";
  const timeLabel = ev.allDay ? "Ganztägig" : `${fmtTime(ev.start)} - ${fmtTime(ev.end)}`;
  return `<div class="event" style="background:${bg};">
    <div class="event__content"><span class="event__title">${ev.summary}</span><span class="event__time">${timeLabel}</span></div>
    <div class="event__avatar" style="background:${avatarBg};">${initial}</div>
  </div>`;
}

function renderRow(date) {
  const evs = EVENTS.filter((e) => isSameDay(e.start, date));
  const isToday = isSameDay(date, today);
  const eventsHtml = evs.length
    ? evs.map(renderEvent).join("")
    : `<div class="event event--empty">No events</div>`;
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
const title = renderTitle();

const css = readFileSync(resolve(root, "src/style.css"), "utf8");

const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Familienkalender Demo</title>
  <style>${css}
    body { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; }
  </style>
</head>
<body>
  <div id="app">
    <header class="header">
      <button class="header__back">←</button>
      <h1 class="header__title">${title}</h1>
    </header>
    <nav class="toolbar">
      ${toolbarBtn("‹", "Previous")}
      ${toolbarBtn("▣", "Today")}
      ${toolbarBtn("›", "Next")}
      ${toolbarBtn("▦", "Week")}
      ${toolbarBtn("⌀", "Filter")}
      ${toolbarBtn("⌕", "Search")}
    </nav>
    <main class="week-list">${rows}</main>
    <button class="fab">+</button>
  </div>
</body>
</html>`;

writeFileSync(resolve(root, "dist/demo-static.html"), html);
console.log("Wrote dist/demo-static.html");
