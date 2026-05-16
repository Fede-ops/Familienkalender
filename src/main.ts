import "./style.css";
import { HAClient, loadConfig, saveConfig } from "./ha-client.ts";
import { addDays, renderWeekView, startOfWeek } from "./views/week.ts";
import type { CalendarEvent, FamilyMember } from "./types.ts";

const DEFAULT_MEMBERS: FamilyMember[] = [
  { id: "calendar.fede", name: "Fede", initial: "F", color: "#2196f3" },
  { id: "calendar.pita", name: "Pita", initial: "P", color: "#4caf50" },
  { id: "calendar.bebos", name: "Bebos", initial: "B", color: "#ff9800" },
  { id: "calendar.fede_trabajo", name: "Fede Trabajo", initial: "T", color: "#9c27b0" },
];

const DEMO_EVENTS: CalendarEvent[] = [
  {
    uid: "demo-pita",
    summary: "Pita Abendessen",
    start: new Date(new Date().setHours(22, 0, 0, 0)),
    end: new Date(new Date().setHours(23, 0, 0, 0)),
    allDay: false,
    memberId: "calendar.pita",
  },
  {
    uid: "demo-fede",
    summary: "Fede Sport",
    start: new Date(new Date().setHours(18, 0, 0, 0)),
    end: new Date(new Date().setHours(19, 30, 0, 0)),
    allDay: false,
    memberId: "calendar.fede",
  },
];

interface AppState {
  weekStart: Date;
  events: CalendarEvent[];
  members: FamilyMember[];
}

const app = document.getElementById("app")!;
const state: AppState = {
  weekStart: startOfWeek(new Date()),
  events: DEMO_EVENTS,
  members: DEFAULT_MEMBERS,
};

function render(): void {
  app.innerHTML = renderWeekView({
    weekStart: state.weekStart,
    events: state.events,
    members: state.members,
    today: new Date(),
  });
  bindEvents();
}

function bindEvents(): void {
  app.querySelectorAll<HTMLElement>("[data-action]").forEach((el) => {
    el.addEventListener("click", () => {
      const action = el.dataset.action;
      if (action === "nav-prev") state.weekStart = addDays(state.weekStart, -7);
      if (action === "nav-next") state.weekStart = addDays(state.weekStart, 7);
      if (action === "nav-today") state.weekStart = startOfWeek(new Date());
      if (action === "add-event") alert("Event-Erstellung folgt im nächsten Schritt");
      render();
      if (action === "nav-prev" || action === "nav-next" || action === "nav-today") {
        void refreshEvents();
      }
    });
  });
}

async function refreshEvents(): Promise<void> {
  const config = loadConfig();
  if (!config) return;
  try {
    const client = new HAClient(config);
    const start = state.weekStart;
    const end = addDays(start, 7);
    state.events = await client.getAllEvents(start, end);
    render();
  } catch (err) {
    console.error("Failed to load events from HA", err);
  }
}

function renderConfig(): void {
  app.innerHTML = `
    <div class="config-screen">
      <h1>Verbindung zu Home Assistant</h1>
      <p>Gib die URL deines HA-Servers, ein Long-Lived Access Token und die Kalender-Entities ein (kommagetrennt). Lege in HA zuvor die Local Calendars für Fede, Pita, Bebos und Fede Trabajo an.</p>
      <label>HA URL
        <input id="cfg-url" type="url" placeholder="http://homeassistant.local:8123" />
      </label>
      <label>Access Token
        <input id="cfg-token" type="password" placeholder="eyJhbGciOi..." />
      </label>
      <label>Kalender-Entities
        <textarea id="cfg-entities" rows="3">calendar.fede, calendar.pita, calendar.bebos, calendar.fede_trabajo</textarea>
      </label>
      <button id="cfg-save">Speichern und verbinden</button>
    </div>
  `;
  document.getElementById("cfg-save")!.addEventListener("click", () => {
    const url = (document.getElementById("cfg-url") as HTMLInputElement).value.trim();
    const token = (document.getElementById("cfg-token") as HTMLInputElement).value.trim();
    const entitiesRaw = (document.getElementById("cfg-entities") as HTMLTextAreaElement).value;
    const entities = entitiesRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!url || !token || entities.length === 0) {
      alert("Bitte alle Felder ausfüllen");
      return;
    }
    saveConfig({ baseUrl: url.replace(/\/$/, ""), token, calendarEntities: entities });
    render();
    void refreshEvents();
  });
}

const demoMode = new URLSearchParams(window.location.search).has("demo");
const config = loadConfig();
if (demoMode) {
  state.events = buildDemoWeek(state.weekStart);
  render();
} else if (!config) {
  renderConfig();
} else {
  render();
  void refreshEvents();
}

function buildDemoWeek(weekStart: Date): CalendarEvent[] {
  const day = (offset: number, h: number, m: number): Date => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + offset);
    d.setHours(h, m, 0, 0);
    return d;
  };
  return [
    { uid: "d1", summary: "Fede Sport", start: day(0, 7, 0), end: day(0, 8, 0), allDay: false, memberId: "calendar.fede" },
    { uid: "d2", summary: "Bebos Schule", start: day(0, 8, 30), end: day(0, 14, 0), allDay: false, memberId: "calendar.bebos" },
    { uid: "d3", summary: "Pita Yoga", start: day(1, 19, 0), end: day(1, 20, 30), allDay: false, memberId: "calendar.pita" },
    { uid: "d4", summary: "Fede Trabajo Meeting", start: day(2, 10, 0), end: day(2, 11, 30), allDay: false, memberId: "calendar.fede_trabajo" },
    { uid: "d5", summary: "Bebos Geburtstag", start: day(3, 0, 0), end: day(4, 0, 0), allDay: true, memberId: "calendar.bebos" },
    { uid: "d6", summary: "Pita Abendessen", start: day(4, 22, 0), end: day(4, 23, 0), allDay: false, memberId: "calendar.pita" },
    { uid: "d7", summary: "Familie Wochenende", start: day(5, 12, 0), end: day(5, 18, 0), allDay: false, memberId: "calendar.fede" },
  ];
}
