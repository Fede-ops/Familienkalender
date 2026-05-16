import "./style.css";
import { HAClient, loadConfig, saveConfig } from "./ha-client.ts";
import { addDays, renderWeekView, startOfWeek } from "./views/week.ts";
import { renderMonthView } from "./views/month.ts";
import { defaultModalState, renderEventModal } from "./views/event-modal.ts";
import type { ModalState } from "./views/event-modal.ts";
import {
  categorizeShoppingItem,
  loadShoppingItems,
  renderShoppingView,
  saveShoppingItems,
} from "./views/shopping.ts";
import {
  categorizeTodoItem,
  loadTodoItems,
  renderTodoView,
  saveTodoItems,
} from "./views/todo.ts";
import type { CalendarEvent, FamilyMember, ShoppingItem, TabKey, TodoItem } from "./types.ts";

// ── Event cache (LocalStorage) ─────────────────────────────────────────────

const EVENTS_CACHE_KEY = "calendar-events-v1";

function loadCachedEvents(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_CACHE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Array<Omit<CalendarEvent, "start" | "end"> & { start: string; end: string }>;
    return arr.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
  } catch {
    return [];
  }
}

function saveCachedEvents(events: CalendarEvent[]): void {
  try {
    const serialized = events.map((e) => ({ ...e, start: e.start.toISOString(), end: e.end.toISOString() }));
    localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(serialized));
  } catch {
    // ignore quota errors
  }
}

const DEFAULT_MEMBERS: FamilyMember[] = [
  { id: "calendar.fede", name: "Fede", initial: "F", color: "#0A84FF" },
  { id: "calendar.pita", name: "Pita", initial: "P", color: "#30D158" },
  { id: "calendar.bebos", name: "Bebos", initial: "B", color: "#FF9F0A" },
  { id: "calendar.santi", name: "Santi", initial: "S", color: "#FF2D55" },
  { id: "calendar.fede_trabajo", name: "Fede T", initial: "F", color: "#BF5AF2" },
  { id: "calendar.pita_trabajo", name: "Pita T", initial: "P", color: "#64D2FF" },
];

