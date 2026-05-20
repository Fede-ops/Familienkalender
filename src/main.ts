import "./style.css";
import { HAClient, loadConfig, saveConfig } from "./ha-client.ts";
import {
  fetchMobileAppServices,
  loadNotifConfig,
  prettyServiceName,
  saveNotifConfig,
  sendTestNotification,
  type NotifConfig,
} from "./notifications.ts";
declare const __BUILD_TIME__: string;

// Reload when a new service worker takes over — ensures fresh JS is executed.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
  // Proactively check for a SW update on every page load.
  navigator.serviceWorker.ready.then((reg) => reg.update()).catch(() => {});
}
import { addDays, renderWeekView, startOfWeek } from "./views/week.ts";
import { renderMonthView } from "./views/month.ts";
import { defaultModalState, renderEventModal } from "./views/event-modal.ts";
import type { ModalState } from "./views/event-modal.ts";
import {
  categorizeShoppingItem,
  loadShoppingItems,
  renderShoppingView,
  saveShoppingItems,
  syncShoppingFromHA,
} from "./views/shopping.ts";
import {
  categorizeTodoItem,
  loadTodoItems,
  renderTodoView,
  saveTodoItems,
  syncTodosFromHA,
  type TodoViewState,
} from "./views/todo.ts";
import type { CalendarEvent, FamilyMember, ShoppingItem, TabKey, TodoItem } from "./types.ts";

// ── Offline queue ──────────────────────────────────────────────────────────

const QUEUE_KEY = "calendar-offline-queue";

interface QueuedEvent {
  id: string;
  entityId: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  description?: string;
  attempts: number;
  createdAt: number;
}

const QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // drop items older than 24 h

function loadQueue(): QueuedEvent[] {
  try {
    const all = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedEvent[];
    const cutoff = Date.now() - QUEUE_MAX_AGE_MS;
    return all.filter((e) => !e.createdAt || e.createdAt > cutoff);
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedEvent[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

function enqueue(ev: Omit<QueuedEvent, "id" | "attempts" | "createdAt">): void {
  const q = loadQueue();
  // Don't double-enqueue the same event (same entity + start + summary)
  const alreadyQueued = q.some(
    (existing) =>
      existing.entityId === ev.entityId &&
      existing.summary === ev.summary &&
      existing.start === ev.start,
  );
  if (alreadyQueued) return;
  q.push({ id: `q-${Date.now()}`, attempts: 0, createdAt: Date.now(), ...ev });
  saveQueue(q);
  updateQueueBadge();
}

function updateQueueBadge(): void {
  const q = loadQueue();
  const existing = document.getElementById("offline-badge");
  if (q.length === 0) {
    existing?.remove();
    return;
  }
  const el = existing ?? (() => {
    const div = document.createElement("div");
    div.id = "offline-badge";
    div.className = "offline-badge";
    // Tap to clear stuck events
    div.addEventListener("click", () => {
      saveQueue([]);
      div.remove();
    });
    document.body.appendChild(div);
    return div;
  })();
  el.textContent = `✓ Gespeichert · ${q.length} warten auf HA-Sync`;
}

let processingQueue = false;

async function processQueue(): Promise<void> {
  // Guard against concurrent invocations (boot + online event + refreshEvents all fire at once)
  if (processingQueue) return;
  processingQueue = true;
  try {
    const config = loadConfig();
    if (!config || !navigator.onLine) return;
    const q = loadQueue();
    if (q.length === 0) return;

    // Skip items already confirmed in HA (guards against the timeout double-create
    // scenario where createEvent reached HA but timed out before we got a response).
    // Only match against real HA UIDs — local- placeholders are not yet in HA.
    const toCreate = q.filter((item) => {
      const itemStartMs = new Date(item.start).getTime();
      return !state.events.some(
        (e) =>
          !e.uid.startsWith("local-") &&
          e.memberId === item.entityId &&
          e.summary.toLowerCase() === item.summary.toLowerCase() &&
          Math.abs(e.start.getTime() - itemStartMs) < 60_000,
      );
    });

    const client = new HAClient(config);
    const remaining: QueuedEvent[] = [];

    for (const item of toCreate) {
      try {
        await client.createEvent(
          item.entityId,
          item.summary,
          new Date(item.start),
          new Date(item.end),
          item.allDay,
          { location: item.location, description: item.description },
        );
      } catch {
        const updated = { ...item, attempts: (item.attempts ?? 0) + 1 };
        if (updated.attempts < 5) remaining.push(updated);
        // silently drop after 5 failed attempts
      }
    }

    saveQueue(remaining);
    updateQueueBadge();
    // Delay refresh so HA has time to index the newly created events before we fetch.
    if (remaining.length < toCreate.length) setTimeout(() => void refreshEvents(), 3000);
  } finally {
    processingQueue = false;
  }
}

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
  filterMemberIds: string[];
  todoFilterMemberId: string;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

// ── Drag-and-drop state (outside AppState to survive renders) ─────────────

interface DragState {
  uid: string;
  originalEl: HTMLElement;
  ghost: HTMLElement | null;
  timer: ReturnType<typeof setTimeout> | null;
  startX: number;
  startY: number;
  offX: number;
  offY: number;
  active: boolean;
  currentTarget: HTMLElement | null;
  earlyMove: (e: TouchEvent) => void;
}

let drag: DragState | null = null;

// UIDs deleted locally — filtered from every HA refresh so events don't
// reappear. Persisted to localStorage across page reloads.
// Value: expiry timestamp in ms, or -1 = permanent (HA delete not yet confirmed).
const PENDING_DELETES_KEY = "nanoclaw-pending-deletes";
const PERMANENT = -1;

function loadPendingDeletes(): Map<string, number> {
  try {
    const raw = localStorage.getItem(PENDING_DELETES_KEY);
    if (!raw) return new Map();
    const arr = JSON.parse(raw) as [string, number][];
    const now = Date.now();
    // Keep entries that are permanent (-1) or not yet expired
    return new Map(arr.filter(([, exp]) => exp === PERMANENT || exp > now));
  } catch {
    return new Map();
  }
}

function savePendingDeletes(map: Map<string, number>): void {
  try {
    localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify([...map]));
  } catch { /* ignore */ }
  // Sync permanent deletions to HA so all devices honour the same hidden UIDs.
  const permanent = [...map].filter(([, exp]) => exp === PERMANENT).map(([uid]) => uid);
  const cfg = loadConfig();
  if (!cfg) return;
  // Always POST — even with empty list — so the sensor always reflects current state.
  void fetch(`${cfg.baseUrl}/api/states/sensor.familienkalender_hidden_uids`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ state: String(permanent.length), attributes: { uids: permanent, ts: Date.now() } }),
  }).catch(() => {});
}

