import type { CalendarEvent, FamilyMember } from "../types.ts";

const MONTH_NAMES_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const WEEKDAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY_MS = 86_400_000;
const MAX_LANES = 4;

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function shade(hex: string, pct: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v + Math.round((255 * pct) / 100)));
  return `rgb(${clamp((n >> 16) & 0xff)},${clamp((n >> 8) & 0xff)},${clamp(n & 0xff)})`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
};

function toolbarBtn(iconKey: keyof typeof ICONS, label: string, action: string): string {
  return `<button class="toolbar__button" data-action="${action}">
    <span class="toolbar__icon">${ICONS[iconKey]}</span>
    <span class="toolbar__label">${label}</span>
  </button>`;
}

interface WeekBar {
  event: CalendarEvent;
  startCol: number;
  endCol: number;
  lane: number;
  clipLeft: boolean;
  clipRight: boolean;
}

// Lay out one row's events into horizontal lanes so multi-day events render
// as a single bar spanning their cells, TimeTree-style. Returns the placed
// bars plus a per-day count of events that didn't fit into MAX_LANES.
function layoutWeek(weekStart: Date, events: CalendarEvent[]): { bars: WeekBar[]; overflow: number[] } {
  const weekEnd = addDays(weekStart, 7); // exclusive

  const weekEvents = events.filter((e) => {
    if (e.allDay) return e.start < weekEnd && e.end >= weekStart;
    return e.start < weekEnd && e.end > weekStart;
  });

  // Longest spans first so multi-day events sit on the top lanes; ties broken
  // by start time so the visual order is intuitive.
  weekEvents.sort((a, b) => {
    const aStart = startOfDay(a.start).getTime();
    const aLast = a.allDay
      ? startOfDay(a.end).getTime()
      : startOfDay(new Date(a.end.getTime() - 1)).getTime();
    const bStart = startOfDay(b.start).getTime();
    const bLast = b.allDay
      ? startOfDay(b.end).getTime()
      : startOfDay(new Date(b.end.getTime() - 1)).getTime();
    const aSpan = aLast - aStart;
    const bSpan = bLast - bStart;
    if (aSpan !== bSpan) return bSpan - aSpan;
    return aStart - bStart;
  });

  const lanes: Array<Array<[number, number]>> = [];
  const bars: WeekBar[] = [];
  const overflow: number[] = [0, 0, 0, 0, 0, 0, 0];

  for (const event of weekEvents) {
    const eventStart = startOfDay(event.start);
    const eventLast = event.allDay
      ? startOfDay(event.end)
      : startOfDay(new Date(event.end.getTime() - 1));

    let startCol = Math.floor((eventStart.getTime() - weekStart.getTime()) / DAY_MS);
    let endCol = Math.floor((eventLast.getTime() - weekStart.getTime()) / DAY_MS);
    const clipLeft = startCol < 0;
    const clipRight = endCol > 6;
    startCol = Math.max(0, startCol);
    endCol = Math.min(6, endCol);
    if (startCol > endCol) continue;

    let lane = 0;
    while (lane < MAX_LANES) {
      if (!lanes[lane]) { lanes[lane] = []; break; }
      const taken = lanes[lane].some(([s, e]) => !(e < startCol || s > endCol));
      if (!taken) break;
      lane++;
    }

    if (lane >= MAX_LANES) {
      for (let i = startCol; i <= endCol; i++) overflow[i]++;
      continue;
    }
    lanes[lane].push([startCol, endCol]);
    bars.push({ event, startCol, endCol, lane, clipLeft, clipRight });
  }

  return { bars, overflow };
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
    const weekStart = addDays(gridStart, w * 7);
    const { bars, overflow } = layoutWeek(weekStart, events);

    const cells: string[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(weekStart, d);
      const isOther = date.getMonth() !== monthStart.getMonth();
      if (!isOther) hasCurrentMonth = true;
      const isToday = isSameDay(date, today);
      const more = overflow[d];
      cells.push(`<div class="month-cell${isOther ? " month-cell--other-month" : ""}${isToday ? " month-cell--today" : ""}" data-action="day-tap" data-date="${date.toISOString()}">
        <span class="month-cell__number">${isToday ? `<span class="month-cell__today-circle">${date.getDate()}</span>` : date.getDate()}</span>
        ${more > 0 ? `<span class="month-cell__more">+${more}</span>` : ""}
      </div>`);
    }

    if (!hasCurrentMonth) continue;

    const eventBars = bars.map((b) => {
      const m = members.find((x) => x.id === b.event.memberId);
      const color = m?.color ?? "#8E8E93";
      const grad = `linear-gradient(160deg,${shade(color, 5)} 0%,${shade(color, -45)} 100%)`;
      const leftPct = (b.startCol / 7) * 100;
      const widthPct = ((b.endCol - b.startCol + 1) / 7) * 100;
      const top = 34 + b.lane * 16;
      const classes = ["month-bar"];
      if (b.clipLeft) classes.push("month-bar--clip-left");
      if (b.clipRight) classes.push("month-bar--clip-right");
      return `<div class="${classes.join(" ")}" style="left:${leftPct}%;width:${widthPct}%;top:${top}px;background:${grad};" data-action="event-detail" data-uid="${escapeHtml(b.event.uid)}">${escapeHtml(b.event.summary)}</div>`;
    }).join("");

    rows.push(`<div class="month-row">${cells.join("")}<div class="month-row__bars">${eventBars}</div></div>`);
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
        ${toolbarBtn("settings", "Setup", "open-settings")}
    </nav>
    <div class="month-weekdays">${weekdayHeader}</div>
    <div class="slide-viewport"><div class="month-scroll"><div class="month-grid">${rows.join("")}</div></div></div>
  `;
}