interface AppState {
  activeTab: TabKey;
  viewMode: "week" | "month";
  weekStart: Date;
  monthStart: Date;
  events: CalendarEvent[];
  members: FamilyMember[];
  modal: ModalState | null;
  shopping: ShoppingItem[];
  todos: TodoItem[];
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

const app = document.getElementById("app")!;
const state: AppState = {
  activeTab: "kalender",
  viewMode: "week",
  weekStart: startOfWeek(new Date()),
  monthStart: startOfMonth(new Date()),
  events: loadCachedEvents(),
  members: DEFAULT_MEMBERS,
  modal: null,
  shopping: loadShoppingItems(),
  todos: loadTodoItems(),
};

// ── Rendering ──────────────────────────────────────────────────────────────

function render(): void {
  let html = "";
  if (state.activeTab === "einkauf") {
    html = renderShoppingView(state.shopping);
  } else if (state.activeTab === "todo") {
    html = renderTodoView(state.todos);
  } else if (state.viewMode === "month") {
    html = renderMonthView({
      monthStart: state.monthStart,
      events: state.events,
      members: state.members,
      today: new Date(),
    });
    if (state.modal) html += renderEventModal(state.modal, state.members);
  } else {
    html = renderWeekView({
      weekStart: state.weekStart,
      events: state.events,
      members: state.members,
      today: new Date(),
    });
    if (state.modal) html += renderEventModal(state.modal, state.members);
  }
  app.innerHTML = html;
  bindEvents();
  if (state.modal) document.getElementById("modal-summary")?.focus();
  if (state.activeTab !== "kalender") {
    document.getElementById("list-input")?.focus();
  }
}

// ── Sync modal form to state before tab switch / save ──────────────────────

function syncModalForm(): void {
  if (!state.modal) return;
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
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

// ── Read list input ────────────────────────────────────────────────────────

function readListInput(): string {
  const el = document.getElementById("list-input") as HTMLInputElement | null;
  return el?.value.trim() ?? "";
}

function clearListInput(): void {
  const el = document.getElementById("list-input") as HTMLInputElement | null;
  if (el) el.value = "";
}

// ── Event binding ──────────────────────────────────────────────────────────

function bindEvents(): void {
  // Prevent modal sheet clicks from bubbling to backdrop
  app.querySelectorAll<HTMLElement>("[data-stop-propagation]").forEach((el) => {
    el.addEventListener("click", (e) => e.stopPropagation());
  });

  // Enter key on list input → add item
  const listInput = document.getElementById("list-input") as HTMLInputElement | null;
  if (listInput) {
    listInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (state.activeTab === "einkauf") addShoppingItem();
        if (state.activeTab === "todo") addTodoItem();
      }
    });
  }

  app.querySelectorAll<HTMLElement>("[data-action]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const action = el.dataset.action;

      // ── Tab bar ──────────────────────────────────────────────────────────
      if (action === "tab-kalender") {
        state.activeTab = "kalender";
        render();
      } else if (action === "tab-todo") {
        state.activeTab = "todo";
        render();
      } else if (action === "tab-einkauf") {
        state.activeTab = "einkauf";
        render();

      // ── View switching ───────────────────────────────────────────────────
      } else if (action === "view-month") {
        state.viewMode = "month";
        state.monthStart = startOfMonth(state.weekStart);
        render();
        void refreshEvents();
      } else if (action === "view-week") {
        state.viewMode = "week";
        render();
        void refreshEvents();

      // ── Calendar navigation ──────────────────────────────────────────────
      } else if (action === "nav-prev") {
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

      // ── Month navigation ─────────────────────────────────────────────────
      } else if (action === "nav-month-prev") {
        state.monthStart = addMonths(state.monthStart, -1);
        render();
        void refreshEvents();
      } else if (action === "nav-month-next") {
        state.monthStart = addMonths(state.monthStart, 1);
        render();
        void refreshEvents();
      } else if (action === "nav-month-today") {
        state.monthStart = startOfMonth(new Date());
        render();
        void refreshEvents();
      } else if (action === "day-tap") {
        const dateStr = el.dataset.date;
        if (dateStr) {
          const tapped = new Date(dateStr);
          state.viewMode = "week";
          state.weekStart = startOfWeek(tapped);
          render();
          void refreshEvents();
        }

      // ── Event modal ──────────────────────────────────────────────────────
      } else if (action === "add-event") {
        state.modal = defaultModalState(state.members);
        render();
      } else if (action === "close-modal") {
        state.modal = null;
        render();
      } else if (action === "modal-tab") {
        if (!state.modal) return;
        syncModalForm();
        state.modal.tab = el.dataset.tab as ModalState["tab"];
        render();
      } else if (action === "toggle-allday") {
        if (!state.modal) return;
        syncModalForm();
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
      } else if (action === "event-detail") {
        const uid = el.dataset.uid;
        const ev = state.events.find((x) => x.uid === uid);
        if (ev) showEventDetail(ev);

      } else if (action === "close-detail") {
        document.getElementById("event-detail-sheet")?.remove();

      } else if (action === "save-event") {
        e.stopPropagation();
        syncModalForm();
        void saveEvent();

      // ── Shopping list ────────────────────────────────────────────────────
      } else if (action === "add-item") {
        addShoppingItem();
      } else if (action === "toggle-item") {
        const id = el.dataset.id;
        if (!id) return;
        const item = state.shopping.find((i) => i.id === id);
        if (item) {
          item.checked = !item.checked;
          saveShoppingItems(state.shopping);
          render();
        }
      } else if (action === "clear-checked") {
        state.shopping = state.shopping.filter((i) => !i.checked);
        saveShoppingItems(state.shopping);
        render();

      // ── Todo list ────────────────────────────────────────────────────────
      } else if (action === "add-todo") {
        addTodoItem();
      } else if (action === "complete-todo") {
        const id = el.dataset.id;
        if (!id) return;
        const item = state.todos.find((i) => i.id === id);
        if (item) {
          item.completed = !item.completed;
          saveTodoItems(state.todos);
          render();
        }
      } else if (action === "clear-done-todos") {
        state.todos = state.todos.filter((i) => !i.completed);
        saveTodoItems(state.todos);
        render();
      }
    });
  });
}