async function syncHiddenUidsFromHA(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg) return;
  try {
    const res = await fetch(`${cfg.baseUrl}/api/states/sensor.familienkalender_hidden_uids`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    // 404 means HA was restarted and lost the in-memory sensor state — fall
    // through so we re-publish our local PERMANENT list below.
    let uids: string[] = [];
    if (res.ok) {
      const data = (await res.json()) as { attributes?: { uids?: string[] } };
      uids = data.attributes?.uids ?? [];
    }
    let changed = false;
    for (const uid of uids) {
      if (!pendingDeletes.has(uid)) {
        pendingDeletes.set(uid, PERMANENT);
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify([...pendingDeletes]));
      state.events = state.events.filter((e) => pendingDeletes.get(e.uid) !== PERMANENT);
      render();
    }
    // Always re-publish our local PERMANENT list. REST-API sensor states do
    // NOT persist across HA restarts, so without this re-publish the cross-
    // device hidden list quietly disappears whenever HA reboots, and deleted
    // events come back on every device after their localStorage expires.
    const localPermanent = [...pendingDeletes].filter(([, exp]) => exp === PERMANENT).map(([u]) => u);
    if (localPermanent.length > 0) {
      void fetch(`${cfg.baseUrl}/api/states/sensor.familienkalender_hidden_uids`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ state: String(localPermanent.length), attributes: { uids: localPermanent, ts: Date.now() } }),
      }).catch(() => {});
    }
  } catch { /* ignore */ }
}

// uid → expiry ms (-1 = permanent until HA confirms)
const pendingDeletes: Map<string, number> = loadPendingDeletes();

const app = document.getElementById("app")!;
const TODO_FILTER_KEY = "nanoclaw-todo-filter";

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
  filterMemberIds: [],
  todoFilterMemberId: localStorage.getItem(TODO_FILTER_KEY) ?? "",
};

function visibleEvents(): CalendarEvent[] {
  if (state.filterMemberIds.length === 0) return state.events;
  return state.events.filter((e) => state.filterMemberIds.includes(e.memberId ?? ""));
}

// ── Rendering ──────────────────────────────────────────────────────────────

function render(): void {
  let html = "";
  if (state.activeTab === "einkauf") {
    html = renderShoppingView(state.shopping);
  } else if (state.activeTab === "todo") {
    const filteredTodos = state.todoFilterMemberId
      ? state.todos.filter((t) => t.memberId === state.todoFilterMemberId)
      : state.todos;
    const todoViewState: TodoViewState = {
      items: filteredTodos,
      members: state.members,
      activeMemberId: state.todoFilterMemberId,
    };
    html = renderTodoView(todoViewState);
  } else if (state.viewMode === "month") {
    html = renderMonthView({
      monthStart: state.monthStart,
      events: visibleEvents(),
      members: state.members,
      today: new Date(),
    });
    if (state.modal) html += renderEventModal(state.modal, state.members);
  } else {
    html = renderWeekView({
      weekStart: state.weekStart,
      events: visibleEvents(),
      members: state.members,
      today: new Date(),
      filterActive: state.filterMemberIds.length > 0,
    });
    if (state.modal) html += renderEventModal(state.modal, state.members);
  }
  app.innerHTML = html;
  app.dataset.buildTime = __BUILD_TIME__;
  // Show build date in toolbar so users can confirm which version is running.
  const toolbar = app.querySelector<HTMLElement>(".toolbar");
  if (toolbar) {
    const d = new Date(__BUILD_TIME__);
    const label = `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    const chip = document.createElement("span");
    chip.className = "build-chip";
    chip.textContent = `v${label}`;
    chip.title = __BUILD_TIME__;
    toolbar.appendChild(chip);
  }
  bindEvents();
  setupDragDrop();
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

// ── Drag-and-drop ──────────────────────────────────────────────────────────

function setupDragDrop(): void {
  app.querySelectorAll<HTMLElement>("[data-action='event-detail'][data-uid]").forEach((el) => {
    el.addEventListener("touchstart", (e) => onEventTouchStart(e, el), { passive: true });
  });
}

function onEventTouchStart(e: TouchEvent, el: HTMLElement): void {
  const uid = el.dataset.uid;
  if (!uid || state.modal) return;
  const touch = e.touches[0];

  const earlyMove = (ev: TouchEvent) => {
    if (!drag || drag.active) return;
    if (Math.abs(ev.touches[0].clientX - drag.startX) > 8 ||
        Math.abs(ev.touches[0].clientY - drag.startY) > 8) {
      cancelDrag();
    }
  };

  drag = {
    uid,
    originalEl: el,
    ghost: null,
    timer: setTimeout(() => activateDrag(), 350),
    startX: touch.clientX,
    startY: touch.clientY,
    offX: 0,
    offY: 0,
    active: false,
    currentTarget: null,
    earlyMove,
  };
  document.addEventListener("touchmove", earlyMove, { passive: true });
}

function activateDrag(): void {
  if (!drag) return;
  drag.active = true;
  document.removeEventListener("touchmove", drag.earlyMove);
  navigator.vibrate?.(40);

  const el = drag.originalEl;
  const rect = el.getBoundingClientRect();
  drag.offX = drag.startX - rect.left;
  drag.offY = drag.startY - rect.top;

  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.className = el.className + " event--ghost";
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;pointer-events:none;z-index:1000;`;
  document.body.appendChild(ghost);
  drag.ghost = ghost;
  el.style.opacity = "0.25";
  document.body.classList.add("is-dragging");

  document.addEventListener("touchmove", onDragMove, { passive: false });
  document.addEventListener("touchend", onDragEnd, { once: true });
  document.addEventListener("touchcancel", cancelDrag, { once: true });
}

function onDragMove(e: TouchEvent): void {
  if (!drag?.active || !drag.ghost) return;
  e.preventDefault();
  const touch = e.touches[0];
  drag.ghost.style.left = `${touch.clientX - drag.offX}px`;
  drag.ghost.style.top = `${touch.clientY - drag.offY}px`;

  const row = document.elementFromPoint(touch.clientX, touch.clientY)
    ?.closest<HTMLElement>(".week-row");
  if (drag.currentTarget !== row) {
    drag.currentTarget?.classList.remove("week-row--drop-target");
    row?.classList.add("week-row--drop-target");
    drag.currentTarget = row ?? null;
  }
}

function onDragEnd(e: TouchEvent): void {
  if (!drag?.active) return;
  document.removeEventListener("touchmove", onDragMove);
  const touch = e.changedTouches[0];
  const row = document.elementFromPoint(touch.clientX, touch.clientY)
    ?.closest<HTMLElement>(".week-row");

  drag.currentTarget?.classList.remove("week-row--drop-target");
  row?.classList.remove("week-row--drop-target");
  drag.ghost?.remove();
  drag.originalEl.style.opacity = "";
  document.body.classList.remove("is-dragging");

  const uid = drag.uid;
  const dateStr = row?.dataset.date;
  drag = null;

  if (dateStr) void moveEvent(uid, new Date(dateStr));
}

function cancelDrag(): void {
  if (!drag) return;
  if (drag.timer) clearTimeout(drag.timer);
  document.removeEventListener("touchmove", drag.earlyMove);
  document.removeEventListener("touchmove", onDragMove);
  document.removeEventListener("touchend", onDragEnd);
  if (drag.ghost) drag.ghost.remove();
  drag.originalEl.style.opacity = "";
  document.body.classList.remove("is-dragging");
  drag.currentTarget?.classList.remove("week-row--drop-target");
  drag = null;
}

async function moveEvent(uid: string, targetDay: Date): Promise<void> {
  const ev = state.events.find((e) => e.uid === uid);
  if (!ev) return;

  const newStart = new Date(targetDay);
  newStart.setHours(ev.start.getHours(), ev.start.getMinutes(), 0, 0);
  const duration = ev.end.getTime() - ev.start.getTime();
  const newEnd = new Date(newStart.getTime() + duration);

  const updated: CalendarEvent = { ...ev, start: newStart, end: newEnd };
  const idx = state.events.findIndex((e) => e.uid === uid);
  if (idx >= 0) state.events[idx] = updated;
  state.events.sort((a, b) => a.start.getTime() - b.start.getTime());
  saveCachedEvents(state.events);
  render();

  const config = loadConfig();
  if (config && !uid.startsWith("local-") && navigator.onLine) {
    try {
      const client = new HAClient(config);
      await client.updateEvent(ev.memberId ?? "", uid, ev.summary, newStart, newEnd, ev.allDay, {
        location: ev.location,
        description: ev.description,
      });
    } catch (err) {
      console.error("Failed to move event in HA:", err);
    }
    // No refreshEvents() here — same race condition as delete: HA needs time
    // to process the update before we fetch again. Local state is already correct.
  }
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

      // ── Todo member filter ───────────────────────────────────────────────
      } else if (action === "todo-filter") {
        state.todoFilterMemberId = el.dataset.memberId ?? "";
        localStorage.setItem(TODO_FILTER_KEY, state.todoFilterMemberId);
        render();

      // ── Filter / Search ──────────────────────────────────────────────────
      } else if (action === "filter") {
        showFilterSheet();
      } else if (action === "search") {
        showSearchSheet();
      }
    });
  });
}

