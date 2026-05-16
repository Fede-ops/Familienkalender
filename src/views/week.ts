import type { CalendarEvent, FamilyMember } from "../types.ts";

const DAY_NAMES_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTH_NAMES_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function formatWeekRangeDe(start: Date): string {
  const end = addDays(start, 6);
  const startMonth = MONTH_NAMES_DE[start.getMonth()].slice(0, 3);
  const endMonth = MONTH_NAMES_DE[end.getMonth()].slice(0, 3);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}. - ${end.getDate()}. ${startMonth}`;
  }
  return `${start.getDate()}. ${startMonth} - ${end.getDate()}. ${endMonth}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((event) => isSameDay(event.start, day));
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMember(members: FamilyMember[], event: CalendarEvent): FamilyMember | undefined {
  if (!event.memberId) return undefined;
  return members.find((m) => m.id === event.memberId);
}

export interface WeekViewState {
  weekStart: Date;
  events: CalendarEvent[];
  members: FamilyMember[];
  today: Date;
}

export function renderWeekView(state: WeekViewState): string {
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i));
  const title = formatWeekRangeDe(state.weekStart);

  const rows = days
    .map((day) => {
      const dayEvents = eventsForDay(state.events, day);
      const isToday = isSameDay(day, state.today);
      const dayName = DAY_NAMES_DE[day.getDay()];

      const eventsHtml = dayEvents.length
        ? dayEvents.map((event) => renderEvent(event, getMember(state.members, event))).join("")
        : `<div class="event event--empty">No events</div>`;

      return `
        <div class="week-row">
          <div class="week-row__day ${isToday ? "week-row__day--today" : ""}">
            <span class="week-row__day-name">${dayName}</span>
            <span class="week-row__day-number">${day.getDate()}</span>
          </div>
          <div class="week-row__events">${eventsHtml}</div>
        </div>
      `;
    })
    .join("");

  return `
    <header class="header">
      <button class="header__back" aria-label="Back">←</button>
      <h1 class="header__title">${title}</h1>
    </header>
    <nav class="toolbar">
      ${toolbarButton("‹", "Previous", "nav-prev")}
      ${toolbarButton("▣", "Today", "nav-today")}
      ${toolbarButton("›", "Next", "nav-next")}
      ${toolbarButton("▦", "Month", "view-month")}
      ${toolbarButton("⌀", "Filter", "filter")}
      ${toolbarButton("⌕", "Search", "search")}
    </nav>
    <main class="week-list">${rows}</main>
    <button class="fab" aria-label="Add event" data-action="add-event">+</button>
  `;
}

function renderEvent(event: CalendarEvent, member?: FamilyMember): string {
  const bg = member ? darken(member.color) : "#3a2030";
  const avatarBg = member?.color ?? "#7a3a4a";
  const initial = member?.initial ?? "?";
  const timeLabel = event.allDay
    ? "Ganztägig"
    : `${formatTime(event.start)} - ${formatTime(event.end)}`;

  return `
    <div class="event" style="background: ${bg};">
      <div class="event__content">
        <span class="event__title">${escapeHtml(event.summary)}</span>
        <span class="event__time">${timeLabel}</span>
      </div>
      <div class="event__avatar" style="background: ${avatarBg};">${initial}</div>
    </div>
  `;
}

function toolbarButton(icon: string, label: string, action: string): string {
  return `
    <button class="toolbar__button" data-action="${action}">
      <span class="toolbar__icon">${icon}</span>
      <span class="toolbar__label">${label}</span>
    </button>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function darken(hex: string): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - 80);
  const g = Math.max(0, ((num >> 8) & 0xff) - 80);
  const b = Math.max(0, (num & 0xff) - 80);
  return `rgb(${r}, ${g}, ${b})`;
}