function addShoppingItem(): void {
  const name = readListInput();
  if (!name) return;
  state.shopping.push({
    id: `s-${Date.now()}`,
    name,
    category: categorizeShoppingItem(name),
    checked: false,
  });
  saveShoppingItems(state.shopping);
  clearListInput();
  render();
  // Re-focus after render
  const input = document.getElementById("list-input") as HTMLInputElement | null;
  input?.focus();
}

function addTodoItem(): void {
  const title = readListInput();
  if (!title) return;
  state.todos.push({
    id: `t-${Date.now()}`,
    title,
    category: categorizeTodoItem(title),
    completed: false,
    createdAt: Date.now(),
  });
  saveTodoItems(state.todos);
  clearListInput();
  render();
  const input = document.getElementById("list-input") as HTMLInputElement | null;
  input?.focus();
}

// ── Event detail sheet ─────────────────────────────────────────────────────

function showEventDetail(ev: CalendarEvent): void {
  const member = state.members.find((m) => m.id === ev.memberId);
  const color = member?.color ?? "#8E8E93";
  const grad = `linear-gradient(135deg,${color} 0%,${color}88 100%)`;

  const pad = (n: number) => String(n).padStart(2, "0");
  const fmtDate = (d: Date) =>
    `${d.getDate()}. ${["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][d.getMonth()]} ${d.getFullYear()}`;
  const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const when = ev.allDay
    ? fmtDate(ev.start)
    : `${fmtDate(ev.start)}, ${fmtTime(ev.start)} – ${fmtTime(ev.end)}`;

  const html = `<div id="event-detail-sheet" class="detail-backdrop" data-action="close-detail">
    <div class="detail-sheet" data-stop-propagation>
      <div class="detail-handle"></div>
      <div class="detail-bar" style="background:${grad};"></div>
      <div class="detail-body">
        <p class="detail-title">${ev.summary}</p>
        <p class="detail-meta">${when}</p>
        ${member ? `<div class="detail-member"><span class="detail-avatar" style="background:${grad};">${member.initial}</span><span class="detail-member-name">${member.name}</span></div>` : ""}
        ${ev.location ? `<p class="detail-location">📍 ${ev.location}</p>` : ""}
        ${ev.description ? `<p class="detail-notes">${ev.description}</p>` : ""}
      </div>
      <button class="detail-close" data-action="close-detail">Schließen</button>
    </div>
  </div>`;

  const el = document.createElement("div");
  el.innerHTML = html;
  document.body.appendChild(el.firstElementChild!);

  // bind close actions on the new element
  document.getElementById("event-detail-sheet")!
    .querySelectorAll<HTMLElement>("[data-action]")
    .forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (btn.dataset.action === "close-detail") {
          document.getElementById("event-detail-sheet")?.remove();
        }
        if (btn.dataset["stopPropagation"] !== undefined) e.stopPropagation();
      });
    });
  document.getElementById("event-detail-sheet")!
    .querySelectorAll<HTMLElement>("[data-stop-propagation]")
    .forEach((el) => el.addEventListener("click", (e) => e.stopPropagation()));
}

// ── Save calendar event ────────────────────────────────────────────────────

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
  saveCachedEvents(state.events);
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
    let rangeStart: Date;
    let rangeEnd: Date;
    if (state.viewMode === "month") {
      rangeStart = state.monthStart;
      rangeEnd = addMonths(state.monthStart, 1);
    } else {
      rangeStart = state.weekStart;
      rangeEnd = addDays(state.weekStart, 7);
    }
    const fresh = await client.getAllEvents(rangeStart, rangeEnd);
    state.events = fresh;
    saveCachedEvents(fresh);
    dismissHAError();
    if (state.activeTab === "kalender") render();
  } catch (err) {
    console.error("Failed to load events from HA:", err);
    showHAError();
  }
}

function showHAError(): void {
  if (document.getElementById("ha-error-banner")) return;
  const el = document.createElement("div");
  el.id = "ha-error-banner";
  el.className = "ha-error-banner";
  el.textContent = "⚠️ Home Assistant nicht erreichbar — zeige gespeicherte Daten";
  el.addEventListener("click", () => el.remove());
  document.body.appendChild(el);
}

function dismissHAError(): void {
  document.getElementById("ha-error-banner")?.remove();
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
    const raw = (document.getElementById("cfg-entities") as HTMLTextAreaElement).value;
    const entities = raw.split(",").map((s) => s.trim()).filter(Boolean);
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