// ── Notification settings sheet ────────────────────────────────────────────

function showNotificationsSheet(): void {
  document.getElementById("notif-sheet")?.remove();

  const cfg: NotifConfig = loadNotifConfig() ?? { memberServices: {} };
  let availableServices: string[] = [];

  function escHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function haYaml(mapping: Record<string, string[]>): string {
    // Build a list of (member, services) pairs for the iteration. Only
    // members that have at least one service configured.
    const entitiesUsed = state.members.filter((m) => (mapping[m.id]?.length ?? 0) > 0);
    if (entitiesUsed.length === 0) {
      return "# Noch kein Familienmitglied einem Gerät zugeordnet.\n# Wähle oben mindestens einen Empfänger pro Person aus.";
    }
    const entityIds = entitiesUsed.map((m) => `        - ${m.id}`).join("\n");
    const forEachItems = entitiesUsed
      .map((m) => {
        const svcs = (mapping[m.id] ?? []).map((s) => `"${s}"`).join(", ");
        return `        - {entity: "${m.id}", name: "${m.name}", services: [${svcs}]}`;
      })
      .join("\n");
    return `# Einstellungen → Automatisierungen → + → YAML:
alias: "Familienkalender Tagesübersicht"
trigger:
  - platform: time
    at: "09:00:00"
action:
  - action: calendar.get_events
    target:
      entity_id:
${entityIds}
    data:
      start_date_time: "{{ now().strftime('%Y-%m-%d 00:00:00') }}"
      end_date_time: "{{ now().strftime('%Y-%m-%d 23:59:59') }}"
    response_variable: today
  - repeat:
      for_each:
${forEachItems}
      sequence:
        - variables:
            evs: "{{ today[repeat.item.entity].events }}"
            msg_title: "📅 {{ repeat.item.name }} – Heute"
            msg_body: >-
              {%- set ns = namespace(parts=[]) -%}
              {%- for e in evs -%}
                {%- if e.all_day -%}
                  {%- set ns.parts = ns.parts + [e.summary] -%}
                {%- else -%}
                  {%- set ns.parts = ns.parts + [(e.start | string)[11:16] + ' ' + e.summary] -%}
                {%- endif -%}
              {%- endfor -%}
              {%- if ns.parts | length == 0 -%}Keine Termine heute{%- else -%}{{ ns.parts | join(' · ') }}{%- endif -%}
            target_services: "{{ repeat.item.services }}"
        - repeat:
            for_each: "{{ target_services }}"
            sequence:
              - action: "notify.{{ repeat.item }}"
                data:
                  title: "{{ msg_title }}"
                  message: "{{ msg_body }}"
mode: single`;
  }

  function readMapping(sheet: HTMLElement): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const m of state.members) {
      const checked = [...sheet.querySelectorAll<HTMLInputElement>(
        `.notif-service-checkbox[data-member-id="${m.id}"]:checked`,
      )].map((el) => el.dataset.service!).filter(Boolean);
      if (checked.length > 0) result[m.id] = checked;
    }
    return result;
  }

  function renderMemberList(): string {
    if (availableServices.length === 0) {
      return `<p class="notif-warning">Keine <code>notify.mobile_app_*</code> Services in HA gefunden. ` +
        `Bitte installiere die <b>Home Assistant Companion App</b> auf den Geräten, melde dich an, ` +
        `und tippe dann oben auf „Geräte aktualisieren".</p>`;
    }
    return state.members.map((m) => {
      const selected = new Set(cfg.memberServices[m.id] ?? []);
      const serviceRows = availableServices.map((svc) => {
        const checked = selected.has(svc) ? " checked" : "";
        return `<label class="notif-service-row">
          <input type="checkbox" class="notif-service-checkbox" data-member-id="${m.id}" data-service="${svc}"${checked}>
          <span class="notif-service-name">${escHtml(prettyServiceName(svc))}</span>
          <span class="notif-service-slug">${escHtml(svc)}</span>
        </label>`;
      }).join("");
      return `<div class="notif-member-block">
        <div class="notif-member-header">
          <span class="notif-member-dot" style="background:${m.color};box-shadow:0 0 5px ${m.color}88;"></span>
          <span class="notif-member-name">${escHtml(m.name)}</span>
        </div>
        <div class="notif-service-list">${serviceRows}</div>
      </div>`;
    }).join("");
  }

  const html = `<div id="notif-sheet" class="sheet-backdrop">
    <div class="bottom-sheet bottom-sheet--large" data-stop-propagation>
      <div class="bottom-sheet__handle"></div>
      <div class="notif-sheet-header">
        <p class="bottom-sheet__title">🔔 Benachrichtigungen</p>
        <p class="notif-hint">
          Sendet Termin-Erinnerungen über die <b>Home Assistant Companion App</b>.
          Wähle pro Familienmitglied, welche Geräte (iPhone, iPad, …) seine Termine bekommen sollen.
        </p>
        <div class="notif-actions">
          <button id="notif-refresh-btn" class="notif-yaml-btn">Geräte aktualisieren</button>
        </div>
      </div>
      <div id="notif-member-list" class="notif-member-list">
        <p class="notif-hint">Lade Geräte…</p>
      </div>
      <div class="notif-sheet-footer">
        <div class="notif-actions">
          <button id="notif-save-btn" class="notif-save-btn">Speichern</button>
          <button id="notif-test-btn" class="notif-yaml-btn">Test senden</button>
        </div>
        <div id="notif-status" class="notif-status"></div>
        <button id="notif-yaml-btn" class="notif-yaml-btn">HA Automation YAML anzeigen</button>
        <div id="notif-yaml-block" class="notif-yaml-block" style="display:none;">
          <pre id="notif-yaml-pre" class="notif-yaml-pre"></pre>
          <button id="notif-yaml-copy" class="notif-yaml-copy-btn">Kopieren</button>
        </div>
      </div>
    </div>
  </div>`;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const sheet = wrapper.firstElementChild as HTMLElement;
  document.body.appendChild(sheet);

  sheet.addEventListener("click", (e) => {
    if ((e.target as HTMLElement) === sheet) sheet.remove();
  });
  sheet.querySelector<HTMLElement>("[data-stop-propagation]")!
    .addEventListener("click", (e) => e.stopPropagation());

  function showStatus(msg: string, ok: boolean): void {
    const el = sheet.querySelector<HTMLElement>("#notif-status")!;
    el.textContent = msg;
    el.style.color = ok ? "#30D158" : "#FF453A";
  }

  async function refreshServices(): Promise<void> {
    const listEl = sheet.querySelector<HTMLElement>("#notif-member-list")!;
    listEl.innerHTML = `<p class="notif-hint">Lade Geräte…</p>`;
    try {
      availableServices = await fetchMobileAppServices();
      listEl.innerHTML = renderMemberList();
      if (availableServices.length > 0) {
        showStatus(`${availableServices.length} Geräte gefunden ✓`, true);
      }
    } catch (err) {
      listEl.innerHTML = `<p class="notif-warning">${escHtml(err instanceof Error ? err.message : String(err))}</p>`;
      showStatus(err instanceof Error ? err.message : String(err), false);
    }
  }

  sheet.querySelector<HTMLElement>("#notif-refresh-btn")!
    .addEventListener("click", () => void refreshServices());

  sheet.querySelector<HTMLElement>("#notif-save-btn")!.addEventListener("click", () => {
    const mapping = readMapping(sheet);
    saveNotifConfig({ memberServices: mapping });
    const count = Object.values(mapping).reduce((acc, arr) => acc + arr.length, 0);
    showStatus(`Gespeichert · ${count} Empfänger-Zuordnungen`, true);
  });

  sheet.querySelector<HTMLElement>("#notif-test-btn")!.addEventListener("click", async () => {
    const mapping = readMapping(sheet);
    const allServices = new Set<string>();
    for (const services of Object.values(mapping)) {
      for (const svc of services) allServices.add(svc);
    }
    if (allServices.size === 0) {
      showStatus("Keine Geräte ausgewählt — bitte zuerst Empfänger zuordnen", false);
      return;
    }
    const btn = sheet.querySelector<HTMLElement>("#notif-test-btn")!;
    btn.textContent = "…";
    btn.setAttribute("disabled", "");
    const results = await Promise.allSettled(
      [...allServices].map((svc) =>
        sendTestNotification(svc, "📅 Familienkalender Test", "Test-Benachrichtigung aus der App. Wenn du das siehst, funktioniert es."),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length === 0) {
      showStatus(`Test an ${allServices.size} Gerät(e) gesendet ✓`, true);
    } else {
      const firstErr = (failed[0] as PromiseRejectedResult).reason;
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      showStatus(`${failed.length}/${allServices.size} fehlgeschlagen: ${msg}`, false);
    }
    btn.textContent = "Test senden";
    btn.removeAttribute("disabled");
  });

  sheet.querySelector<HTMLElement>("#notif-yaml-btn")!.addEventListener("click", () => {
    const block = sheet.querySelector<HTMLElement>("#notif-yaml-block")!;
    const btn = sheet.querySelector<HTMLElement>("#notif-yaml-btn")!;
    const visible = block.style.display !== "none";
    if (!visible) {
      const mapping = readMapping(sheet);
      sheet.querySelector<HTMLElement>("#notif-yaml-pre")!.textContent = haYaml(mapping);
    }
    block.style.display = visible ? "none" : "block";
    btn.textContent = visible ? "HA Automation YAML anzeigen" : "YAML ausblenden";
  });

  sheet.querySelector<HTMLElement>("#notif-yaml-copy")!.addEventListener("click", async () => {
    const pre = sheet.querySelector<HTMLElement>("#notif-yaml-pre")!;
    await navigator.clipboard.writeText(pre.textContent ?? "").catch(() => {});
    const btn = sheet.querySelector<HTMLElement>("#notif-yaml-copy")!;
    btn.textContent = "Kopiert ✓";
    setTimeout(() => { btn.textContent = "Kopieren"; }, 2000);
  });

  // Auto-load on open
  void refreshServices();
}

