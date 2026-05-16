import "./style.css";
import { HAClient, loadConfig, saveConfig } from "./ha-client.ts";
import { addDays, renderWeekView, startOfWeek } from "./views/week.ts";
import type { CalendarEvent, FamilyMember } from "./types.ts";

const DEMO_MEMBERS: FamilyMember[] = [
  { id: "calendar.pita", name: "B", initial: "B", color: "#a83a4a" },
];

const DEMO_EVENTS: CalendarEvent[] = [
  {
    uid: "demo-pita",
    summary: "Pita",
    start: new Date(new Date().setHours(22, 0, 0, 0)),
    end: new Date(new Date().setHours(23, 0, 0, 0)),
    allDay: false,
    memberId: "calendar.pita",
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
  members: DEMO_MEMBERS,
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
      <p>Gib die URL deines HA-Servers, ein Long-Lived Access Token und die Kalender-Entities ein (kommagetrennt, z.B. <code>calendar.familie, calendar.pita</code>).</p>
      <label>HA URL
        <input id="cfg-url" type="url" placeholder="http://homeassistant.local:8123" />
      </label>
      <label>Access Token
        <input id="cfg-token" type="password" placeholder="eyJhbGciOi..." />
      </label>
      <label>Kalender-Entities
        <textarea id="cfg-entities" rows="3" placeholder="calendar.familie, calendar.pita"></textarea>
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

const config = loadConfig();
if (!config) {
  renderConfig();
} else {
  render();
  void refreshEvents();
}
