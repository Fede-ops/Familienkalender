import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const view = process.argv[2] ?? "week";
const modalTab = process.argv[3] ?? "detail";

const DAY_NAMES_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WEEKDAYS_DE_SUN_FIRST = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTH_NAMES_DE_FULL = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const MONTH_NAMES_DE_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

const MEMBERS = [
  { id: "calendar.fede", name: "Fede", initial: "F", color: "#0A84FF" },
  { id: "calendar.pita", name: "Pita", initial: "P", color: "#30D158" },
  { id: "calendar.bebos", name: "Bebos", initial: "B", color: "#FF9F0A" },
  { id: "calendar.santi", name: "Santi", initial: "S", color: "#FF2D55" },
  { id: "calendar.fede_trabajo", name: "Fede T", initial: "F", color: "#BF5AF2" },
  { id: "calendar.pita_trabajo", name: "Pita T", initial: "P", color: "#64D2FF" },
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
  const gradient = `linear-gradient(135deg, ${hexToRgba(accent, 0.28)} 0%, ${hexToRgba(accent, 0.08)} 100%)`;
  const avatarGradient = `linear-gradient(135deg, ${accent} 0%, ${shadeColor(accent, -30)} 100%)`;
  const timeLabel = ev.allDay ? "Ganztägig" : `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`;
  return `<div class="event" style="background:${gradient};">
    <div class="event__bar" style="background:${avatarGradient};"></div>
    <div class="event__content">
      <span class="event__title">${ev.summary}</span>
      <span class="event__time">${timeLabel}</span>
    </div>
    <div class="event__avatar" style="background:${avatarGradient};">${m?.initial ?? "?"}</div>
  </div>`;
}

function shadeColor(hex, percent) {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.max(0, Math.min(255, r + Math.round((255 * percent) / 100)));
  g = Math.max(0, Math.min(255, g + Math.round((255 * percent) / 100)));
  b = Math.max(0, Math.min(255, b + Math.round((255 * percent) / 100)));
  return `rgb(${r}, ${g}, ${b})`;
}

const ICONS = {
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>`,
  next: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
  today: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18"/><path d="M8 2v4M16 2v4"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>`,
  month: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18M9 4v18M15 4v18M3 16h18"/></svg>`,
  week: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
  filter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>`,
  todo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l2 2 4-4M4 14l2 2 4-4M12 7h8M12 15h8"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.4 12.5a2 2 0 0 0 2 1.5h8.4a2 2 0 0 0 2-1.5L22 7H6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  haLogo: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.066 11.367 12.633 1.94a.901.901 0 0 0-1.272 0L1.928 11.367a.901.901 0 0 0 0 1.272l.636.636a.901.901 0 0 0 1.272 0L4 13.111v6.585c0 .497.403.9.9.9h4.5v-7.05c0-.498.403-.9.9-.9h3.402c.498 0 .9.402.9.9v7.05h4.498a.9.9 0 0 0 .9-.9v-6.585l.164.164a.901.901 0 0 0 1.272 0l.636-.636a.901.901 0 0 0-.006-1.272Zm-7.998 1.434a2.067 2.067 0 1 1-2.067-2.067 2.07 2.07 0 0 1 2.067 2.067Z"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.149-.174.198-.298.298-.496.099-.198.05-.372-.025-.521-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.117.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg>`,
  signal: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.523 5.824L.057 23.032l5.261-1.453A11.947 11.947 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm-3.75 13.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3.75 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3.75 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>`,
};

function toolbarBtn(iconKey, label) {
  const icon = ICONS[iconKey] ?? "";
  return `<button class="toolbar__button"><span class="toolbar__icon">${icon}</span><span class="toolbar__label">${label}</span></button>`;
}

function tabBar(activeKey = "kalender") {
  const items = [
    { key: "kalender", icon: "home", label: "Kalender" },
    { key: "todo", icon: "todo", label: "To-Do" },
    { key: "einkauf", icon: "cart", label: "Einkauf" },
  ];
  const itemsHtml = items.map((it) =>
    `<button class="tab-bar__item ${it.key === activeKey ? "tab-bar__item--active" : ""}">
      <span class="tab-bar__icon">${ICONS[it.icon]}</span>
      <span class="tab-bar__label">${it.label}</span>
    </button>`
  ).join("");
  return `<nav class="tab-bar">${itemsHtml}</nav>`;
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
      <button class="header__back">${ICONS.back}</button>
      <h1 class="header__title">${title}</h1>
    </header>
    <nav class="toolbar">
      ${toolbarBtn("back", "Zurück")}
      ${toolbarBtn("today", "Heute")}
      ${toolbarBtn("next", "Weiter")}
      ${toolbarBtn("month", "Monat")}
      ${toolbarBtn("filter", "Filter")}
      ${toolbarBtn("search", "Suche")}
    </nav>
    <main class="week-list">${rows}</main>
    <button class="fab">${ICONS.plus}</button>
    ${tabBar("kalender")}
  `;
}