// ── Filter sheet ───────────────────────────────────────────────────────────

function showFilterSheet(): void {
  document.getElementById("filter-sheet")?.remove();

  const checkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>`;

  function buildSheet(): HTMLElement {
    const active = state.filterMemberIds;
    const allOn = active.length === 0;

    const rows = state.members.map((m) => {
      const on = allOn || active.includes(m.id);
      return `<button class="filter-row${on ? " filter-row--on" : ""}" data-member-id="${m.id}">
        <span class="filter-row__dot" style="background:${m.color};box-shadow:0 0 5px ${m.color}88;"></span>
        <span class="filter-row__name">${m.name}</span>
        <span class="filter-row__check">${on ? checkSvg : ""}</span>
      </button>`;
    }).join("");

    const dupeCount = findDuplicateUids(state.events).length;
    const dupeRow = dupeCount > 0
      ? `<button class="filter-row filter-dupe-row" id="filter-dupe-btn">
          <span class="filter-row__name" style="color:#FF9F0A;">⚠ ${dupeCount} doppelte Einträge</span>
          <span style="font-size:12px;font-weight:700;color:#FF9F0A;white-space:nowrap;">Bereinigen</span>
        </button>`
      : `<button class="filter-row filter-dupe-row" id="filter-dupe-btn" style="opacity:.5;">
          <span class="filter-row__name">Duplikate prüfen</span>
        </button>`;

    const html = `<div id="filter-sheet" class="sheet-backdrop">
      <div class="bottom-sheet" data-stop-propagation>
        <div class="bottom-sheet__handle"></div>
        <p class="bottom-sheet__title">Nach Person filtern</p>
        <button class="filter-row filter-row--all${allOn ? " filter-row--on" : ""}" data-action="filter-all">
          <span class="filter-row__name" style="font-weight:600;">Alle anzeigen</span>
          <span class="filter-row__check">${allOn ? checkSvg : ""}</span>
        </button>
        <div class="filter-member-list">${rows}</div>
        <div style="margin-top:8px;border-top:1px solid rgba(120,120,128,0.2);padding-top:4px;">
          ${dupeRow}
          <button class="filter-row filter-notif-row" id="filter-notif-btn">
            <span class="filter-row__name">🔔 Benachrichtigungen</span>
            <span style="font-size:12px;font-weight:600;color:rgba(235,235,245,0.5);">Einrichten ›</span>
          </button>
        </div>
      </div>
    </div>`;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    return wrapper.firstElementChild as HTMLElement;
  }

  function mount(): void {
    const sheet = buildSheet();
    document.body.appendChild(sheet);

    sheet.addEventListener("click", (e) => {
      if ((e.target as HTMLElement) === sheet) { sheet.remove(); }
    });
    sheet.querySelector<HTMLElement>("[data-stop-propagation]")!
      .addEventListener("click", (e) => e.stopPropagation());
    sheet.querySelector<HTMLElement>("[data-action='filter-all']")!
      .addEventListener("click", () => {
        state.filterMemberIds = [];
        sheet.remove();
        render();
        mount();
      });
    sheet.querySelectorAll<HTMLElement>("[data-member-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.memberId!;
        if (state.filterMemberIds.includes(id)) {
          state.filterMemberIds = state.filterMemberIds.filter((x) => x !== id);
        } else {
          state.filterMemberIds = [...state.filterMemberIds, id];
        }
        sheet.remove();
        render();
        mount();
      });
    });
    sheet.querySelector<HTMLElement>("#filter-dupe-btn")?.addEventListener("click", () => {
      sheet.remove();
      void runFullDuplicateCleanup();
    });
    sheet.querySelector<HTMLElement>("#filter-notif-btn")?.addEventListener("click", () => {
      sheet.remove();
      showNotificationsSheet();
    });
  }

  mount();
}

// ── Search sheet ───────────────────────────────────────────────────────────

function showSearchSheet(): void {
  document.getElementById("search-sheet")?.remove();

  const html = `<div id="search-sheet" class="search-backdrop">
    <div class="search-sheet" data-stop-propagation>
      <div class="search-input-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="search-icon"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input id="search-input" class="search-input" placeholder="Termin suchen…" autocomplete="off" autocorrect="off" />
        <button class="search-close" id="search-close">✕</button>
      </div>
      <div id="search-results" class="search-results"></div>
    </div>
  </div>`;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const sheet = wrapper.firstElementChild as HTMLElement;
  document.body.appendChild(sheet);

  const input = document.getElementById("search-input") as HTMLInputElement;
  const resultsEl = document.getElementById("search-results")!;

  function escHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderResults(query: string): void {
    if (!query.trim()) {
      resultsEl.innerHTML = `<p class="search-hint">Tippe um Termine zu suchen</p>`;
      return;
    }
    const q = query.toLowerCase();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const fmtDate = (d: Date) =>
      `${["Mo","Di","Mi","Do","Fr","Sa","So"][d.getDay() === 0 ? 6 : d.getDay() - 1]}, ${d.getDate()}. ${["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][d.getMonth()]}`;
    const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    const matches = state.events
      .filter((e) => e.summary.toLowerCase().includes(q) || (e.description ?? "").toLowerCase().includes(q) || (e.location ?? "").toLowerCase().includes(q))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (matches.length === 0) {
      resultsEl.innerHTML = `<p class="search-hint">Keine Treffer im geladenen Zeitraum</p>`;
      return;
    }

    resultsEl.innerHTML = matches.map((ev) => {
      const member = state.members.find((m) => m.id === ev.memberId);
      const accent = member?.color ?? "#8E8E93";
      const when = ev.allDay ? fmtDate(ev.start) : `${fmtDate(ev.start)}, ${fmtTime(ev.start)}`;
      return `<button class="search-result" data-uid="${ev.uid}">
        <span class="search-result__bar" style="background:${accent};"></span>
        <span class="search-result__body">
          <span class="search-result__title">${escHtml(ev.summary)}</span>
          <span class="search-result__meta">${when}${member ? ` · ${member.name}` : ""}</span>
        </span>
      </button>`;
    }).join("");

    resultsEl.querySelectorAll<HTMLElement>("[data-uid]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ev = state.events.find((e) => e.uid === btn.dataset.uid);
        if (!ev) return;
        sheet.remove();
        state.viewMode = "week";
        state.weekStart = startOfWeek(ev.start);
        render();
        showEventDetail(ev);
      });
    });
  }

  input.addEventListener("input", () => renderResults(input.value));
  document.getElementById("search-close")!.addEventListener("click", () => sheet.remove());
  sheet.addEventListener("click", (e) => {
    if ((e.target as HTMLElement) === sheet) sheet.remove();
  });
  sheet.querySelector<HTMLElement>("[data-stop-propagation]")!
    .addEventListener("click", (e) => e.stopPropagation());

  renderResults("");
  requestAnimationFrame(() => input.focus());
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
  // Assign to the active member filter, or fall back to first member
  const memberId = state.todoFilterMemberId || state.members[0]?.id || "";
  state.todos.push({
    id: `t-${Date.now()}`,
    title,
    category: categorizeTodoItem(title),
    completed: false,
    createdAt: Date.now(),
    memberId,
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
      <div class="detail-actions">
        <button class="detail-edit" data-action="edit-event-from-detail">Bearbeiten</button>
        <button class="detail-delete" data-action="delete-event-from-detail">Löschen</button>
      </div>
    </div>
  </div>`;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const sheet = wrapper.firstElementChild as HTMLElement;
  document.body.appendChild(sheet);

  sheet.querySelector<HTMLElement>("[data-action='close-detail']")
    ?.addEventListener("click", () => sheet.remove());
  sheet.querySelector<HTMLElement>("[data-stop-propagation]")
    ?.addEventListener("click", (e) => e.stopPropagation());
  sheet.querySelector<HTMLElement>("[data-action='edit-event-from-detail']")
    ?.addEventListener("click", () => { sheet.remove(); openEditModal(ev); });
  sheet.querySelector<HTMLElement>("[data-action='delete-event-from-detail']")
    ?.addEventListener("click", () => { sheet.remove(); void deleteEvent(ev); });

  // Swipe-down-to-close anchored to the handle, then tracked on document
  // so the finger can move freely without losing the gesture.
  const panel = sheet.querySelector<HTMLElement>(".detail-sheet")!;
  const handle = sheet.querySelector<HTMLElement>(".detail-handle")!;
  let swipeStartY = 0;

  const onMove = (e: TouchEvent) => {
    const dy = e.touches[0].clientY - swipeStartY;
    if (dy > 0) {
      panel.style.transform = `translateY(${dy}px)`;
      panel.style.transition = "none";
    }
  };
  const onEnd = (e: TouchEvent) => {
    document.removeEventListener("touchmove", onMove);
    const dy = e.changedTouches[0].clientY - swipeStartY;
    if (dy > 60) {
      panel.style.transition = "transform 0.25s cubic-bezier(0.4,0,1,1)";
      panel.style.transform = "translateY(100%)";
      panel.addEventListener("transitionend", () => sheet.remove(), { once: true });
    } else {
      panel.style.transition = "transform 0.35s cubic-bezier(0.22,1,0.36,1)";
      panel.style.transform = "";
    }
  };

  panel.addEventListener("touchstart", (e) => {
    // Ignore taps on the action buttons — they have their own handlers
    if ((e.target as HTMLElement).closest(".detail-actions")) return;
    swipeStartY = e.touches[0].clientY;
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { once: true, passive: true });
  }, { passive: true });
  handle.style.cursor = "grab";
}

function openEditModal(ev: CalendarEvent): void {
  state.modal = {
    tab: "datum",
    summary: ev.summary,
    startDate: new Date(ev.start),
    endDate: new Date(ev.end),
    allDay: ev.allDay,
    memberId: ev.memberId ?? state.members[0]?.id ?? "",
    location: ev.location ?? "",
    notes: ev.description ?? "",
    editUid: ev.uid,
  };
  render();
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
  const { editUid } = state.modal;
  if (config && navigator.onLine) {
    try {
      const client = new HAClient(config);
      if (editUid && !editUid.startsWith("local-")) {
        await client.updateEvent(memberId, editUid, summary.trim(), startDate, endDate, allDay, {
          location: location || undefined,
          description: notes || undefined,
        });
      } else {
        await client.createEvent(memberId, summary.trim(), startDate, endDate, allDay, {
          location: location || undefined,
          description: notes || undefined,
        });
      }
    } catch {
      if (!editUid) {
        enqueue({
          entityId: memberId,
          summary: summary.trim(),
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          allDay,
          location: location || undefined,
          description: notes || undefined,
        });
      }
    }
  } else if (config && !editUid) {
    enqueue({
      entityId: memberId,
      summary: summary.trim(),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      allDay,
      location: location || undefined,
      description: notes || undefined,
    });
  }

  if (editUid) {
    const idx = state.events.findIndex((e) => e.uid === editUid);
    const updated: CalendarEvent = {
      uid: editUid,
      summary: summary.trim(),
      start: startDate,
      end: endDate,
      allDay,
      memberId,
      location: location || undefined,
      description: notes || undefined,
    };
    if (idx >= 0) state.events[idx] = updated;
    else state.events.push(updated);
  } else {
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
  }
  state.events.sort((a, b) => a.start.getTime() - b.start.getTime());
  saveCachedEvents(state.events);
  state.modal = null;
  render();
  // Do NOT call refreshEvents() here — HA needs time to index the new event.
  // Fetching immediately would return stale data and processQueue() could
  // replay queued items creating duplicates. The local state is already correct.
}

// ── Duplicate detection & cleanup ─────────────────────────────────────────

function findDuplicateUids(events: CalendarEvent[]): string[] {
  const dupes = new Set<string>();

  for (let i = 0; i < events.length; i++) {
    if (dupes.has(events[i].uid)) continue;
    const a = events[i];

    for (let j = i + 1; j < events.length; j++) {
      const b = events[j];
      if (dupes.has(b.uid)) continue;
      if (a.memberId !== b.memberId) continue;
      if (a.summary.toLowerCase() !== b.summary.toLowerCase()) continue;

      let isDupe = false;
      if (a.allDay && b.allDay) {
        // Both all-day: duplicate if date ranges overlap
        isDupe = a.start < b.end && b.start < a.end;
      } else if (!a.allDay && !b.allDay) {
        // Both timed: duplicate if same start minute
        isDupe = a.start.getTime() === b.start.getTime();
      } else {
        // Mixed: timed event is a duplicate of the all-day event if it falls
        // within the all-day span and has the same name (e.g. "Urlaub" created
        // both as an all-day and accidentally as hourly slots)
        const [allDay, timed] = a.allDay ? [a, b] : [b, a];
        isDupe = timed.start >= allDay.start && timed.start < allDay.end;
      }

      if (isDupe) dupes.add(b.uid);
    }
  }

  // Consecutive same-name same-calendar all-day events: the processQueue bug can
  // create individual one-day chunks instead of one multi-day event.  Adjacent
  // chunks (end of prev == start of next) are treated as duplicates.
  const allDayByKey = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    if (!e.allDay || dupes.has(e.uid)) continue;
    const key = `${e.memberId}|${e.summary.toLowerCase()}`;
    if (!allDayByKey.has(key)) allDayByKey.set(key, []);
    allDayByKey.get(key)!.push(e);
  }
  for (const [, group] of allDayByKey) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let i = 1; i < sorted.length; i++) {
      // end >= start means adjacent (end==start) or overlapping — both are dupes
      if (sorted[i - 1].end.getTime() >= sorted[i].start.getTime()) {
        dupes.add(sorted[i].uid);
      }
    }
  }

  // Same-name same-time timed events repeated on consecutive days within the
  // same calendar — another processQueue bug pattern.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const timedByKey = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    if (e.allDay || dupes.has(e.uid)) continue;
    const key = `${e.memberId}|${e.summary.toLowerCase()}|${e.start.getHours()}:${String(e.start.getMinutes()).padStart(2, "0")}`;
    if (!timedByKey.has(key)) timedByKey.set(key, []);
    timedByKey.get(key)!.push(e);
  }
  for (const [, group] of timedByKey) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let i = 1; i < sorted.length; i++) {
      const prevMidnight = new Date(sorted[i - 1].start); prevMidnight.setHours(0, 0, 0, 0);
      const thisMidnight = new Date(sorted[i].start); thisMidnight.setHours(0, 0, 0, 0);
      const dayDiff = (thisMidnight.getTime() - prevMidnight.getTime()) / DAY_MS;
      if (dayDiff <= 1) dupes.add(sorted[i].uid);
    }
  }

  return [...dupes];
}


async function runFullDuplicateCleanup(silent = false): Promise<void> {
  const config = loadConfig();
  if (!config) return;

  let toast: HTMLDivElement | null = null;
  if (!silent) {
    toast = document.createElement("div");
    toast.className = "dupe-banner";
    toast.innerHTML = `<span style="flex:1;">Suche Duplikate in allen Terminen…</span>`;
    document.body.appendChild(toast);
  }

  try {
    const client = new HAClient(config);
    const now = new Date();
    const rangeStart = addMonths(now, -2);
    const rangeEnd = addMonths(now, 6);

    const fresh = await client.getAllEvents(rangeStart, rangeEnd);

    const nowMs = Date.now();
    const hiddenFpsCleanup = new Set<string>();
    for (const e of fresh) {
      if (pendingDeletes.get(e.uid) === PERMANENT) {
        hiddenFpsCleanup.add(`${e.memberId}|${e.start.getTime()}|${e.summary.toLowerCase()}`);
      }
    }
    const withoutHiddenCleanup = fresh.filter((e) => {
      const exp = pendingDeletes.get(e.uid);
      if (exp === PERMANENT) return false;
      if (exp !== undefined && exp > nowMs) return false;
      return !hiddenFpsCleanup.has(`${e.memberId}|${e.start.getTime()}|${e.summary.toLowerCase()}`);
    });
    const seenFpCleanup = new Set<string>();
    const visible = withoutHiddenCleanup.filter((e) => {
      const fp = `${e.memberId}|${e.start.getTime()}|${e.summary.toLowerCase()}`;
      if (seenFpCleanup.has(fp)) return false;
      seenFpCleanup.add(fp);
      return true;
    });

    const dupeUids = findDuplicateUids(visible);
    toast?.remove();
    toast = null;

    if (dupeUids.length === 0) {
      if (!silent) {
        const done = document.createElement("div");
        done.className = "dupe-banner";
        done.innerHTML = `<span style="flex:1;">Keine Duplikate gefunden ✓</span><span class="dupe-banner__dismiss">✕</span>`;
        done.querySelector(".dupe-banner__dismiss")!.addEventListener("click", () => done.remove());
        document.body.appendChild(done);
        setTimeout(() => done.remove(), 4000);
      }
      return;
    }

    const dupeSet = new Set(dupeUids);
    const dupeEvents = dupeUids
      .map((uid) => visible.find((e) => e.uid === uid))
      .filter((ev): ev is CalendarEvent => ev !== undefined);

    for (const uid of dupeUids) pendingDeletes.set(uid, PERMANENT);
    state.events = state.events.filter((e) => !dupeSet.has(e.uid));
    savePendingDeletes(pendingDeletes);
    saveCachedEvents(state.events);
    render();

    if (!navigator.onLine) {
      const offline = document.createElement("div");
      offline.className = "dupe-banner";
      offline.innerHTML = `<span style="flex:1;">${dupeUids.length} ausgeblendet · Offline – HA-Löschung ausstehend</span><span class="dupe-banner__dismiss">✕</span>`;
      offline.querySelector(".dupe-banner__dismiss")!.addEventListener("click", () => offline.remove());
      document.body.appendChild(offline);
      setTimeout(() => offline.remove(), 8000);
      return;
    }

    // Keep PERMANENT regardless of HA delete outcome — see deleteEvent() comment.
    const results = await Promise.allSettled(
      dupeEvents
        .filter((ev) => !ev.uid.startsWith("local-"))
        .map((ev) => client.deleteEvent(ev.memberId ?? "", ev.uid)),
    );
    savePendingDeletes(pendingDeletes);

    const failedResults = results.filter((r) => r.status === "rejected");
    const failed = failedResults.length;
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const firstErr = failed > 0 && failedResults[0].status === "rejected"
      ? (failedResults[0].reason instanceof Error ? failedResults[0].reason.message : String(failedResults[0].reason))
      : "";

    const result = document.createElement("div");
    result.className = "dupe-banner";
    const msg = failed > 0
      ? `${succeeded} gelöscht · ${failed} HA-Fehler: ${firstErr}`
      : `${succeeded} Duplikate gelöscht ✓`;
    result.innerHTML = `<span style="flex:1;">${msg}</span><span class="dupe-banner__dismiss">✕</span>`;
    result.querySelector(".dupe-banner__dismiss")!.addEventListener("click", () => result.remove());
    document.body.appendChild(result);
    setTimeout(() => result.remove(), 8000);

  } catch (err) {
    toast?.remove();
    if (!silent) {
      const errBanner = document.createElement("div");
      errBanner.className = "dupe-banner";
      errBanner.style.color = "#FF453A";
      errBanner.innerHTML = `<span style="flex:1;">Fehler: ${err instanceof Error ? err.message : String(err)}</span><span class="dupe-banner__dismiss">✕</span>`;
      errBanner.querySelector(".dupe-banner__dismiss")!.addEventListener("click", () => errBanner.remove());
      document.body.appendChild(errBanner);
      setTimeout(() => errBanner.remove(), 8000);
    }
  }
}

// ── Delete calendar event ──────────────────────────────────────────────────

async function deleteEvent(ev: CalendarEvent): Promise<void> {
  // Mark as permanently deleted. We keep this PERMANENT forever — even after
  // HA confirms — because HA's calendar.delete_event may return success while
  // the event still reappears (recurring rules, external calendar sync, etc.).
  // The PERMANENT list is synced to HA via sensor.familienkalender_hidden_uids
  // so all devices honour the same hidden set.
  pendingDeletes.set(ev.uid, PERMANENT);
  savePendingDeletes(pendingDeletes);

  state.events = state.events.filter((e) => e.uid !== ev.uid);
  saveCachedEvents(state.events);
  render();

  const config = loadConfig();
  if (config && !ev.uid.startsWith("local-") && navigator.onLine) {
    try {
      const client = new HAClient(config);
      await client.deleteEvent(ev.memberId ?? "", ev.uid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to delete event from HA:", msg);
      // Show HA's actual response verbatim so we know what HA is complaining
      // about — don't guess the cause.
      showTransientBanner(msg, true);
    }
  }
}

function showTransientBanner(text: string, isError = false): void {
  const banner = document.createElement("div");
  banner.className = "dupe-banner";
  if (isError) banner.style.color = "#FF453A";
  banner.innerHTML = `<span style="flex:1;">${text}</span><span class="dupe-banner__dismiss">✕</span>`;
  banner.querySelector(".dupe-banner__dismiss")!.addEventListener("click", () => banner.remove());
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 8000);
}

// ── HA data refresh ────────────────────────────────────────────────────────

let lastFailedAt = 0;
const RETRY_COOLDOWN_MS = 45_000;

async function refreshEvents(): Promise<void> {
  const config = loadConfig();
  if (!config) return;
  if (Date.now() - lastFailedAt < RETRY_COOLDOWN_MS) return;
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
    // getAllEvents only deduplicates by UID; fingerprint dedup happens here,
    // AFTER the pendingDeletes filter, so that a PERMANENT event's fingerprint
    // can suppress sibling duplicates that HA returned under a different UID.
    const now = Date.now();
    // Pass 1: collect fingerprints of every PERMANENT-hidden event in the raw fetch.
    const hiddenFps = new Set<string>();
    const ghostsToRetryDelete: CalendarEvent[] = [];
    for (const e of fresh) {
      if (pendingDeletes.get(e.uid) === PERMANENT) {
        hiddenFps.add(`${e.memberId}|${e.start.getTime()}|${e.summary.toLowerCase()}`);
        // Event is marked PERMANENT but HA still returns it → re-attempt
        // delete in HA. This is the recovery path for cases where HA's first
        // delete_event call returned success but the event came back (recurring
        // event, external calendar sync, etc.) or where the initial delete
        // failed silently.
        if (!e.uid.startsWith("local-") && e.memberId) {
          ghostsToRetryDelete.push(e);
        }
      }
    }
    if (ghostsToRetryDelete.length > 0 && navigator.onLine) {
      void Promise.allSettled(
        ghostsToRetryDelete.map((e) => client.deleteEvent(e.memberId ?? "", e.uid)),
      );
    }
    // Pass 2: filter by UID (pendingDeletes) and fingerprint (hiddenFps).
    const withoutHidden = fresh.filter((e) => {
      const exp = pendingDeletes.get(e.uid);
      if (exp === PERMANENT) return false;
      if (exp !== undefined && exp > now) return false;
      return !hiddenFps.has(`${e.memberId}|${e.start.getTime()}|${e.summary.toLowerCase()}`);
    });
    // Pass 3: fingerprint dedup (keep first occurrence per entity+start+summary).
    const seenFp = new Set<string>();
    const merged = withoutHidden.filter((e) => {
      const fp = `${e.memberId}|${e.start.getTime()}|${e.summary.toLowerCase()}`;
      if (seenFp.has(fp)) return false;
      seenFp.add(fp);
      return true;
    });
    // Auto-deduplicate on every refresh: mark duplicates PERMANENT and re-filter.
    // This runs inline so duplicates are never shown, even on first load after a
    // fresh install where localStorage / sensor may be empty.
    const inViewDupes = findDuplicateUids(merged);
    let clean = merged;
    if (inViewDupes.length > 0) {
      for (const uid of inViewDupes) {
        if (!pendingDeletes.has(uid)) pendingDeletes.set(uid, PERMANENT);
      }
      savePendingDeletes(pendingDeletes);
      const dupeSet = new Set(inViewDupes);
      clean = merged.filter((e) => !dupeSet.has(e.uid));
    }
    state.events = clean;
    saveCachedEvents(clean);
    dismissHAError();
    if (state.activeTab === "kalender") render();
    // HA is reachable → try flushing queued events
    void processQueue();
  } catch (err) {
    lastFailedAt = Date.now();
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to load events from HA:", msg);
    showHAError(msg);
  }
}

function showHAError(detail?: string): void {
  document.getElementById("ha-error-banner")?.remove();
  const el = document.createElement("div");
  el.id = "ha-error-banner";
  el.className = "ha-error-banner";
  const gearSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
  el.innerHTML = `<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${detail ?? "HA nicht erreichbar"}</span><button class="ha-error-reconnect">Erneut versuchen</button><button class="ha-error-settings" title="Einstellungen">${gearSvg}</button><span style="margin-left:4px;opacity:.7;cursor:pointer;">✕</span>`;
  el.querySelector(".ha-error-reconnect")!.addEventListener("click", (e) => {
    e.stopPropagation();
    el.remove();
    lastFailedAt = 0;
    void refreshEvents();
  });
  el.querySelector(".ha-error-settings")!.addEventListener("click", (e) => {
    e.stopPropagation();
    el.remove();
    renderConfig();
  });
  el.addEventListener("click", () => el.remove());
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 20000);
}

function dismissHAError(): void {
  document.getElementById("ha-error-banner")?.remove();
}

// ── Config screen ──────────────────────────────────────────────────────────

function renderConfig(): void {
  const existing = loadConfig();
  const defaultEntities = "calendar.fede, calendar.pita, calendar.bebos, calendar.santi, calendar.fede_trabajo, calendar.pita_trabajo";
  const escVal = (s: string) => s.replace(/"/g, "&quot;");
  app.innerHTML = `
    <div class="config-screen">
      <h1>Verbindung zu Home Assistant</h1>
      <p>Gib die URL deines HA-Servers, ein Long-Lived Access Token und die Kalender-Entities ein (kommagetrennt).</p>
      <label>HA URL
        <input id="cfg-url" type="url" value="${escVal(existing?.baseUrl ?? "")}" placeholder="https://xxx.ui.nabu.casa" />
      </label>
      <label>Access Token
        <input id="cfg-token" type="password" value="${escVal(existing?.token ?? "")}" placeholder="eyJhbGciOi…" />
      </label>
      <label>Kalender-Entities
        <textarea id="cfg-entities" rows="3">${existing ? existing.calendarEntities.join(", ") : defaultEntities}</textarea>
      </label>
      <button id="cfg-save">Speichern und verbinden</button>
      <p style="margin-top:24px;font-size:11px;color:rgba(235,235,245,0.3);text-align:center;">Build: ${__BUILD_TIME__}</p>
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
    pushEntitiesToHA(entities);
    render();
    // Sync hidden UIDs from HA BEFORE fetching events so that previously-hidden
    // duplicates are not shown on the first refresh after a fresh login.
    void syncHiddenUidsFromHA().then(() => void refreshEvents());
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

// Re-categorize any items that were saved with old (wrong) categories.
// Safe to run every startup — categories are always auto-assigned, never manually set.
(function migrateCategorization() {
  const shopping = loadShoppingItems();
  const recatShopping = shopping.map((i) => ({ ...i, category: categorizeShoppingItem(i.name) }));
  if (recatShopping.some((i, idx) => i.category !== shopping[idx].category)) {
    saveShoppingItems(recatShopping);
    state.shopping = recatShopping;
  }
  const todos = loadTodoItems();
  const recatTodos = todos.map((i) => ({ ...i, category: categorizeTodoItem(i.title) }));
  if (recatTodos.some((i, idx) => i.category !== todos[idx].category)) {
    saveTodoItems(recatTodos);
    state.todos = recatTodos;
  }
})();

// ── Calendar entity config sync ────────────────────────────────────────────

const ENTITIES_TS_KEY = "nanoclaw-entities-ts";
const HA_ENTITIES_ENTITY = "sensor.familienkalender_entities";

function pushEntitiesToHA(entities: string[]): void {
  const cfg = loadConfig();
  if (!cfg) return;
  const ts = Date.now();
  localStorage.setItem(ENTITIES_TS_KEY, String(ts));
  void fetch(`${cfg.baseUrl}/api/states/${HA_ENTITIES_ENTITY}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ state: new Date(ts).toISOString(), attributes: { entities, ts } }),
  }).catch(() => {});
}

async function syncEntitiesFromHA(): Promise<string[] | null> {
  const cfg = loadConfig();
  if (!cfg) return null;
  const localTs = Number(localStorage.getItem(ENTITIES_TS_KEY) ?? "0");
  const localEntities = cfg.calendarEntities;
  try {
    const res = await fetch(`${cfg.baseUrl}/api/states/${HA_ENTITIES_ENTITY}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    if (!res.ok) { pushEntitiesToHA(localEntities); return null; }
    const data = (await res.json()) as { attributes?: { entities?: string[]; ts?: number } };
    const haTs = data.attributes?.ts ?? 0;
    const haEntities = data.attributes?.entities;
    if (!haEntities || haEntities.length === 0) {
      pushEntitiesToHA(localEntities); return null;
    }
    if (haTs > localTs) {
      saveConfig({ ...cfg, calendarEntities: haEntities });
      localStorage.setItem(ENTITIES_TS_KEY, String(haTs));
      return haEntities;
    }
    if (localTs > haTs) pushEntitiesToHA(localEntities);
    return null;
  } catch { return null; }
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
  // Pull hidden UIDs first, THEN refresh — so deleted events are never
  // momentarily re-shown after a page reload.
  void syncHiddenUidsFromHA().then(() => {
    void refreshEvents();
    // Sync calendar entities after UIDs are known; re-fetch if they changed.
    void syncEntitiesFromHA().then((entities) => {
      if (!entities) return;
      void refreshEvents();
    });
  });
  // Sync shopping + todos from HA so all devices share the same state.
  const pullShopping = () =>
    void syncShoppingFromHA().then((items) => {
      if (!items) return;
      state.shopping = items;
      if (state.activeTab === "einkauf") render();
    });
  const pullTodos = () =>
    void syncTodosFromHA().then((items) => {
      if (!items) return;
      state.todos = items;
      if (state.activeTab === "todo") render();
    });
  pullShopping();
  pullTodos();
  // Periodic re-sync so changes made on other devices show up without a
  // full app restart. 60s is a reasonable balance between freshness and load.
  setInterval(() => { pullShopping(); pullTodos(); }, 60_000);
  // Also pull when the app comes back to the foreground.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { pullShopping(); pullTodos(); }
  });
}

