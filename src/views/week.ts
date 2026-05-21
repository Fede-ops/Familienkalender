import type { CalendarEvent, FamilyMember } from "../types.ts";

const DAY_NAMES_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTH_NAMES_DE_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));
  result.setHours(0, 0, 0, 0);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},${alpha})`;
}

function shade(hex: string, pct: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v + Math.round((255 * pct) / 100)));
  return `rgb(${clamp((n >> 16) & 0xff)},${clamp((n >> 8) & 0xff)},${clamp(n & 0xff)})`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const ICONS = {
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>`,
  next: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
  today: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18"/><path d="M8 2v4M16 2v4"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>`,
  month: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18M9 4v18M15 4v18M3 16h18"/></svg>`,
  filter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
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


function renderEvent(event: CalendarEvent, member?: FamilyMember): string {
  const accent = member?.color ?? "#8E8E93";
  const bg = `linear-gradient(135deg,${hexToRgba(accent, 0.28)} 0%,${hexToRgba(accent, 0.08)} 100%)`;
  const avatarGrad = `linear-gradient(135deg,${accent} 0%,${shade(accent, -30)} 100%)`;
  const timeLabel = event.allDay ? "Ganztägig" : `${fmtTime(event.start)} – ${fmtTime(event.end)}`;
  return `<div class="event" data-action="event-detail" data-uid="${event.uid}" style="background:${bg};">
    <div class="event__bar" style="background:${avatarGrad};"></div>
    <div class="event__content">
      <span class="event__title">${escapeHtml(event.summary)}</span>
      <span class="event__time">${timeLabel}</span>
    </div>
    <div class="event__avatar" style="background:${avatarGrad};">${member?.initial ?? "?"}</div>
  </div>`;
}

export interface WeekViewState {
  weekStart: Date;
  events: CalendarEvent[];
  members: FamilyMember[];
  today: Date;
  filterActive?: boolean;
}

export function renderWeekView(viewState: WeekViewState): string {
  const { weekStart, events, members, today, filterActive } = viewState;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const end = addDays(weekStart, 6);
  const sm = MONTH_NAMES_DE_SHORT[weekStart.getMonth()];
  const em = MONTH_NAMES_DE_SHORT[end.getMonth()];
  const title =
    weekStart.getMonth() === end.getMonth()
      ? `${weekStart.getDate()}. – ${end.getDate()}. ${sm}`
      : `${weekStart.getDate()}. ${sm} – ${end.getDate()}. ${em}`;

  const rows = days
    .map((day) => {
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
      const dayEvents = events.filter((e) =>
        e.start < dayEnd && e.end > dayStart
      );
      const isToday = isSameDay(day, today);
      const eventsHtml = dayEvents.length
        ? dayEvents.map((e) => renderEvent(e, members.find((m) => m.id === e.memberId))).join("")
        : `<div class="event event--empty">Keine Termine</div>`;
      return `<div class="week-row" data-date="${day.toISOString()}">
        <div class="week-row__day${isToday ? " week-row__day--today" : ""}">
          <span class="week-row__day-name">${DAY_NAMES_DE[day.getDay()]}</span>
          <span class="week-row__day-number">${day.getDate()}</span>
        </div>
        <div class="week-row__events">${eventsHtml}</div>
      </div>`;
    })
    .join("");

  return `
    <div class="sticky-nav">
      <header class="header">
        <button class="header__back" data-action="nav-prev">${ICONS.back}</button>
        <h1 class="header__title">${title}</h1>
        <button class="header__action" data-action="view-month">${ICONS.month}</button>
      </header>
      <nav class="toolbar">
        ${toolbarBtn("back", "Zurück", "nav-prev")}
        ${toolbarBtn("today", "Heute", "nav-today")}
        ${toolbarBtn("next", "Weiter", "nav-next")}
        ${toolbarBtn("month", "Monat", "view-month")}
        <button class="toolbar__button${filterActive ? " toolbar__button--active" : ""}" data-action="filter">
          <span class="toolbar__icon">${ICONS.filter}${filterActive ? `<span class="toolbar__badge"></span>` : ""}</span>
          <span class="toolbar__label">Filter</span>
        </button>
        ${toolbarBtn("search", "Suche", "search")}
      </nav>
    </div>
    <div class="slide-viewport"><main class="week-list">${rows}</main></div>
    <button class="fab" data-action="add-event">${ICONS.plus}</button>
  `;
}
