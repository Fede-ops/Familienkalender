import "./style.css";
import { HAClient, loadConfig, saveConfig } from "./ha-client.ts";
import { addDays, renderWeekView, startOfWeek } from "./views/week.ts";
import { defaultModalState, renderEventModal } from "./views/event-modal.ts";
import type { ModalState } from "./views/event-modal.ts";
import type { CalendarEvent, FamilyMember } from "./types.ts";

const DEFAULT_MEMBERS: FamilyMember[] = [
  { id: "calendar.fede", name: "Fede", initial: "F", color: "#0A84FF" },
  { id: "calendar.pita", name: "Pita", initial: "P", color: "#30D158" },
  { id: "calendar.bebos", name: "Bebos", initial: "B", color: "#FF9F0A" },
  { id: "calendar.santi", name: "Santi", initial: "S", color: "#FF2D55" },
  { id: "calendar.fede_trabajo", name: "Fede T", initial: "F", color: "#BF5AF2" },
  { id: "calendar.pita_trabajo", name: "Pita T", initial: "P", color: "#64D2FF" },
];

interface AppState {
  weekStart: Date;
  events: CalendarEvent[];
  members: FamilyMember[];
  modal: ModalState | null;
}

const app = document.getElementById("app")!;
const state: AppState = {
  weekStart: startOfWeek(new Date()),
  events: [],
  members: DEFAULT_MEMBERS,
  modal: null,
};

// ── Rendering ──────────────────────────────────────────────────────────────

function render(): void {
  const weekHtml = renderWeekView({
    weekStart: state.weekStart,
    events: state.events,
    members: state.members,
    today: new Date(),
  });
  const modalHtml = state.modal ? renderEventModal(state.modal, state.members) : "";
  app.innerHTML = weekHtml + modalHtml;
  bindEvents();
  if (state.modal) {
    document.getElementById("modal-summary")?.focus();
  }
}

// ── Read form values before switching tabs / saving ────────────────────────

function syncFormToState(): void {
  if (!state.modal) return;
  const get = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T | null;
  const summaryEl = get<HTMLInputElement>("modal-summary");
  const startEl = get<HTMLInputElement>("modal-start");
  const endEl = get<HTMLInputElement>("modal-end");
  const locationEl = get<HTMLInputElement>("modal-location");
  const notesEl = get<HTMLTextAreaElement>("modal-notes");

  if (summaryEl) state.modal.summary = summaryEl.value;
  if (startEl?.value) state.modal.startDate = new Date(startEl.value);
  if (endEl?.value) state.modal.endDate = new Date(endEl.value);
  if (locationEl) state.modal.location = locationEl.value;
  if (notesEl) state.modal.notes = notesEl.value;
}

// ── Event binding ──────────────────────────────────────────────────────────

function bindEvents(): void {
  // Stop clicks inside modal sheet from bubbling to backdrop
  app.querySelectorAll<HTMLElement>("[data-stop-propagation]").forEach((el) => {
    el.addEventListener("click", (e) => e.stopPropagation());
  });

  app.querySelectorAll<HTMLElement>("[data-action]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const action = el.dataset.action;

      if (action === "nav-prev") {
        state.weekStart = addDays(state.weekStart, -7);
        render();
        void refreshEvents();
      } else if (action === "nav-next") {
        state.weekStart = addDays(state.weekStart, 7);
        render();
        void refreshEvents();
      } else if (action === "nav-today") {
        state.weekStart = startOfWeek(new Date());
        render();
        void refreshEvents();
      } else if (action === "add-event") {
        state.modal = defaultModalState(state.members);
        render();
      } else if (action === "close-modal") {
        state.modal = null;
        render();
      } else if (action === "modal-tab") {
        if (!state.modal) return;
        syncFormToState();
        state.modal.tab = el.dataset.tab as ModalState["tab"];
        render();
      } else if (action === "toggle-allday") {
        if (!state.modal) return;
        syncFormToState();
        state.modal.allDay = !state.modal.allDay;
        if (state.modal.allDay) {
          state.modal.startDate.setHours(0, 0, 0, 0);
          state.modal.endDate = addDays(state.modal.startDate, 1);
        }
        render();
      } else if (action === "select-member") {
        if (!state.modal) return;
        state.modal.memberId = el.dataset.memberId ?? state.modal.memberId;
        render();
      } else if (action === "save-event") {
        e.stopPropagation();
        syncFormToState();
        void saveEvent();
      }
    });
  });
}

// ── Save event ─────────────────────────────────────────────────────────────