function renderMonthBlock(monthStart, opts = {}) {
  const monthLabel = `${MONTH_NAMES_DE_FULL[monthStart.getMonth()]} ${monthStart.getFullYear()}`;
  const firstWeekday = monthStart.getDay();
  const gridStart = addDays(monthStart, -firstWeekday);

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
        const grad = `linear-gradient(135deg, ${color} 0%, ${shadeColor(color, -25)} 100%)`;
        return `<div class="month-cell__event" style="background:${grad};">${ev.summary}</div>`;
      }).join("");
      cells.push(`<div class="month-cell ${isOther ? "month-cell--other-month" : ""} ${isToday ? "month-cell--today" : ""}">
        <span class="month-cell__number">${date.getDate()}</span>
        ${eventsHtml}
      </div>`);
    }
    if (hasCurrentMonth || w < 2) {
      rows.push(`<div class="month-row">${cells.join("")}</div>`);
    }
  }

  const titleHtml = opts.showTitle ? `<div class="month-block__title">${monthLabel}</div>` : "";

  return `<section class="month-block">
    ${titleHtml}
    <div class="month-grid">${rows.join("")}</div>
  </section>`;
}

function renderMonthView() {
  const monthStart = startOfMonth(today);
  const monthLabel = `${MONTH_NAMES_DE_FULL[monthStart.getMonth()]} ${monthStart.getFullYear()}`;
  const weekdayHeader = WEEKDAYS_DE_SUN_FIRST.map((d) => `<div class="month-weekdays__day">${d}</div>`).join("");

  return `
    <header class="header">
      <button class="header__back">${ICONS.back}</button>
      <h1 class="header__title">${monthLabel}</h1>
    </header>
    <nav class="toolbar">
      ${toolbarBtn("back", "Zurück")}
      ${toolbarBtn("today", "Heute")}
      ${toolbarBtn("next", "Weiter")}
      ${toolbarBtn("week", "Woche")}
      ${toolbarBtn("filter", "Filter")}
      ${toolbarBtn("search", "Suche")}
    </nav>
    <div class="month-weekdays">${weekdayHeader}</div>
    <div class="month-scroll">
      ${renderMonthBlock(monthStart, { showTitle: false })}
    </div>
    <button class="fab">${ICONS.plus}</button>
    ${tabBar("kalender")}
  `;
}