updateQueueBadge();
// On reconnect, refresh first (which calls processQueue after state is populated)
// so the already-in-HA dedup check sees real UIDs before any creates fire.
window.addEventListener("online", () => void refreshEvents());


// ── Calendar swipe navigation ──────────────────────────────────────────────

(function setupCalendarSwipe() {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  app.addEventListener("touchstart", (e: TouchEvent) => {
    if (state.activeTab !== "kalender" || state.modal) return;
    const target = e.target as HTMLElement;
    // Don't intercept touches on event chips or interactive controls
    if (target.closest("[data-action='event-detail']") || target.closest("button")) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  app.addEventListener("touchmove", (e: TouchEvent) => {
    if (!tracking) return;
    const dx = Math.abs(e.touches[0].clientX - startX);
    const dy = Math.abs(e.touches[0].clientY - startY);
    // Cancel if the gesture is clearly more vertical than horizontal
    if (dy > 12 && dy > dx) tracking = false;
  }, { passive: true });

  app.addEventListener("touchcancel", () => { tracking = false; }, { passive: true });

  app.addEventListener("touchend", (e: TouchEvent) => {
    if (!tracking) return;
    tracking = false;
    if (drag) return; // ongoing event drag takes priority
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    // Require at least 55px horizontal and more horizontal than vertical
    if (Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx) * 0.65) return;
    if (dx < 0) {
      // Swipe left → forward
      if (state.viewMode === "month") state.monthStart = addMonths(state.monthStart, 1);
      else state.weekStart = addDays(state.weekStart, 7);
    } else {
      // Swipe right → back
      if (state.viewMode === "month") state.monthStart = addMonths(state.monthStart, -1);
      else state.weekStart = addDays(state.weekStart, -7);
    }
    render();
    void refreshEvents();
  }, { passive: true });
})();