async function saveEvent(): Promise<void> {
  if (!state.modal) return;
  const { summary, startDate, endDate, allDay, memberId, location, notes } = state.modal;

  if (!summary.trim()) {
    const input = document.getElementById("modal-summary") as HTMLInputElement | null;
    if (input) {
      input.classList.add("modal-title-input--error");
      input.focus();
    }
    return;
  }

  const config = loadConfig();
  if (config) {
    try {
      const client = new HAClient(config);
      await client.createEvent(memberId, summary.trim(), startDate, endDate, allDay, {
        location: location || undefined,
        description: notes || undefined,
      });
    } catch (err) {
      console.error("Failed to create event in HA:", err);
    }
  }

  // Optimistic insert so UI reflects the new event immediately
  state.events.push({
    uid: `local-${Date.now()}`,
    summary: summary.trim(),
    start: startDate,
    end: endDate,
    allDay,
    memberId,
    location: location || undefined,
    description: notes || undefined,
  });
  state.events.sort((a, b) => a.start.getTime() - b.start.getTime());
  state.modal = null;
  render();

  if (config) void refreshEvents();
}

// ── HA data refresh ────────────────────────────────────────────────────────

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
    console.error("Failed to load events from HA:", err);
  }
}

// ── Config screen ──────────────────────────────────────────────────────────

function renderConfig(): void {
  app.innerHTML = `
    <div class="config-screen">
      <h1>Verbindung zu Home Assistant</h1>
      <p>Gib die URL deines HA-Servers, ein Long-Lived Access Token und die Kalender-Entities ein (kommagetrennt).</p>
      <label>HA URL
        <input id="cfg-url" type="url" placeholder="http://homeassistant.local:8123" />
      </label>
      <label>Access Token
        <input id="cfg-token" type="password" placeholder="eyJhbGciOi…" />
      </label>
      <label>Kalender-Entities
        <textarea id="cfg-entities" rows="3">calendar.fede, calendar.pita, calendar.bebos, calendar.santi, calendar.fede_trabajo, calendar.pita_trabajo</textarea>
      </label>
      <button id="cfg-save">Speichern und verbinden</button>
    </div>
  `;
  document.getElementById("cfg-save")!.addEventListener("click", () => {
    const url = (document.getElementById("cfg-url") as HTMLInputElement).value.trim();
    const token = (document.getElementById("cfg-token") as HTMLInputElement).value.trim();
    const entitiesRaw = (document.getElementById("cfg-entities") as HTMLTextAreaElement).value;
    const entities = entitiesRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!url || !token || entities.length === 0) {
      alert("Bitte alle Felder ausfüllen");
      return;
    }
    saveConfig({ baseUrl: url.replace(/\/$/, ""), token, calendarEntities: entities });
    render();
    void refreshEvents();
  });
}

// ── Demo mode ──────────────────────────────────────────────────────────────

function buildDemoWeek(weekStart: Date): CalendarEvent[] {
  const day = (offset: number, h: number, m: number): Date => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + offset);
    d.setHours(h, m, 0, 0);
    return d;
  };
  return [
    { uid: "d1", summary: "Yoga", start: day(0, 7, 0), end: day(0, 8, 0), allDay: false, memberId: "calendar.fede" },
    { uid: "d2", summary: "Schule", start: day(0, 8, 30), end: day(0, 14, 0), allDay: false, memberId: "calendar.bebos" },
    { uid: "d3", summary: "Standup", start: day(1, 9, 30), end: day(1, 10, 0), allDay: false, memberId: "calendar.fede_trabajo" },
    { uid: "d4", summary: "Pilates", start: day(1, 19, 0), end: day(1, 20, 30), allDay: false, memberId: "calendar.pita" },
    { uid: "d5", summary: "Kundenmeeting", start: day(2, 10, 0), end: day(2, 11, 30), allDay: false, memberId: "calendar.fede_trabajo" },
    { uid: "d6", summary: "Bebos Geburtstag", start: day(3, 0, 0), end: day(4, 0, 0), allDay: true, memberId: "calendar.bebos" },
    { uid: "d7", summary: "Abendessen Familie", start: day(4, 19, 30), end: day(4, 21, 0), allDay: false, memberId: "calendar.pita" },
    { uid: "d8", summary: "Wandern", start: day(5, 9, 0), end: day(5, 16, 0), allDay: false, memberId: "calendar.fede" },
  ];
}

// ── Boot ───────────────────────────────────────────────────────────────────

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