function renderEventModalBackdrop() {
  const selectedMember = MEMBERS[1];
  const tabs = [
    { key: "datum", label: "Datum" },
    { key: "detail", label: "Detail" },
    { key: "erinnerung", label: "Erinnerung" },
  ];
  const tabsHtml = tabs.map((t) =>
    `<button class="modal-tab ${t.key === modalTab ? "modal-tab--active" : ""}">${t.label}</button>`
  ).join("");

  const membersHtml = MEMBERS.map((m) => {
    const grad = `linear-gradient(135deg, ${m.color} 0%, ${shadeColor(m.color, -30)} 100%)`;
    const active = m.id === selectedMember.id ? "member-chip--active" : "";
    return `<button class="member-chip ${active}">
      <span class="member-chip__avatar" style="background:${grad};">${m.initial}</span>
      <span class="member-chip__name">${m.name}</span>
    </button>`;
  }).join("");

  let tabBody = "";
  if (modalTab === "datum") {
    tabBody = `
      <div class="field-group">
        <div class="field field--toggle">
          <span class="field__label">Ganztägig</span>
          <span class="field__value"></span>
        </div>
      </div>
      <div class="field-group">
        <div class="field">
          <span class="field__label">Beginnt</span>
          <span class="field__value field__value--accent">Fr. 15. Mai · 19:30</span>
        </div>
        <div class="field">
          <span class="field__label">Endet</span>
          <span class="field__value">Fr. 15. Mai · 21:00</span>
        </div>
      </div>
      <div class="field-group">
        <div class="field">
          <span class="field__label">Wiederholen</span>
          <span class="field__value">Nie ›</span>
        </div>
      </div>
    `;
  } else if (modalTab === "detail") {
    tabBody = `
      <div class="section-label">Kalender</div>
      <div class="member-picker">${membersHtml}</div>
      <div class="field-group">
        <div class="field field--column">
          <input class="field__input" placeholder="Ort" value="Zuhause" />
        </div>
        <div class="field field--column">
          <input class="field__input" placeholder="Notizen hinzufügen..." />
        </div>
      </div>
    `;
  } else if (modalTab === "erinnerung") {
    tabBody = `
      <div class="field-group">
        <div class="field">
          <span class="field__label">Erinnerung</span>
          <span class="field__value field__value--accent">15 Minuten vorher ›</span>
        </div>
        <div class="field">
          <span class="field__label">Zweite Erinnerung</span>
          <span class="field__value">Keine ›</span>
        </div>
      </div>
      <div class="section-label">Benachrichtigen via</div>
      <div class="channel-list">
        <div class="channel-item channel-item--active">
          <span class="channel-item__icon channel-item__icon--ha">${ICONS.haLogo}</span>
          <span class="channel-item__label">Home Assistant Push</span>
          <span class="channel-item__check">${ICONS.check}</span>
        </div>
        <div class="channel-item channel-item--active">
          <span class="channel-item__icon channel-item__icon--whatsapp">${ICONS.whatsapp}</span>
          <span class="channel-item__label">WhatsApp</span>
          <span class="channel-item__check">${ICONS.check}</span>
        </div>
        <div class="channel-item">
          <span class="channel-item__icon channel-item__icon--signal">${ICONS.signal}</span>
          <span class="channel-item__label">Signal</span>
          <span class="channel-item__check"></span>
        </div>
      </div>
    `;
  }

  return `
    <div class="modal-sheet modal-sheet--standalone">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-header__close">Abbrechen</button>
        <span class="modal-header__title">Neues Event</span>
        <button class="modal-header__action">Speichern</button>
      </div>
      <div class="modal-title-block">
        <input class="modal-title-input" placeholder="Beschreibung des Events..." value="Abendessen Familie" />
      </div>
      <div class="modal-tabs">${tabsHtml}</div>
      <div class="modal-body">${tabBody}</div>
    </div>
  `;
}

// ── Shopping demo ──────────────────────────────────────────────────────────

