import type { CalendarEvent, FamilyMember, TabKey } from "../types.ts";

const MONTH_NAMES_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const WEEKDAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

function shade(hex: string, pct: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v + Math.round((255 * pct) / 100)));
  return `rgb(${clamp((n >> 16) & 0xff)},${clamp((n >> 8) & 0xff)},${clamp(n & 0xff)})`;
}

const ICONS = {
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>`,
  next: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
  today: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18"/><path d="M8 2v4M16 2v4"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>`,
  week: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
  filter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>`,
  todo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l2 2 4-4M4 14l2 2 4-4M12 7h8M12 15h8"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.4 12.5a2 2 0 0 0 2 1.5h8.4a2 2 0 0 0 2-1.5L22 7H6"/></svg>`,
};

function toolbarBtn(iconKey: keyof typeof ICONS, label: string, action: string): string {
  return `<button class="toolbar__button" data-action="${action}">
    <span class="toolbar__icon">${ICONS[iconKey]}</span>
    <span class="toolbar__label">${label}</span>
  </button>`;
}

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

export interface MonthViewState {
  monthStart: Date;
  events: CalendarEvent[];
  members: FamilyMember[];
  today: Date;
}

export function renderMonthView(viewState: MonthViewState): string {
  const { monthStart, events, members, today } = viewState;
  const label = `${MONTH_NAMES_DE[monthStart.getMonth()]} ${monthStart.getFullYear()}`;

  // Grid starts on Monday of the week containing the 1st
  const firstDay = monthStart.getDay(); // 0=Sun
  const gridStart = addDays(monthStart, firstDay === 0 ? -6 : 1 - firstDay);

  const rows: string[] = [];
  for (let w = 0; w < 6; w++) {
    let hasCurrentMonth = false;
    const cells: string[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(gridStart, w * 7 + d);
      const isOther = date.getMonth() !== monthStart.getMonth();
      if (!isOther) hasCurrentMonth = true;
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      const isToday = isSameDay(date, today);
      const dayEvents = events
        .filter((e) => e.start < dayEnd && (e.allDay ? e.end >= dayStart : e.end > dayStart))
        .slice(0, 3);

      const dots = dayEvents.map((ev) => {
        const m = members.find((x) => x.id === ev.memberId);
        const color = m?.color ?? "#8E8E93";
        return `<span class="month-cell__dot" style="background:${color};"></span>`;
      }).join("");

      const eventPills = dayEvents.map((ev) => {
        const m = members.find((x) => x.id === ev.memberId);
        const color = m?.color ?? "#8E8E93";
        const grad = `linear-gradient(160deg,${shade(color, 5)} 0%,${shade(color, -45)} 100%)`;
        const label = ev.summary;
        return `<div class="month-cell__event" style="background:${grad};">${label}</div>`;
      }).join("");

      cells.push(`<div class="month-cell${isOther ? " month-cell--other-month" : ""}${isToday ? " month-cell--today" : ""}" data-action="day-tap" data-date="${date.toISOString()}">
        <span class="month-cell__number">${isToday ? `<span class="month-cell__today-circle">${date.getDate()}</span>` : date.getDate()}</span>
        ${eventPills}
        ${!eventPills && dots ? `<div class="month-cell__dots">${dots}</div>` : ""}
      </div>`);
    }
    if (hasCurrentMonth) rows.push(`<div class="month-row">${cells.join("")}</div>`);
  }

  const weekdayHeader = WEEKDAYS_DE.map(
    (d) => `<div class="month-weekdays__day">${d}</div>`
  ).join("");

  return `
    <header class="header">
      <button class="header__back" data-action="nav-month-prev">${ICONS.back}</button>
      <h1 class="header__title">${label}</h1>
      <button class="header__action" data-action="view-week">${ICONS.week}</button>
    </header>
    <nav class="toolbar">
      ${toolbarBtn("back", "Zurück", "nav-month-prev")}
      ${toolbarBtn("today", "Heute", "nav-month-today")}
      ${toolbarBtn("next", "Weiter", "nav-month-next")}
      ${toolbarBtn("week", "Woche", "view-week")}
      ${toolbarBtn("filter", "Filter", "filter")}
    </nav>
    <div class="month-weekdays">${weekdayHeader}</div>
    <div class="month-scroll">
      <div class="month-grid">${rows.join("")}</div>
    </div>
    <button class="fab" data-action="add-event">${ICONS.plus}</button>
    ${tabBar("kalender")}
  `;
}