function renderShoppingDemo() {
  const items = [
    { id: "1", name: "Äpfel", category: "obst", checked: false },
    { id: "2", name: "Bananen", category: "obst", checked: false },
    { id: "3", name: "Spinat", category: "obst", checked: false },
    { id: "4", name: "Milch", category: "milch", checked: false },
    { id: "5", name: "Butter", category: "milch", checked: true },
    { id: "6", name: "Mozzarella", category: "milch", checked: false },
    { id: "7", name: "Hähnchen", category: "fleisch", checked: false },
    { id: "8", name: "Lachs", category: "fleisch", checked: false },
    { id: "9", name: "Brot", category: "backwaren", checked: false },
    { id: "10", name: "Pasta", category: "backwaren", checked: true },
    { id: "11", name: "Mineralwasser", category: "getraenke", checked: false },
    { id: "12", name: "Orangensaft", category: "getraenke", checked: false },
    { id: "13", name: "Spülmittel", category: "haushalt", checked: false },
  ];

  const SHOPPING_CATEGORIES = [
    { key: "obst", label: "Obst & Gemüse", color: "#30D158" },
    { key: "milch", label: "Milch & Kühlwaren", color: "#64D2FF" },
    { key: "fleisch", label: "Fleisch & Fisch", color: "#FF9F0A" },
    { key: "backwaren", label: "Backwaren & Nudeln", color: "#FF6B47" },
    { key: "getraenke", label: "Getränke", color: "#BF5AF2" },
    { key: "haushalt", label: "Haushalt & Pflege", color: "#8E8E93" },
    { key: "sonstiges", label: "Sonstiges", color: "#636366" },
  ];

  const plusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`;
  const checkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  const active = items.filter(i => !i.checked);
  const done = items.filter(i => i.checked);
  const totalActive = active.length;

  let bodyHtml = "";
  for (const cat of SHOPPING_CATEGORIES) {
    const groupItems = active.filter(i => i.category === cat.key);
    if (!groupItems.length) continue;
    const rows = groupItems.map(item => `
      <button class="list-item">
        <span class="list-item__check"></span>
        <span class="list-item__name">${item.name}</span>
      </button>`).join("");
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
  if (done.length) {
    const rows = done.map(item => `
      <button class="list-item list-item--checked">
        <span class="list-item__check list-item__check--done">${checkIcon}</span>
        <span class="list-item__name">${item.name}</span>
      </button>`).join("");
    bodyHtml += `
      <div class="category-group category-group--done">
        <div class="category-header">
          <span class="category-label category-label--muted">Erledigt (${done.length})</span>
          <button class="category-clear">Löschen</button>
        </div>
        <div class="list-items">${rows}</div>
      </div>`;
  }

  return `
    <header class="header list-header">
      <h1 class="header__title">Einkauf <span class="header__badge">${totalActive}</span></h1>
    </header>
    <div class="list-add">
      <input class="list-add__input" placeholder="Artikel hinzufügen…" />
      <button class="list-add__btn">${plusIcon}</button>
    </div>
    <div class="list-body">${bodyHtml}</div>
    ${tabBar("einkauf")}
  `;
}

// ── To-Do demo ─────────────────────────────────────────────────────────────

function renderTodoDemo() {
  const items = [
    { id: "1", title: "Kinderarzt Termin", category: "familie", completed: false },
    { id: "2", title: "Geburtstagsfeier planen", category: "familie", completed: false },
    { id: "3", title: "Küche putzen", category: "haushalt", completed: false },
    { id: "4", title: "Wäsche waschen", category: "haushalt", completed: true },
    { id: "5", title: "Kundenmeeting vorbereiten", category: "arbeit", completed: false },
    { id: "6", title: "Rechnung senden", category: "arbeit", completed: false },
    { id: "7", title: "Bücher zurückgeben", category: "sonstiges", completed: false },
  ];

  const TODO_CATEGORIES = [
    { key: "familie", label: "Familie", color: "#FF9F0A" },
    { key: "haushalt", label: "Haushalt", color: "#30D158" },
    { key: "arbeit", label: "Arbeit", color: "#0A84FF" },
    { key: "sonstiges", label: "Sonstiges", color: "#636366" },
  ];

  const plusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`;
  const checkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  const open = items.filter(i => !i.completed);
  const done = items.filter(i => i.completed);
  const totalOpen = open.length;

  let bodyHtml = "";
  for (const cat of TODO_CATEGORIES) {
    const groupItems = open.filter(i => i.category === cat.key);
    if (!groupItems.length) continue;
    const rows = groupItems.map(item => `
      <button class="list-item">
        <span class="list-item__check"></span>
        <span class="list-item__name">${item.title}</span>
      </button>`).join("");
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
  if (done.length) {
    const rows = done.map(item => `
      <button class="list-item list-item--checked">
        <span class="list-item__check list-item__check--done">${checkIcon}</span>
        <span class="list-item__name">${item.title}</span>
      </button>`).join("");
    bodyHtml += `
      <div class="category-group category-group--done">
        <div class="category-header">
          <span class="category-label category-label--muted">Erledigt (${done.length})</span>
          <button class="category-clear">Löschen</button>
        </div>
        <div class="list-items">${rows}</div>
      </div>`;
  }

  return `
    <header class="header list-header">
      <h1 class="header__title">To-Do <span class="header__badge">${totalOpen}</span></h1>
    </header>
    <div class="list-add">
      <input class="list-add__input" placeholder="Aufgabe hinzufügen…" />
      <button class="list-add__btn">${plusIcon}</button>
    </div>
    <div class="list-body">${bodyHtml}</div>
    ${tabBar("todo")}
  `;
}

// ── Main ───────────────────────────────────────────────────────────────────

let body;
if (view === "modal") {
  body = `<div class="modal-demo-wrap">${renderEventModalBackdrop()}</div>`;
} else if (view === "month") {
  body = renderMonthView();
} else if (view === "shopping") {
  body = renderShoppingDemo();
} else if (view === "todo") {
  body = renderTodoDemo();
} else {
  body = renderWeekView();
}
const css = readFileSync(resolve(root, "src/style.css"), "utf8");
const filename =
  view === "modal" ? `demo-modal-${modalTab}.html` :
  view === "month" ? "demo-month.html" :
  view === "shopping" ? "demo-shopping.html" :
  view === "todo" ? "demo-todo.html" :
  "demo-week.html";

const extraCss = view === "modal" ? `
  body { background: #0a0a0a; padding-top: 40px; }
  .modal-demo-wrap { background: transparent; }
  .modal-sheet--standalone { position: relative; width: 100%; max-height: none; border-radius: 18px 18px 0 0; }
` : "";

const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Familienkalender Demo</title>
  <style>${css}${extraCss}</style>
</head>
<body>
  <div id="app">${body}</div>
</body>
</html>`;

writeFileSync(resolve(root, `dist/${filename}`), html);
console.log(`Wrote dist/${filename}`);
