import "./style.css";
import { HAClient, loadConfig, saveConfig } from "./ha-client.ts";
import { haWriteState } from "./ha-write.ts";
import {
  fetchMobileAppServices,
  loadNotifConfig,
  prettyServiceName,
  pushNotifConfigToHA,
  saveNotifConfig,
  sendTestNotification,
  type NotifConfig,
} from "./notifications.ts";
declare const __BUILD_TIME__: string;

// HA hat einen Sensor-Schreibzugriff abgelehnt (401/403) — sichtbar machen,
// statt still zu scheitern (hat sonst tagelang unbemerkt den Sync gebrochen).
let haWriteDeniedBannerAt = 0;
window.addEventListener("ha-write-denied", () => {
  if (Date.now() - haWriteDeniedBannerAt < 60_000) return;
  haWriteDeniedBannerAt = Date.now();
  showTransientBanner(
    "Sync-Fehler: HA verweigert das Schreiben. python_script-Setup auf dem Server prüfen (update.sh).",
    true,
  );
});

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
import { buildRruleString, defaultModalState, fmtDateTimeLocal, renderEventModal } from "./views/event-modal.ts";
import type { ModalState, RecurrenceFreq } from "./views/event-modal.ts";
import { parseQuickEvent } from "./views/quick-parse.ts";
import {
  categorizeShoppingItem,
  loadShoppingItems,
  renderShoppingView,
  saveShoppingItems,
  syncShoppingFromHA,
} from "./views/shopping.ts";
import {
  categorizeTodoItem,
  cleanTodoTitle,
  loadTodoItems,
  renderTodoView,
  saveTodoItems,
  syncTodosFromHA,
  type TodoViewState,
} from "./views/todo.ts";
import type { CalendarEvent, FamilyMember, ShoppingItem, TabKey, TodoItem } from "./types.ts";

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function isEmojiInitial(s: string): boolean {
  return /\p{Extended_Pictographic}/u.test(s);
}

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
  rrule?: string;
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
          { location: item.location, description: item.description, rrule: item.rrule },
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

const EVENTS_CACHE_KEY = "calendar-events-v2";

// ── Member color overrides (LocalStorage) ──────────────────────────────────

const MEMBER_COLORS_KEY = "fk_member_colors_v1";

function loadMemberColors(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MEMBER_COLORS_KEY) ?? "{}"); } catch { return {}; }
}

function saveMemberColor(memberId: string, color: string): void {
  const colors = loadMemberColors();
  colors[memberId] = color;
  localStorage.setItem(MEMBER_COLORS_KEY, JSON.stringify(colors));
}

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

const HOLIDAY_MEMBER_ID = "__feiertage__";
const HOLIDAY_MEMBER: FamilyMember = { id: HOLIDAY_MEMBER_ID, name: "Feiertage 🇦🇹", initial: "🇦🇹", color: "#FF3B30" };

const BIRTHDAY_MEMBER_ID = "__geburtstage__";
const BIRTHDAY_MEMBER: FamilyMember = { id: BIRTHDAY_MEMBER_ID, name: "Geburtstage 🎂", initial: "🎂", color: "#FF2D55" };

const MOTOGP_MEMBER_ID = "__motogp__";
const MOTOGP_MEMBER: FamilyMember = { id: MOTOGP_MEMBER_ID, name: "MotoGP 🏍️", initial: "🏍️", color: "#E4002B" };

const BIRTHDAY_DATA_KEY = "fk_birthday_data_v1";

interface BirthdayEntry { name: string; month: number; day: number; year?: number; }

function loadBirthdayData(): BirthdayEntry[] {
  try { return JSON.parse(localStorage.getItem(BIRTHDAY_DATA_KEY) ?? "[]") as BirthdayEntry[]; }
  catch { return []; }
}

// ── Gelöschte Geburtstage (persistente Blockliste) ──────────────────────────
// Geburtstage stammen aus einem iCloud-ICS-Feed. Damit manuell gelöschte
// Einträge bei einem erneuten Import (oder einer Disk-Wiederherstellung nach
// HA-Neustart) NICHT wieder auftauchen, merken wir uns gelöschte Geburtstage
// in einer Blockliste — analog zu sensor.familienkalender_hidden_uids bei den
// Terminen. Schlüssel: `name|month|day` (month 0-indexiert), identisch zur
// Schlüsselbildung im Poller.
const DELETED_BIRTHDAYS_KEY = "fk_deleted_birthdays_v1";

function birthdayKey(bd: { name: string; month: number; day: number }): string {
  return `${bd.name}|${bd.month}|${bd.day}`;
}

function loadDeletedBirthdays(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DELETED_BIRTHDAYS_KEY) ?? "[]") as string[]); }
  catch { return new Set(); }
}

function saveDeletedBirthdays(keys: Set<string>): void {
  try { localStorage.setItem(DELETED_BIRTHDAYS_KEY, JSON.stringify([...keys])); }
  catch { /* ignore */ }
}

function pushDeletedBirthdaysToHA(keys: Set<string>): void {
  const cfg = loadConfig();
  if (!cfg) return;
  haWriteState(cfg.baseUrl, cfg.token, "sensor.familienkalender_deleted_birthdays",
    String(keys.size), { keys: [...keys], ts: Date.now() });
}

async function syncDeletedBirthdaysFromHA(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg) return;
  const local = loadDeletedBirthdays();
  try {
    const res = await fetch(`${cfg.baseUrl}/api/states/sensor.familienkalender_deleted_birthdays`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    // Sensor fehlt ganz (404, z.B. nach HA-Neustart oder noch nie geschrieben):
    // die lokale Blockliste hochladen, damit sie (wieder) entsteht und andere
    // Geräte sie abholen können. Ohne dies bliebe eine Löschung für immer nur
    // lokal, wenn der Sensor einmal weg war.
    if (res.status === 404) {
      if (local.size > 0) pushDeletedBirthdaysToHA(local);
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as { attributes?: { keys?: string[] } };
    const remoteKeys = data.attributes?.keys;
    if (!Array.isArray(remoteKeys)) {
      if (local.size > 0) pushDeletedBirthdaysToHA(local);
      return;
    }
    // WICHTIG: Die Blockliste wird nur VEREINIGT, nie überschrieben. Eine einmal
    // gelöschte Geburtstag-Kennung bleibt damit dauerhaft blockiert und kann
    // nicht durch einen leeren/zurückgesetzten HA-Sensor (z.B. nach HA-Neustart
    // ohne Poller-Persistenz) oder durch den iCloud-Re-Import des Pollers wieder
    // auftauchen. So sind gelöschte Geburtstage endgültig weg — unabhängig davon,
    // was der Poller auf der HA-Seite tut.
    const merged = new Set([...local, ...remoteKeys]);
    if (merged.size !== local.size) saveDeletedBirthdays(merged);
    // Falls die lokale Liste mehr Einträge kennt als HA, HA heilen, damit auch
    // andere Geräte den vollständigen Stand bekommen.
    if (merged.size !== remoteKeys.length) pushDeletedBirthdaysToHA(merged);
  } catch { /* ignore */ }
}

function cleanBirthdayName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*[-–]\s*(Geburtstag|Birthday|Cumpleaños|Anniversaire).*/i, "")
    .trim();
}



function pushBirthdayDataToHA(data: BirthdayEntry[]): void {
  const cfg = loadConfig();
  if (!cfg) return;
  haWriteState(cfg.baseUrl, cfg.token, "sensor.familienkalender_birthdays",
    String(data.length), { birthdays: data, ts: Date.now() });
}

async function syncBirthdaysFromHA(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg) return;
  try {
    const res = await fetch(`${cfg.baseUrl}/api/states/sensor.familienkalender_birthdays`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { attributes?: { birthdays?: BirthdayEntry[] } };
    const birthdays = data.attributes?.birthdays;
    // Eine leere Liste ist ein gültiger Zustand (alle Geburtstage gelöscht) und
    // muss übernommen werden. Nur ein FEHLENDES Attribut (z.B. Sensor nach
    // HA-Neustart noch nicht befüllt) lassen wir aus, um die lokale Liste nicht
    // versehentlich zu leeren.
    if (!Array.isArray(birthdays)) return;
    localStorage.setItem(BIRTHDAY_DATA_KEY, JSON.stringify(birthdays));
  } catch { /* ignore */ }
}

const DEFAULT_MEMBERS: FamilyMember[] = [
  { id: "calendar.fede",        name: "Fede",   initial: "F", color: "#0A84FF" },
  { id: "calendar.pita",        name: "Pita",   initial: "P", color: "#30D158" },
  { id: "calendar.bebos",       name: "Bebos",  initial: "B", color: "#FF9F0A" },
  { id: "calendar.santi",       name: "Santi",  initial: "S", color: "#BF5AF2" },
  { id: "calendar.fede_trabajo", name: "Fede T", initial: "F", color: "#7EB8FF" },
  { id: "calendar.pita_trabajo", name: "Pita T", initial: "P", color: "#5AC46A" },
  HOLIDAY_MEMBER,
  BIRTHDAY_MEMBER,
  MOTOGP_MEMBER,
];

interface AppState {
  activeTab: TabKey;
  viewMode: "week" | "month";
  weekStart: Date;
  monthStart: Date;
  selectedDate?: Date;
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

function dateForNewEvent(): Date {
  if (state.selectedDate) {
    if (state.viewMode === "month") return state.selectedDate;
    const ws = state.weekStart.getTime();
    if (state.selectedDate.getTime() >= ws && state.selectedDate.getTime() < ws + 7 * 86_400_000)
      return state.selectedDate;
  }
  const today = new Date();
  if (state.viewMode === "week") {
    const ws = state.weekStart.getTime();
    if (today.getTime() >= ws && today.getTime() < ws + 7 * 86_400_000) return today;
    return new Date(state.weekStart);
  }
  return today;
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

// Placeholder events for in-flight calendar moves (create-in-new + delete-from-old).
// Keyed by fingerprint (memberId|startMs|summary) so refreshEvents detects when HA
// has indexed the new event and can drop the placeholder automatically.
const pendingMoveEvents = new Map<string, { event: CalendarEvent; expiry: number }>();

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
  _publishDeletionsToHA();
}

async function syncHiddenUidsFromHA(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg) return;
  try {
    const res = await fetch(`${cfg.baseUrl}/api/states/sensor.familienkalender_hidden_uids`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    // 404 means HA was restarted and lost the in-memory sensor state — fall
    // through so we re-publish our local lists below.
    let uids: string[] = [];
    let sids: string[] = [];
    let restored: string[] = [];
    if (res.ok) {
      const data = (await res.json()) as { attributes?: { uids?: string[]; sids?: string[]; restored?: string[] } };
      uids = data.attributes?.uids ?? [];
      sids = data.attributes?.sids ?? [];
      restored = data.attributes?.restored ?? [];
    }
    let changed = false;
    // Merge restored tombstones first — they always win over any deletion.
    for (const uid of restored) {
      if (!restoredUids.has(uid)) restoredUids.add(uid);
      if (pendingDeletes.delete(uid)) changed = true;
    }
    localStorage.setItem(RESTORED_UIDS_KEY, JSON.stringify([...restoredUids]));
    for (const uid of uids) {
      if (restoredUids.has(uid)) continue; // never re-hide a restored event
      if (!pendingDeletes.has(uid)) {
        pendingDeletes.set(uid, PERMANENT);
        changed = true;
      }
    }
    let sidsChanged = false;
    for (const sid of sids) {
      if (!deletedSeriesIds.has(sid)) {
        deletedSeriesIds.add(sid);
        sidsChanged = true;
      }
    }
    if (sidsChanged) {
      // Save directly to avoid a recursive HA publish cycle.
      localStorage.setItem(DELETED_SIDS_KEY, JSON.stringify([...deletedSeriesIds]));
    }
    if (changed || sidsChanged) {
      if (changed) localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify([...pendingDeletes]));
      state.events = state.events.filter((e) => {
        if (pendingDeletes.get(e.uid) === PERMANENT) return false;
        const sid = extractSeriesId(e.description);
        if (sid && deletedSeriesIds.has(sid)) return false;
        return true;
      });
      render();
    }
    // Always re-publish so the sensor reflects the merged state from all devices.
    _publishDeletionsToHA();
  } catch { /* ignore */ }
}

// uid → expiry ms (-1 = permanent until HA confirms)
const pendingDeletes: Map<string, number> = loadPendingDeletes();

// Tracks how many times ghost-retry has failed for a given UID.
// After 3 failures we stop retrying (event likely not deletable via API).
const ghostRetryFails: Map<string, number> = new Map();

// Fingerprints of permanently deleted events — stored separately so that
// events created via the RRULE fallback (pushed to local state with
// "local-..." UIDs, then re-fetched from HA with real UIDs) are still
// filtered out even though the real UID was never in pendingDeletes.
const HIDDEN_FPS_KEY = "nanoclaw-hidden-fps";
function loadHiddenFps(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_FPS_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}
function saveHiddenFps(fps: Set<string>): void {
  localStorage.setItem(HIDDEN_FPS_KEY, JSON.stringify([...fps]));
}
const hiddenFingerprints: Set<string> = loadHiddenFps();
function eventFp(e: { memberId?: string; start: Date; summary: string }): string {
  return `${e.memberId ?? ""}|${e.start.getTime()}|${e.summary.toLowerCase()}`;
}

// Series IDs that have been fully deleted — any event with this [sid:xxx] in
// its description is hidden on ALL future fetches, regardless of date range.
const DELETED_SIDS_KEY = "nanoclaw-deleted-sids";
function loadDeletedSids(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_SIDS_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}
function saveDeletedSids(s: Set<string>): void {
  localStorage.setItem(DELETED_SIDS_KEY, JSON.stringify([...s]));
  // Sync SIDs to HA so other devices also suppress these series.
  // SIDs are ~8 chars each, so sync ALL of them (negligible size).
  _publishDeletionsToHA();
}

// UIDs the user explicitly restored — these always win over a deletion across
// ALL devices, so a previously (mis-)deleted event can never be re-hidden by
// another device's stale pendingDeletes. This is the cross-device un-delete.
const RESTORED_UIDS_KEY = "nanoclaw-restored-uids";
function loadRestoredUids(): Set<string> {
  try {
    const raw = localStorage.getItem(RESTORED_UIDS_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}
const restoredUids: Set<string> = loadRestoredUids();

// Restore an event everywhere: drop it from every local suppression list and
// add it to the synced restored-tombstone set so other devices follow suit.
function restoreEventEverywhere(ev: CalendarEvent): void {
  pendingDeletes.delete(ev.uid);
  hiddenFingerprints.delete(eventFp(ev));
  restoredUids.add(ev.uid);
  localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify([...pendingDeletes]));
  saveHiddenFps(hiddenFingerprints);
  localStorage.setItem(RESTORED_UIDS_KEY, JSON.stringify([...restoredUids]));
  _publishDeletionsToHA();
}

function _publishDeletionsToHA(): void {
  const uids = [...pendingDeletes].filter(([, exp]) => exp === PERMANENT).map(([uid]) => uid).slice(-300);
  const sids = [...deletedSeriesIds];
  const restored = [...restoredUids].slice(-300);
  const cfg = loadConfig();
  if (!cfg) return;
  haWriteState(cfg.baseUrl, cfg.token, "sensor.familienkalender_hidden_uids",
    String(uids.length + sids.length), { uids, sids, restored, ts: Date.now() });
}
const deletedSeriesIds: Set<string> = loadDeletedSids();

const app = document.getElementById("app")!;
const TODO_FILTER_KEY = "nanoclaw-todo-filter";

// ── Persistent tab bar (lives on <body>, outside #app) ─────────────────────
// Keeping it outside #app means no CSS transform or compositing inside #app
// can ever affect its position — the iOS WebKit compositing bug is fully bypassed.
const _TB_ICONS = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>`,
  todo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l2 2 4-4M4 14l2 2 4-4M12 7h8M12 15h8"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.4 12.5a2 2 0 0 0 2 1.5h8.4a2 2 0 0 0 2-1.5L22 7H6"/></svg>`,
};
const _TB_ITEMS: { key: TabKey; icon: string; label: string }[] = [
  { key: "kalender", icon: _TB_ICONS.home, label: "Kalender" },
  { key: "todo", icon: _TB_ICONS.todo, label: "To-Do" },
  { key: "einkauf", icon: _TB_ICONS.cart, label: "Einkauf" },
];
const _PLUS_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`;
const _CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const persistentTabBar = document.createElement("nav");
persistentTabBar.className = "tab-bar";
persistentTabBar.innerHTML = _TB_ITEMS.map((it) =>
  `<button class="tab-bar__item" data-tab="${it.key}">
    <span class="tab-bar__icon">${it.icon}</span>
    <span class="tab-bar__label">${it.label}</span>
  </button>`
).join("");

const addBtn = document.createElement("button");
addBtn.className = "tab-bar__add";
addBtn.setAttribute("data-action", "add-event");
addBtn.setAttribute("aria-label", "Termin hinzufügen");
addBtn.innerHTML = `<span class="tab-bar__icon">${_PLUS_SVG}</span>`;

const bottomBar = document.createElement("div");
bottomBar.className = "bottom-bar";
bottomBar.appendChild(persistentTabBar);
bottomBar.appendChild(addBtn);
document.body.appendChild(bottomBar);

function updateTabBarActive(): void {
  persistentTabBar.querySelectorAll<HTMLElement>(".tab-bar__item").forEach((btn) => {
    btn.classList.toggle("tab-bar__item--active", btn.dataset.tab === state.activeTab);
  });
}

// When the event modal is open the FAB turns into a thumb-reachable
// confirm/save button (checkmark); otherwise it stays the "+" add button.
function updateFab(): void {
  const inModal = !!state.modal;
  addBtn.classList.toggle("tab-bar__add--confirm", inModal);
  addBtn.setAttribute("aria-label", inModal ? "Termin speichern" : "Termin hinzufügen");
  addBtn.innerHTML = `<span class="tab-bar__icon">${inModal ? _CHECK_SVG : _PLUS_SVG}</span>`;
}

bottomBar.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest<HTMLElement>("[data-action='add-event']")) {
    // While the event modal is open, the FAB acts as a save button — delegate
    // to the modal's own save button so all its disabled/loading logic applies.
    if (state.modal) {
      const saveBtn = app.querySelector<HTMLButtonElement>('[data-action="save-event"]');
      saveBtn?.click();
      return;
    }
    if (state.activeTab === "kalender") {
      state.modal = defaultModalState(state.members, dateForNewEvent());
      render();
    } else if (state.activeTab === "todo") {
      const input = document.getElementById("list-input") as HTMLInputElement | null;
      if (input?.value.trim()) addTodoItem();
      else input?.focus();
    } else if (state.activeTab === "einkauf") {
      const input = document.getElementById("list-input") as HTMLInputElement | null;
      if (input?.value.trim()) addShoppingItem();
      else input?.focus();
    }
    return;
  }
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]");
  if (!btn) return;
  const tab = btn.dataset.tab as TabKey;
  if (tab === "kalender") {
    state.activeTab = "kalender";
    render();
  } else if (tab === "todo") {
    state.activeTab = "todo";
    render();
    void syncTodosFromHA().then((items) => {
      if (!items) return;
      state.todos = items;
      if (state.activeTab === "todo") render();
    });
  } else if (tab === "einkauf") {
    state.activeTab = "einkauf";
    render();
    void syncShoppingFromHA().then((items) => {
      if (!items) return;
      state.shopping = items;
      if (state.activeTab === "einkauf") render();
    });
  }
});

// Block pinch-zoom — iOS ignores user-scalable=no in standalone mode,
// but a non-passive multi-touch preventDefault is always respected.
document.addEventListener("touchmove", (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

// Keep #app.bottom = exact rendered height of the tab bar.
// ResizeObserver fires whenever the tab bar changes size (orientation,
// safe-area changes, first paint), eliminating any CSS-calc mismatch.
function syncAppBottom(): void {
  // Measure the pill's top edge, not the bar container's — the container
  // may have zero height when padding is removed, giving a wrong result.
  const top = persistentTabBar.getBoundingClientRect().top;
  app.style.bottom = `${window.innerHeight - top}px`;
}
syncAppBottom();
new ResizeObserver(syncAppBottom).observe(persistentTabBar);

const state: AppState = {
  activeTab: "kalender",
  viewMode: "week",
  weekStart: startOfWeek(new Date()),
  monthStart: startOfMonth(new Date()),
  events: loadCachedEvents(),
  members: (() => { const c = loadMemberColors(); return DEFAULT_MEMBERS.map((m) => c[m.id] ? { ...m, color: c[m.id] } : m); })(),
  modal: null,
  shopping: loadShoppingItems(),
  todos: loadTodoItems(),
  filterMemberIds: [],
  todoFilterMemberId: localStorage.getItem(TODO_FILTER_KEY) ?? "",
};

// ── Austrian public holidays ───────────────────────────────────────────────

function easterSunday(year: number): Date {
  // Meeus/Jones/Butcher algorithm
  const a = year % 19;
  const b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function generateAustrianHolidays(year: number): CalendarEvent[] {
  const easter = easterSunday(year);
  const addDays = (base: Date, n: number) =>
    new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
  const fixed = (month: number, day: number, name: string) =>
    ({ name, date: new Date(year, month - 1, day) });
  const movable = (offset: number, name: string) =>
    ({ name, date: addDays(easter, offset) });

  const days = [
    fixed(1,  1,  "Neujahr"),
    fixed(1,  6,  "Heilige Drei Könige"),
    movable(1,    "Ostermontag"),
    fixed(5,  1,  "Staatsfeiertag"),
    movable(39,   "Christi Himmelfahrt"),
    movable(50,   "Pfingstmontag"),
    movable(60,   "Fronleichnam"),
    fixed(8,  15, "Mariä Himmelfahrt"),
    fixed(10, 26, "Nationalfeiertag"),
    fixed(11, 1,  "Allerheiligen"),
    fixed(12, 8,  "Mariä Empfängnis"),
    fixed(12, 25, "Weihnachten"),
    fixed(12, 26, "Stephanitag"),
  ];

  return days.map(({ name, date }) => ({
    uid: `__holiday__${year}__${name.replace(/\s+/g, "_")}`,
    summary: name,
    start: date,
    end: date,
    allDay: true,
    memberId: HOLIDAY_MEMBER_ID,
  }));
}

function holidayEvents(): CalendarEvent[] {
  const base = state.viewMode === "week" ? state.weekStart : state.monthStart;
  const y = base.getFullYear();
  return [y - 1, y, y + 1].flatMap(generateAustrianHolidays);
}

function birthdayEvents(): CalendarEvent[] {
  const data = loadBirthdayData();
  if (!data.length) return [];
  const blocked = loadDeletedBirthdays();
  const base = state.viewMode === "week" ? state.weekStart : state.monthStart;
  const year = base.getFullYear();
  const events: CalendarEvent[] = [];
  for (const bd of data) {
    if (blocked.has(birthdayKey(bd))) continue;
    for (const y of [year - 1, year, year + 1]) {
      const age = (bd.year && bd.year >= 1900 && (y - bd.year) > 0) ? y - bd.year : null;
      const displayName = cleanBirthdayName(bd.name);
      events.push({
        uid: `__birthday__${bd.name.replace(/[^a-zA-Z0-9]/g, "_")}__${bd.month}_${bd.day}`,
        summary: age !== null ? `🎂 ${displayName} → ${age}` : `🎂 ${displayName}`,
        start: new Date(y, bd.month, bd.day),
        end:   new Date(y, bd.month, bd.day),
        allDay: true,
        memberId: BIRTHDAY_MEMBER_ID,
      });
    }
  }
  return events;
}

// ── MotoGP race calendar ───────────────────────────────────────────────────
// Ein Eintrag pro Rennwochenende, jeweils am Renn-Sonntag (ganztägig).
// Daten sind fix veröffentlicht (kein Algorithmus wie bei Feiertagen), daher
// pro Saison hart hinterlegt. Format: [Monat (1-12), Tag, Ortsname].
const MOTOGP_RACES: Record<number, Array<[number, number, string]>> = {
  2026: [
    [3, 1,   "Buriram"],      // Thailand
    [3, 22,  "Goiânia"],      // Brasilien
    [3, 29,  "Austin"],       // Amerika
    [4, 26,  "Jerez"],        // Spanien
    [5, 10,  "Le Mans"],      // Frankreich
    [5, 17,  "Barcelona"],    // Catalunya
    [5, 31,  "Mugello"],      // Italien
    [6, 7,   "Balaton"],      // Ungarn
    [6, 21,  "Brno"],         // Tschechien
    [6, 28,  "Assen"],        // Niederlande
    [7, 12,  "Sachsenring"],  // Deutschland
    [8, 9,   "Silverstone"],  // Großbritannien
    [8, 30,  "Aragón"],       // Spanien
    [9, 13,  "Misano"],       // San Marino
    [9, 20,  "Spielberg"],    // Österreich
    [10, 4,  "Motegi"],       // Japan
    [10, 11, "Mandalika"],    // Indonesien
    [10, 25, "Phillip Island"], // Australien
    [11, 1,  "Sepang"],       // Malaysia
    [11, 8,  "Lusail"],       // Katar
    [11, 15, "Portimão"],     // Portugal
    [11, 22, "Valencia"],     // Saisonfinale
  ],
};

function motogpEvents(): CalendarEvent[] {
  const base = state.viewMode === "week" ? state.weekStart : state.monthStart;
  const y = base.getFullYear();
  const events: CalendarEvent[] = [];
  for (const year of [y - 1, y, y + 1]) {
    const races = MOTOGP_RACES[year];
    if (!races) continue;
    for (const [month, day, loc] of races) {
      const date = new Date(year, month - 1, day);
      events.push({
        uid: `__motogp__${year}__${month}_${day}`,
        summary: `MotoGP ${loc}`,
        start: date,
        end: date,
        allDay: true,
        memberId: MOTOGP_MEMBER_ID,
      });
    }
  }
  return events;
}

function visibleEvents(): CalendarEvent[] {
  const holidays = holidayEvents();
  const birthdays = birthdayEvents();
  const motogp = motogpEvents();
  if (state.filterMemberIds.length === 0) {
    return [...state.events, ...holidays, ...birthdays, ...motogp];
  }
  const regular = state.events.filter((e) => state.filterMemberIds.includes(e.memberId ?? ""));
  return [
    ...regular,
    ...(state.filterMemberIds.includes(HOLIDAY_MEMBER_ID)  ? holidays  : []),
    ...(state.filterMemberIds.includes(BIRTHDAY_MEMBER_ID) ? birthdays : []),
    ...(state.filterMemberIds.includes(MOTOGP_MEMBER_ID)   ? motogp    : []),
  ];
}

// ── Rendering ──────────────────────────────────────────────────────────────

// Track whether the modal was open on the previous render so we only
// auto-focus the summary input on first open, not on every re-render
// (which would re-open the iOS keyboard on every weekday-chip tap, etc.)
let _prevModalOpen = false;

function occurrencePreviewCount(modal: ModalState): number | undefined {
  if (!modal.rruleFreq) return undefined;
  try {
    return expandRecurrences(modal.startDate, modal.endDate, modal).length;
  } catch { return undefined; }
}

function render(): void {
  // Cancel any pending drag before replacing the DOM. Without this, the
  // 350ms drag-activation timer can fire after innerHTML is replaced,
  // appending a ghost and adding a non-passive touchmove listener to
  // document that calls e.preventDefault() — permanently blocking swipes.
  if (drag) cancelDrag();
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
    if (state.modal) html += renderEventModal(state.modal, state.members.filter((m) => !m.id.startsWith("__")), occurrencePreviewCount(state.modal));
  } else {
    html = renderWeekView({
      weekStart: state.weekStart,
      events: visibleEvents(),
      members: state.members,
      today: new Date(),
      filterActive: state.filterMemberIds.length > 0,
    });
    if (state.modal) html += renderEventModal(state.modal, state.members.filter((m) => !m.id.startsWith("__")), occurrencePreviewCount(state.modal));
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
  setupLongPress();
  setupTodoLongPress();
  updateTabBarActive();
  updateFab();
  const modalNowOpen = !!state.modal;
  // Das normale Titelfeld fokussieren (nicht das Sprach-Feld) — Spracheingabe
  // startet der User bei Bedarf selbst.
  if (modalNowOpen && !_prevModalOpen) document.getElementById("modal-summary")?.focus();
  _prevModalOpen = modalNowOpen;
  // Do NOT auto-focus list-input on render — it opens the iOS keyboard
  // automatically on every tab switch and causes the sticky nav to jump.

  if (scrollTodayUntil > Date.now() && state.viewMode === "week" && state.activeTab === "kalender") {
    requestAnimationFrame(() => {
      app.querySelector<HTMLElement>(".week-row__day--today")
        ?.closest(".week-row")
        ?.scrollIntoView({ block: "start", behavior: "instant" });
    });
  }
}

// ── Sync modal form to state before tab switch / save ──────────────────────

// "YYYY-MM-DD" from <input type="date"> must be local midnight, not UTC.
// new Date("YYYY-MM-DD") parses as UTC → 1-day offset in non-UTC timezones.
function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// "YYYY-MM-DDTHH:MM" from <input type="datetime-local"> — no TZ suffix means
// browsers treat it as local, but we parse explicitly to be safe.
function parseLocalDateTime(value: string): Date {
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min] = (timePart ?? "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
}

function syncModalForm(): void {
  if (!state.modal) return;
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const summaryEl = get<HTMLInputElement>("modal-summary");
  const startEl = get<HTMLInputElement>("modal-start");
  const endEl = get<HTMLInputElement>("modal-end");
  const locationEl = get<HTMLInputElement>("modal-location");
  const notesEl = get<HTMLTextAreaElement>("modal-notes");
  const rruleEl = get<HTMLSelectElement>("modal-rrule");
  const monthModeEl = get<HTMLSelectElement>("modal-month-mode");
  const monthPosEl = get<HTMLSelectElement>("modal-month-pos");
  const monthWdEl = get<HTMLSelectElement>("modal-month-weekday");
  if (summaryEl) state.modal.summary = summaryEl.value;
  if (startEl?.value) {
    state.modal.startDate = state.modal.allDay
      ? parseLocalDate(startEl.value)
      : parseLocalDateTime(startEl.value);
  }
  if (endEl?.value) {
    if (state.modal.allDay) {
      // User sees inclusive end; store exclusive iCal end (+1 day)
      const d = parseLocalDate(endEl.value);
      state.modal.endDate = new Date(d.getTime() + 86_400_000);
    } else {
      state.modal.endDate = parseLocalDateTime(endEl.value);
    }
  }
  if (locationEl) state.modal.location = locationEl.value;
  if (notesEl) state.modal.notes = notesEl.value;
  if (rruleEl) state.modal.rruleFreq = rruleEl.value as RecurrenceFreq;
  const untilEl = get<HTMLInputElement>("modal-rrule-until");
  if (untilEl?.value) state.modal.rruleUntil = parseLocalDate(untilEl.value);
  if (monthModeEl) state.modal.rruleMonthMode = monthModeEl.value as "monthday" | "weekday";
  if (monthPosEl) state.modal.rruleMonthWeekPos = Number(monthPosEl.value);
  if (monthWdEl) state.modal.rruleMonthWeekDay = monthWdEl.value;
}

// Schnell-Eingabe: freien Text (auch per iOS-Diktat) in Titel + Datum/Zeit
// umwandeln und den Termin-Dialog vorbefüllen. Der User bestätigt danach.
function applyQuickParse(): void {
  if (!state.modal) return;
  const inp = document.getElementById("quick-add-input") as HTMLInputElement | null;
  const txt = inp?.value.trim();
  if (!txt) { inp?.focus(); return; }
  const parsed = parseQuickEvent(txt);
  if (!parsed) return;
  // Manuelle Auswahl (z.B. Familienmitglied) im Formular erhalten.
  syncModalForm();
  if (parsed.title) state.modal.summary = parsed.title;
  state.modal.allDay = parsed.allDay;
  state.modal.startDate = parsed.start;
  state.modal.endDate = parsed.end;
  state.modal.tab = "datum";
  render();
  showTransientBanner(
    parsed.allDay
      ? `📅 ${parsed.start.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" })} · ganztägig`
      : `📅 ${parsed.start.toLocaleString("de-DE", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}`,
  );
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

// ── Long-press on month cells / week rows to create event ─────────────────

function setupLongPress(): void {
  const openModal = (dateStr: string) => {
    navigator.vibrate?.(40);
    const tapped = new Date(dateStr);
    state.selectedDate = tapped;
    state.modal = defaultModalState(state.members, tapped);
    // Suppress the synthetic click that fires after lifting the finger,
    // so day-tap / event-detail handlers don't trigger immediately after.
    const consumeClick = (ev: MouseEvent) => {
      ev.stopPropagation();
      document.removeEventListener("click", consumeClick, true);
    };
    document.addEventListener("click", consumeClick, true);
    render();
  };

  const attachLongPress = (
    el: HTMLElement,
    getDateStr: () => string | undefined,
    ignoreTarget?: (t: HTMLElement) => boolean,
  ) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let startX = 0, startY = 0;
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };

    el.addEventListener("pointerdown", (e) => {
      if (state.modal) return;
      if (ignoreTarget?.((e.target as HTMLElement))) return;
      startX = e.clientX; startY = e.clientY;
      timer = setTimeout(() => {
        timer = null;
        const dateStr = getDateStr();
        if (dateStr) openModal(dateStr);
      }, 500);
    }, { passive: true });

    el.addEventListener("pointermove", (e) => {
      if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) cancel();
    }, { passive: true });

    el.addEventListener("pointerup", cancel, { passive: true });
    el.addEventListener("pointercancel", cancel, { passive: true });
  };

  if (state.viewMode === "month") {
    app.querySelectorAll<HTMLElement>(".month-cell").forEach((cell) => {
      attachLongPress(cell, () => cell.dataset.date);
    });
  } else if (state.viewMode === "week") {
    app.querySelectorAll<HTMLElement>(".week-row").forEach((row) => {
      attachLongPress(
        row,
        () => row.dataset.date,
        // Don't start a create-timer when the finger lands on an existing event
        (t) => !!t.closest("[data-action='event-detail']"),
      );
    });
  }
}

// ── Drag-and-drop ──────────────────────────────────────────────────────────


function setupDragDrop(): void {
  app.querySelectorAll<HTMLElement>("[data-action='event-detail'][data-uid]").forEach((el) => {
    el.addEventListener("touchstart", (e) => onEventTouchStart(e, el), { passive: true });
  });
}

function onEventTouchStart(e: TouchEvent, el: HTMLElement): void {
  const uid = el.dataset.uid;
  if (!uid || state.modal || uid.startsWith("__")) return;
  const touch = e.touches[0];

  const earlyMove = (ev: TouchEvent) => {
    if (!drag || drag.active) return;
    if (Math.abs(ev.touches[0].clientX - drag.startX) > 8 ||
        Math.abs(ev.touches[0].clientY - drag.startY) > 8) {
      cancelDrag();
    }
  };

  // If the finger lifts before the 350ms long-press fires, this was a tap
  // (which opens the detail sheet). Cancel the pending drag so activateDrag
  // doesn't fire afterwards and leave an orphaned ghost floating over the UI.
  const earlyEnd = () => {
    if (drag && !drag.active) cancelDrag();
  };
  document.addEventListener("touchend", earlyEnd, { once: true, passive: true });
  document.addEventListener("touchcancel", earlyEnd, { once: true, passive: true });

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

// Findet die echte HA-UID eines Termins über Titel + Startdatum + Kalender.
// Nötig für frisch angelegte Termine, deren echte UID die App noch nicht kennt
// (calendar.create_event liefert sie nicht zurück).
async function resolveHAUid(client: HAClient, memberId: string, summary: string, start: Date): Promise<string | null> {
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  try {
    const items = await client.getEvents(memberId, new Date(day.getTime() - 86_400_000), new Date(day.getTime() + 2 * 86_400_000));
    const match = items.find((o) =>
      !o.uid.startsWith("local-") &&
      o.summary === summary &&
      o.start.getFullYear() === day.getFullYear() &&
      o.start.getMonth() === day.getMonth() &&
      o.start.getDate() === day.getDate());
    return match?.uid ?? null;
  } catch { return null; }
}

async function moveEvent(uid: string, targetDay: Date): Promise<void> {
  const ev = state.events.find((e) => e.uid === uid);
  if (!ev) return;

  const origStart = new Date(ev.start);
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
  if (config && navigator.onLine) {
    const client = new HAClient(config);
    // Frisch angelegte Termine (local-UID): echte HA-UID erst auflösen, sonst
    // käme das Verschieben nie bei HA an und der Termin „fällt zurück".
    const realUid = uid.startsWith("local-")
      ? await resolveHAUid(client, ev.memberId ?? "", ev.summary, origStart)
      : uid;
    if (realUid) {
      const opts = { location: ev.location, description: ev.description };
      try {
        // Schnellweg: per WebSocket am selben Termin verschieben (behält die UID).
        const ok = await client.updateEvent(ev.memberId ?? "", realUid, ev.summary, newStart, newEnd, ev.allDay, opts);
        if (ok) return;
      } catch (err) {
        console.warn("WS-Verschieben fehlgeschlagen — Fallback:", err instanceof Error ? err.message : err);
      }
      // Fallback (z.B. iOS-PWA ohne WebSocket, oder update nicht möglich):
      // am Zieltag neu anlegen und die alte UID zum Löschen vormerken. Der
      // Poller entfernt die alte Kopie serverseitig.
      try {
        await client.createEvent(ev.memberId ?? "", ev.summary, newStart, newEnd, ev.allDay, opts);
      } catch (err) {
        showTransientBanner(`Verschieben fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`, true);
        return;
      }
      pendingDeletes.set(realUid, PERMANENT);
      savePendingDeletes(pendingDeletes);
      try { await client.deleteEvent(ev.memberId ?? "", realUid); } catch { /* Poller übernimmt */ }
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

  // Enter im Schnell-Eingabe-Feld → parsen und Dialog vorbefüllen
  const quickAdd = document.getElementById("quick-add-input") as HTMLInputElement | null;
  if (quickAdd) {
    quickAdd.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); applyQuickParse(); }
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
        // Always pull fresh data from HA on tab open so cross-device changes are visible immediately
        void syncTodosFromHA().then((items) => {
          if (!items) return;
          state.todos = items;
          if (state.activeTab === "todo") render();
        });
      } else if (action === "tab-einkauf") {
        state.activeTab = "einkauf";
        render();
        // Always pull fresh data from HA on tab open so cross-device changes are visible immediately
        void syncShoppingFromHA().then((items) => {
          if (!items) return;
          state.shopping = items;
          if (state.activeTab === "einkauf") render();
        });

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
        scrollTodayUntil = Date.now() + 3000;
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
          state.selectedDate = tapped;
          state.viewMode = "week";
          state.weekStart = startOfWeek(tapped);
          render();
          void refreshEvents();
        }

      // ── Event modal ──────────────────────────────────────────────────────
      } else if (action === "add-event") {
        state.modal = defaultModalState(state.members, dateForNewEvent());
        render();
      } else if (action === "close-modal") {
        state.modal = null;
        render();
      } else if (action === "quick-parse") {
        applyQuickParse();
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
      } else if (action === "set-reminder") {
        if (!state.modal) return;
        state.modal.reminderMinutes = Number(el.dataset.minutes ?? 0);
        render();
      } else if (action === "select-member") {
        if (!state.modal) return;
        state.modal.memberId = el.dataset.memberId ?? state.modal.memberId;
        render();
      } else if (action === "toggle-weekday") {
        if (!state.modal) return;
        const day = el.dataset.day;
        if (!day) return;
        const days = state.modal.rruleWeekdays;
        if (days.includes(day)) {
          if (days.length > 1) state.modal.rruleWeekdays = days.filter((d) => d !== day);
        } else {
          state.modal.rruleWeekdays = [...days, day];
        }
        render();
      } else if (action === "event-detail") {
        const uid = el.dataset.uid;
        const ev = state.events.find((x) => x.uid === uid);
        if (ev) showEventDetail(ev);

      } else if (action === "close-detail") {
        document.getElementById("event-detail-sheet")?.remove();

      } else if (action === "save-event") {
        const btn = el as HTMLButtonElement;
        if (btn.disabled) return;          // Block double-tap while save is in flight
        e.stopPropagation();
        syncModalForm();
        btn.disabled = true;
        if (state.modal) {
          const count = occurrencePreviewCount(state.modal);
          btn.textContent = count && count > 1 ? `0 / ${count} angelegt…` : "Wird gespeichert…";
        } else {
          btn.textContent = "Wird gespeichert…";
        }
        saveEvent().catch((err) => {
          showTransientBanner(`Fehler beim Speichern: ${err instanceof Error ? err.message : String(err)}`, true);
          // Re-enable only if modal is still open (render() wasn't called on success)
          if (state.modal) {
            btn.disabled = false;
            btn.textContent = state.modal.editUid ? "Aktualisieren" : "Speichern";
          }
        });

      // ── Shopping list ────────────────────────────────────────────────────
      } else if (action === "add-item") {
        { const inp = document.getElementById("list-input") as HTMLInputElement | null;
          if (inp?.value.trim()) addShoppingItem(); else inp?.focus(); }
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
        { const inp = document.getElementById("list-input") as HTMLInputElement | null;
          if (inp?.value.trim()) addTodoItem(); else inp?.focus(); }
      } else if (action === "complete-todo") {
        // Klick direkt nach einem Long-Press (Bearbeiten) nicht als Abhaken werten.
        if (suppressNextTodoTap) { suppressNextTodoTap = false; return; }
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
      } else if (action === "todo-reminder") {
        // Verhindern, dass der Tap auf die Glocke das Todo abhakt (die Zeile
        // selbst ist der complete-todo-Button).
        e.stopPropagation();
        const id = el.dataset.id;
        if (id) showTodoReminderSheet(id);

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
      } else if (action === "import-ics") {
        triggerICSImport();
      } else if (action === "open-settings") {
        renderConfig(true);
      }
    });
  });

  // Recurrence selects fire "change", not "click"
  app.querySelectorAll<HTMLSelectElement>("select[data-action='recur-change']").forEach((sel) => {
    sel.addEventListener("change", () => {
      syncModalForm();
      render();
    });
  });

  // "Serie endet am" date input fires "change" after the native picker closes
  const untilInput = app.querySelector<HTMLInputElement>("#modal-rrule-until");
  if (untilInput) {
    untilInput.addEventListener("change", () => {
      syncModalForm();
      render();
    });
  }

  // When the start datetime changes, keep the end ≥ start + original duration.
  // If end would fall before start, snap end to start + 1 h.
  const modalStartInput = app.querySelector<HTMLInputElement>("#modal-start");
  const modalEndInput = app.querySelector<HTMLInputElement>("#modal-end");
  if (modalStartInput && modalEndInput && state.modal && !state.modal.allDay) {
    modalStartInput.addEventListener("change", () => {
      if (!state.modal) return;
      const prevStart = state.modal.startDate.getTime();
      const prevEnd = state.modal.endDate.getTime();
      const duration = Math.max(prevEnd - prevStart, 0);
      const newStart = parseLocalDateTime(modalStartInput.value);
      const newEnd = new Date(newStart.getTime() + (duration > 0 ? duration : 3_600_000));
      modalEndInput.value = fmtDateTimeLocal(newEnd);
      state.modal.startDate = newStart;
      state.modal.endDate = newEnd;
    });
  }
}

// ── Notification settings sheet ────────────────────────────────────────────

function showNotificationsSheet(): void {
  document.getElementById("notif-sheet")?.remove();

  const cfg: NotifConfig = loadNotifConfig() ?? { memberServices: {} };
  let availableServices: string[] = [];

  function escHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function haYaml(mapping: Record<string, string[]>): string {
    // Build a list of (member, services) pairs for the iteration. Only
    // members that have at least one service configured.
    // Normalise mapping keys: accept both "fede" and "calendar.fede".
    const normKey = (id: string) => id.startsWith("calendar.") ? id : `calendar.${id}`;
    const normMapping: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(mapping)) normMapping[normKey(k)] = v;
    const entitiesUsed = state.members.filter((m) => (normMapping[normKey(m.id)]?.length ?? 0) > 0);
    if (entitiesUsed.length === 0) {
      return "# Noch kein Familienmitglied einem Gerät zugeordnet.\n# Wähle oben mindestens einen Empfänger pro Person aus.";
    }
    const entityIds = entitiesUsed.map((m) => `        - ${normKey(m.id)}`).join("\n");
    const forEachItems = entitiesUsed
      .map((m) => {
        const svcs = (normMapping[normKey(m.id)] ?? []).map((s) => `"${s}"`).join(", ");
        return `        - {entity: "${normKey(m.id)}", name: "${m.name}", services: [${svcs}]}`;
      })
      .join("\n");
    return `# Einstellungen → Automatisierungen → + → YAML einfügen:
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
            weekday: >-
              {{ ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'][now().weekday()] }}
            msg_title: "📅 {{ weekday }}, {{ now().strftime('%-d. %-m.') }} – {{ repeat.item.name }}"
            msg_body: >-
              {%- set ns = namespace(lines=[], seen=[], allday_norm=[]) -%}
              {%- for e in evs -%}
                {%- if 'T' not in (e.start | string) -%}
                  {%- set ns.allday_norm = ns.allday_norm + [e.summary.lower().split() | sort | join(' ')] -%}
                {%- endif -%}
              {%- endfor -%}
              {%- for e in evs | sort(attribute='start') -%}
                {%- set norm = e.summary.lower().split() | sort | join(' ') -%}
                {%- if 'T' not in (e.start | string) -%}
                  {%- if norm not in ns.seen -%}
                    {%- set ns.lines = ns.lines + [e.summary + ' – ganztägig'] -%}
                    {%- set ns.seen = ns.seen + [norm] -%}
                  {%- endif -%}
                {%- elif norm in ns.allday_norm -%}
                {%- else -%}
                  {%- set t = (e.start | as_datetime | as_local).strftime('%H:%M') -%}
                  {%- set line = t + ' ' + e.summary -%}
                  {%- if line not in ns.seen -%}
                    {%- set ns.lines = ns.lines + [line] -%}
                    {%- set ns.seen = ns.seen + [line] -%}
                  {%- endif -%}
                {%- endif -%}
              {%- endfor -%}
              {{ ns.lines | join('\\n') }}
            target_services: "{{ repeat.item.services }}"
        - condition: template
          value_template: "{{ evs | length > 0 }}"
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

  const savedCount = Object.values(cfg.memberServices).reduce((a, arr) => a + arr.length, 0);
  const savedMemberCount = Object.keys(cfg.memberServices).length;
  const initialStatus = savedCount > 0
    ? `Gespeichert: ${savedMemberCount} Person(en), ${savedCount} Gerät-Zuordnung(en)`
    : "";

  const html = `<div id="notif-sheet" class="sheet-backdrop">
    <div class="bottom-sheet bottom-sheet--large" data-stop-propagation>
      <div class="bottom-sheet__handle"></div>
      <div class="notif-sheet-header">
        <div class="notif-sheet-title-row">
          <p class="bottom-sheet__title">🔔 Benachrichtigungen</p>
          <button id="notif-close-btn" class="notif-close-btn" aria-label="Schließen">✕</button>
        </div>
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
        <div id="notif-status" class="notif-status">${initialStatus}</div>
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

  if (initialStatus) {
    const statusEl = sheet.querySelector<HTMLElement>("#notif-status")!;
    statusEl.style.color = "#30D158";
  }

  sheet.addEventListener("click", (e) => {
    if ((e.target as HTMLElement) === sheet) sheet.remove();
  });
  sheet.querySelector<HTMLElement>("[data-stop-propagation]")!
    .addEventListener("click", (e) => e.stopPropagation());
  sheet.querySelector<HTMLElement>("#notif-close-btn")!
    .addEventListener("click", () => sheet.remove());

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
      const savedTotal = Object.values(cfg.memberServices).reduce((a, arr) => a + arr.length, 0);
      if (savedTotal > 0) {
        const mCount = Object.keys(cfg.memberServices).length;
        showStatus(`Gespeichert: ${mCount} Person(en), ${savedTotal} Gerät-Zuordnung(en)`, true);
      } else if (availableServices.length > 0) {
        showStatus(`${availableServices.length} Geräte gefunden — bitte Zuordnung speichern`, true);
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
    cfg.memberServices = mapping; // keep closure in sync so Geräte-refresh re-renders correctly
    saveNotifConfig({ memberServices: mapping });
    const count = Object.values(mapping).reduce((acc, arr) => acc + arr.length, 0);
    const memberCount = Object.keys(mapping).length;
    showStatus(`Gespeichert ✓ — ${memberCount} Person(en), ${count} Gerät-Zuordnung(en)`, true);
  });

  sheet.querySelector<HTMLElement>("#notif-test-btn")!.addEventListener("click", async () => {
    const mapping = readMapping(sheet);
    if (Object.keys(mapping).length === 0) {
      showStatus("Keine Geräte ausgewählt — bitte zuerst Empfänger zuordnen", false);
      return;
    }
    const btn = sheet.querySelector<HTMLElement>("#notif-test-btn")!;
    btn.textContent = "…";
    btn.setAttribute("disabled", "");

    // Build today's event list from already-loaded state, same format as YAML automation.
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const WEEKDAYS_DE = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const today = new Date();
    const dateLabel = `${WEEKDAYS_DE[today.getDay()]}, ${today.getDate()}. ${today.getMonth() + 1}.`;

    function buildBody(memberId: string): string {
      const evs = state.events.filter((e) =>
        e.memberId === memberId &&
        e.start < todayEnd &&
        (e.allDay ? e.end >= todayStart : e.end > todayStart),
      );
      const lines = evs
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .map((e) =>
          e.allDay
            ? `${e.summary} – ganztägig`
            : `${pad2(e.start.getHours())}:${pad2(e.start.getMinutes())} ${e.summary}`,
        );
      return lines.length > 0 ? lines.join("\n") : "Heute keine Termine ✓";
    }

    const sends: Promise<void>[] = [];
    for (const [memberId, services] of Object.entries(mapping)) {
      const member = state.members.find((m) => m.id === memberId);
      if (!member || services.length === 0) continue;
      const title = `📅 ${dateLabel} – ${member.name}`;
      const message = buildBody(memberId);
      for (const svc of services) {
        sends.push(sendTestNotification(svc, title, message));
      }
    }

    const results = await Promise.allSettled(sends);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length === 0) {
      showStatus(`Tagesübersicht an ${results.length} Gerät(e) gesendet ✓`, true);
    } else {
      const firstErr = (failed[0] as PromiseRejectedResult).reason;
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      showStatus(`${failed.length}/${results.length} fehlgeschlagen: ${msg}`, false);
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
        <span class="filter-row__name">${escHtml(m.name)}</span>
        <span class="filter-row__check">${on ? checkSvg : ""}</span>
      </button>`;
    }).join("");

    const dupeCount = findDuplicateUids(state.events).strict.length;
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
        <button class="bottom-sheet__close" data-action="close-sheet">&times;</button>
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
            ${(() => {
              const nc = loadNotifConfig();
              const total = Object.values(nc?.memberServices ?? {}).reduce((a, arr) => a + arr.length, 0);
              return total > 0
                ? `<span style="font-size:12px;font-weight:600;color:#30D158;">${total} Zuordnung(en) · Bearbeiten ›</span>`
                : `<span style="font-size:12px;font-weight:600;color:rgba(235,235,245,0.5);">Einrichten ›</span>`;
            })()}
          </button>
          <button class="filter-row" id="filter-colors-btn">
            <span class="filter-row__name">🎨 Farben anpassen</span>
            <span style="font-size:12px;font-weight:600;color:rgba(235,235,245,0.5);">›</span>
          </button>
          <button class="filter-row" id="filter-birthday-btn">
            <span class="filter-row__name">🎂 Geburtstage</span>
            ${(() => {
              const blocked = loadDeletedBirthdays();
              const count = loadBirthdayData().filter((bd) => !blocked.has(birthdayKey(bd))).length;
              return count > 0
                ? `<span style="font-size:12px;font-weight:600;color:#FF2D55;">${count} Einträge · Bearbeiten ›</span>`
                : `<span style="font-size:12px;font-weight:600;color:rgba(235,235,245,0.5);">Einrichten ›</span>`;
            })()}
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
    sheet.querySelector<HTMLElement>("[data-action='close-sheet']")!
      .addEventListener("click", () => sheet.remove());
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
    sheet.querySelector<HTMLElement>("#filter-colors-btn")?.addEventListener("click", () => {
      sheet.remove();
      showMemberColorSheet();
    });
    sheet.querySelector<HTMLElement>("#filter-birthday-btn")?.addEventListener("click", () => {
      sheet.remove();
      showBirthdaySettingsSheet();
    });
  }

  mount();
}

// ── Member color picker sheet ──────────────────────────────────────────────

const PRESET_COLORS = [
  "#0A84FF", "#5856D6", "#BF5AF2",
  "#64D2FF", "#32ADE6", "#30D158",
  "#34C759", "#00C7BE", "#34AADC",
  "#FF2D55", "#FF6B35", "#FF9F0A",
  "#FFD60A", "#FF3B30", "#AC8E68",
  "#8E8E93", "#636366", "#EBEBF5",
];

function showMemberColorSheet(): void {
  document.getElementById("member-colors-sheet")?.remove();

  function showPickerFor(member: FamilyMember): void {
    document.getElementById("color-picker-sheet")?.remove();

    const swatches = PRESET_COLORS.map((c) => {
      const active = member.color.toLowerCase() === c.toLowerCase() ? " color-swatch--active" : "";
      return `<button class="color-swatch${active}" data-color="${c}" style="background:${c};"></button>`;
    }).join("");

    const html = `<div id="color-picker-sheet" class="sheet-backdrop">
      <div class="bottom-sheet" data-stop-propagation>
        <div class="bottom-sheet__handle"></div>
        <p class="bottom-sheet__title">Farbe: ${escHtml(member.name)}</p>
        <div class="color-swatch-grid">${swatches}</div>
        <label class="color-picker-custom-row">
          <span class="color-picker-custom-label">Eigene Farbe</span>
          <input type="color" id="color-custom-input" value="${member.color}" class="color-picker-native">
        </label>
        <div class="color-picker-actions">
          <button class="ics-import-cancel" id="color-picker-cancel">Abbrechen</button>
          <button class="ics-import-confirm" id="color-picker-confirm">Übernehmen</button>
        </div>
      </div>
    </div>`;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    const pickerSheet = wrapper.firstElementChild as HTMLElement;
    document.body.appendChild(pickerSheet);

    let selectedColor = member.color;

    pickerSheet.querySelector<HTMLInputElement>("#color-custom-input")!
      .addEventListener("input", (e) => {
        selectedColor = (e.target as HTMLInputElement).value;
        pickerSheet.querySelectorAll<HTMLElement>(".color-swatch")
          .forEach((s) => s.classList.remove("color-swatch--active"));
      });

    pickerSheet.querySelectorAll<HTMLElement>(".color-swatch").forEach((swatch) => {
      swatch.addEventListener("click", () => {
        selectedColor = swatch.dataset.color!;
        pickerSheet.querySelectorAll<HTMLElement>(".color-swatch")
          .forEach((s) => s.classList.remove("color-swatch--active"));
        swatch.classList.add("color-swatch--active");
        pickerSheet.querySelector<HTMLInputElement>("#color-custom-input")!.value = selectedColor;
      });
    });

    pickerSheet.querySelector("#color-picker-cancel")!.addEventListener("click", () => {
      pickerSheet.remove();
      showMemberColorSheet();
    });

    pickerSheet.querySelector("#color-picker-confirm")!.addEventListener("click", () => {
      saveMemberColor(member.id, selectedColor);
      state.members = state.members.map((m) => m.id === member.id ? { ...m, color: selectedColor } : m);
      pickerSheet.remove();
      render();
      showMemberColorSheet();
    });

    pickerSheet.addEventListener("click", (e) => {
      if ((e.target as HTMLElement) === pickerSheet) { pickerSheet.remove(); showMemberColorSheet(); }
    });
    pickerSheet.querySelector<HTMLElement>("[data-stop-propagation]")!
      .addEventListener("click", (e) => e.stopPropagation());
  }

  const memberRows = state.members.map((m) =>
    `<button class="filter-row member-color-row" data-member-id="${m.id}">
      <span class="filter-row__dot" style="background:${m.color};box-shadow:0 0 5px ${m.color}88;"></span>
      <span class="filter-row__name">${escHtml(m.name)}</span>
      <span class="member-color-chevron">›</span>
    </button>`
  ).join("");

  const html = `<div id="member-colors-sheet" class="sheet-backdrop">
    <div class="bottom-sheet" data-stop-propagation>
      <div class="bottom-sheet__handle"></div>
      <p class="bottom-sheet__title">🎨 Farben anpassen</p>
      <div class="filter-member-list">${memberRows}</div>
      <div style="padding:14px 20px 0;">
        <button class="ics-import-cancel" id="member-colors-close">Schließen</button>
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
  sheet.querySelector<HTMLElement>("#member-colors-close")!
    .addEventListener("click", () => sheet.remove());

  sheet.querySelectorAll<HTMLElement>("[data-member-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.memberId!;
      const member = state.members.find((m) => m.id === id)!;
      sheet.remove();
      showPickerFor(member);
    });
  });
}

// ── Birthday ICS settings sheet ────────────────────────────────────────────

function showBirthdaySettingsSheet(): void {
  document.getElementById("birthday-settings-sheet")?.remove();

  const MONTHS_DE = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

  function buildSheet(): HTMLElement {
    const blocked = loadDeletedBirthdays();
    const data = loadBirthdayData()
      .filter((bd) => !blocked.has(birthdayKey(bd)))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    const monthOpts = MONTHS_DE.map((m, i) => `<option value="${i}">${m}</option>`).join("");

    const listRows = data.length === 0
      ? `<p style="font-size:13px;color:rgba(235,235,245,0.4);padding:12px 20px;">Noch keine Geburtstage gespeichert.</p>`
      : data.map((bd, i) => {
          const yearStr = bd.year && bd.year >= 1900 ? ` ${bd.year}` : "";
          return `<div class="filter-row" style="justify-content:space-between;">
            <span style="font-size:15px;">${escHtml(cleanBirthdayName(bd.name))}</span>
            <span style="display:flex;align-items:center;gap:12px;">
              <span style="font-size:13px;color:rgba(235,235,245,0.5);">${bd.day}. ${MONTHS_DE[bd.month]}${yearStr}</span>
              <button data-delete-index="${i}" style="background:none;border:none;padding:4px 6px;cursor:pointer;font-size:16px;color:rgba(235,235,245,0.4);line-height:1;" aria-label="Löschen">✕</button>
            </span>
          </div>`;
        }).join("");

    const iStyle = "background:rgba(120,120,128,0.18);border:none;border-radius:10px;padding:10px 12px;font-size:14px;color:#EBEBF5;outline:none;box-sizing:border-box;";

    const html = `<div id="birthday-settings-sheet" class="sheet-backdrop">
      <div class="bottom-sheet" data-stop-propagation>
        <div class="bottom-sheet__handle"></div>
        <p class="bottom-sheet__title">🎂 Geburtstage</p>

        <div style="border-top:1px solid rgba(120,120,128,0.2);padding:12px 20px 14px;">
          <p style="font-size:12px;color:rgba(235,235,245,0.4);margin:0 0 8px;">Manuell hinzufügen</p>
          <input id="bd-name" placeholder="Name" style="width:100%;margin-bottom:8px;${iStyle}" autocomplete="off" />
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <input id="bd-day" type="number" placeholder="Tag" min="1" max="31" style="flex:1;${iStyle}" />
            <select id="bd-month" style="flex:2;${iStyle}">${monthOpts}</select>
            <input id="bd-year" type="number" placeholder="Jahr" min="1900" max="2025" style="flex:2;${iStyle}" />
          </div>
          <button class="ics-import-confirm" id="bd-add" style="width:100%;">+ Hinzufügen</button>
        </div>

        ${data.length > 0 ? `<p style="font-size:12px;color:rgba(235,235,245,0.4);padding:0 20px 4px;">${data.length} Einträge</p>` : ""}
        <div style="overflow-y:auto;max-height:40vh;">${listRows}</div>
        <div style="padding:12px 20px;">
          <button class="ics-import-cancel" id="birthday-close" style="width:100%;">Schließen</button>
        </div>
      </div>
    </div>`;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    return wrapper.firstElementChild as HTMLElement;
  }

  function mount(): void {
    document.getElementById("birthday-settings-sheet")?.remove();
    const sheet = buildSheet();
    document.body.appendChild(sheet);

    sheet.addEventListener("click", (e) => { if ((e.target as HTMLElement) === sheet) sheet.remove(); });
    sheet.querySelector<HTMLElement>("[data-stop-propagation]")!
      .addEventListener("click", (e) => e.stopPropagation());
    sheet.querySelector<HTMLElement>("#birthday-close")!
      .addEventListener("click", () => sheet.remove());

    sheet.querySelector<HTMLElement>("#bd-add")!
      .addEventListener("click", () => {
        const name = (sheet.querySelector<HTMLInputElement>("#bd-name")!).value.trim();
        const day  = parseInt((sheet.querySelector<HTMLInputElement>("#bd-day")!).value, 10);
        const month = parseInt((sheet.querySelector<HTMLSelectElement>("#bd-month")!).value, 10);
        const yearVal = parseInt((sheet.querySelector<HTMLInputElement>("#bd-year")!).value, 10);
        if (!name || !day || isNaN(day) || day < 1 || day > 31) {
          showTransientBanner("Name und gültiger Tag erforderlich", true);
          return;
        }
        const entry: BirthdayEntry = { name, month, day };
        if (!isNaN(yearVal) && yearVal >= 1900 && yearVal <= new Date().getFullYear()) entry.year = yearVal;
        // Falls dieser Geburtstag zuvor gelöscht (blockiert) war, wieder freigeben.
        const blocked = loadDeletedBirthdays();
        if (blocked.delete(birthdayKey(entry))) {
          saveDeletedBirthdays(blocked);
          pushDeletedBirthdaysToHA(blocked);
        }
        const data = loadBirthdayData();
        data.push(entry);
        localStorage.setItem(BIRTHDAY_DATA_KEY, JSON.stringify(data));
        pushBirthdayDataToHA(data);
        render();
        mount();
      });

    sheet.querySelectorAll<HTMLElement>("[data-delete-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.deleteIndex);
        // Gleiche Reihenfolge wie in buildSheet (gefiltert + sortiert), damit
        // data-delete-index korrekt zuordnet.
        const blocked = loadDeletedBirthdays();
        const visible = loadBirthdayData()
          .filter((bd) => !blocked.has(birthdayKey(bd)))
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name));
        const removed = visible[idx];
        if (removed) {
          // Aus der Datenliste entfernen …
          const data = loadBirthdayData().filter((bd) => birthdayKey(bd) !== birthdayKey(removed));
          localStorage.setItem(BIRTHDAY_DATA_KEY, JSON.stringify(data));
          pushBirthdayDataToHA(data);
          // … und auf die persistente Blockliste setzen, damit der Geburtstag
          // bei einem künftigen iCloud-Re-Import nicht wieder auftaucht.
          blocked.add(birthdayKey(removed));
          saveDeletedBirthdays(blocked);
          pushDeletedBirthdaysToHA(blocked);
        }
        render();
        mount();
      });
    });
  }

  mount();
}

// ── Search sheet ───────────────────────────────────────────────────────────

// Wide-range event cache for search: covers ±2 years, refreshed every 5 min.
let searchEventsCache: CalendarEvent[] = [];
let searchEventsCacheTime = 0;

async function fetchSearchRange(): Promise<CalendarEvent[]> {
  const config = loadConfig();
  if (!config) return [];
  const now = new Date();
  const client = new HAClient(config);
  const fresh = await client.getAllEvents(addMonths(now, -12), addMonths(now, 24));
  searchEventsCache = fresh;
  searchEventsCacheTime = Date.now();
  return fresh;
}

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
  let fetchingWide = false;

  // Deduplicated union of cached view events + wide-range search cache
  function searchPool(): CalendarEvent[] {
    const seen = new Set<string>();
    const pool: CalendarEvent[] = [];
    for (const e of [...state.events, ...searchEventsCache]) {
      if (!seen.has(e.uid)) { seen.add(e.uid); pool.push(e); }
    }
    return pool;
  }

  function escHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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

    const pool = searchPool();
    const matches = pool
      .filter((e) => e.summary.toLowerCase().includes(q) || (e.description ?? "").toLowerCase().includes(q) || (e.location ?? "").toLowerCase().includes(q))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (matches.length === 0) {
      resultsEl.innerHTML = fetchingWide
        ? `<p class="search-hint">Suche lädt…</p>`
        : `<p class="search-hint">Keine Treffer</p>`;
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
          <span class="search-result__meta">${when}${member ? ` · ${escHtml(member.name)}` : ""}</span>
        </span>
      </button>`;
    }).join("");

    resultsEl.querySelectorAll<HTMLElement>("[data-uid]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ev = searchPool().find((e) => e.uid === btn.dataset.uid);
        if (!ev) return;
        // If this event was accidentally hidden, restore it on ALL devices.
        if (pendingDeletes.get(ev.uid) === PERMANENT || hiddenFingerprints.has(eventFp(ev))) {
          restoreEventEverywhere(ev);
        }
        sheet.remove();
        state.viewMode = "week";
        state.weekStart = startOfWeek(ev.start);
        render();
        void refreshEvents();
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

  // Fetch wide range if cache is missing or older than 5 minutes
  if (Date.now() - searchEventsCacheTime > 5 * 60 * 1000) {
    fetchingWide = true;
    fetchSearchRange()
      .then(() => {
        fetchingWide = false;
        if (document.getElementById("search-sheet")) renderResults(input.value);
      })
      .catch(() => { fetchingWide = false; });
  }
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
  // Den vollen Titel speichern (inkl. "mitnehmen"), damit die Kategorie auf
  // allen synchronisierten Geräten stabil ableitbar bleibt. "mitnehmen" wird
  // nur bei der Anzeige entfernt (cleanTodoTitle im Render).
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

// ── Todo reminder sheet ────────────────────────────────────────────────────
// Datum + Uhrzeit für eine Push-Erinnerung wählen. Der native
// datetime-local-Picker öffnet auf iOS das Kalender-Popup + Uhrzeitrad.
// Die Benachrichtigung verschickt der Poller (reminder_poller.py) über die
// HA Companion App an die Geräte des zugeordneten Familienmitglieds.

function showTodoReminderSheet(id: string): void {
  const item = state.todos.find((i) => i.id === id);
  if (!item) return;
  const pad = (n: number) => String(n).padStart(2, "0");
  // Vorbelegung: bestehende Erinnerung, sonst die nächste volle Stunde.
  const def = item.remindAt
    ? new Date(item.remindAt)
    : (() => { const d = new Date(Date.now() + 60 * 60 * 1000); d.setMinutes(0, 0, 0); return d; })();
  const defVal = `${def.getFullYear()}-${pad(def.getMonth() + 1)}-${pad(def.getDate())}T${pad(def.getHours())}:${pad(def.getMinutes())}`;
  const iStyle = "width:100%;background:rgba(120,120,128,0.18);border:none;border-radius:10px;padding:12px;font-size:16px;color:#EBEBF5;outline:none;box-sizing:border-box;color-scheme:dark;font-family:inherit;";
  const html = `<div id="todo-reminder-sheet" class="sheet-backdrop">
    <div class="bottom-sheet" data-stop-propagation>
      <div class="bottom-sheet__handle"></div>
      <button class="bottom-sheet__close" id="todo-remind-close">&times;</button>
      <p class="bottom-sheet__title">🔔 Erinnerung</p>
      <div style="padding:4px 20px 8px;">
        <p style="font-size:15px;font-weight:600;color:#EBEBF5;margin:0 0 14px;">${escHtml(cleanTodoTitle(item.title, item.category))}</p>
        <input id="todo-remind-input" type="datetime-local" value="${defVal}" style="${iStyle}" />
      </div>
      <div style="padding:10px 20px 4px;">
        <button class="ics-import-confirm" id="todo-remind-save" style="width:100%;">Erinnerung speichern</button>
        ${item.remindAt ? `<button class="ics-import-cancel" id="todo-remind-remove" style="width:100%;margin-top:8px;color:#FF453A;">Erinnerung entfernen</button>` : ""}
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
  sheet.querySelector<HTMLElement>("#todo-remind-close")!
    .addEventListener("click", () => sheet.remove());
  sheet.querySelector<HTMLElement>("#todo-remind-save")!.addEventListener("click", () => {
    const val = (sheet.querySelector("#todo-remind-input") as HTMLInputElement).value;
    const ts = val ? new Date(val).getTime() : NaN;
    if (isNaN(ts)) {
      showTransientBanner("Bitte Datum und Uhrzeit wählen", true);
      return;
    }
    if (ts <= Date.now()) {
      showTransientBanner("Der Zeitpunkt liegt in der Vergangenheit", true);
      return;
    }
    item.remindAt = ts;
    saveTodoItems(state.todos);
    sheet.remove();
    render();
    const when = new Date(ts).toLocaleString("de-DE", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
    showTransientBanner(`🔔 Erinnerung gesetzt: ${when}`);
  });
  sheet.querySelector<HTMLElement>("#todo-remind-remove")?.addEventListener("click", () => {
    delete item.remindAt;
    saveTodoItems(state.todos);
    sheet.remove();
    render();
  });
}

// ── Todo bearbeiten (Long-Press) ───────────────────────────────────────────
// Langes Tippen auf ein To-Do öffnet ein Sheet zum Umbenennen (Tippfehler,
// nachträgliche Änderung). Kein Kollidieren mit dem Abhaken (kurzer Tap).

// Nach einem Long-Press feuert noch ein Klick (Abhaken). Dieses Flag lässt den
// complete-todo-Handler diesen einen Klick überspringen.
let suppressNextTodoTap = false;

function setupTodoLongPress(): void {
  if (state.activeTab !== "todo") return;
  app.querySelectorAll<HTMLElement>(".list-item[data-action='complete-todo']").forEach((row) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sx = 0, sy = 0;
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    row.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("[data-action='todo-reminder']")) return;
      sx = e.clientX; sy = e.clientY;
      timer = setTimeout(() => {
        timer = null;
        suppressNextTodoTap = true;
        navigator.vibrate?.(40);
        const id = row.dataset.id;
        if (id) showTodoEditSheet(id);
      }, 500);
    }, { passive: true });
    row.addEventListener("pointermove", (e) => {
      if (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8) cancel();
    }, { passive: true });
    row.addEventListener("pointerup", cancel, { passive: true });
    row.addEventListener("pointercancel", cancel, { passive: true });
  });
}

function showTodoEditSheet(id: string): void {
  const item = state.todos.find((i) => i.id === id);
  if (!item) return;
  const iStyle = "width:100%;background:rgba(120,120,128,0.18);border:none;border-radius:10px;padding:12px;font-size:16px;color:#EBEBF5;outline:none;box-sizing:border-box;";
  const html = `<div id="todo-edit-sheet" class="sheet-backdrop">
    <div class="bottom-sheet" data-stop-propagation>
      <div class="bottom-sheet__handle"></div>
      <button class="bottom-sheet__close" id="todo-edit-close">&times;</button>
      <p class="bottom-sheet__title">✏️ To-Do bearbeiten</p>
      <div style="padding:4px 20px 8px;">
        <input id="todo-edit-input" type="text" value="${escHtml(item.title)}" style="${iStyle}" autocomplete="off" enterkeyhint="done" />
      </div>
      <div style="padding:10px 20px 4px;">
        <button class="ics-import-confirm" id="todo-edit-save" style="width:100%;">Speichern</button>
      </div>
    </div>
  </div>`;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const sheet = wrapper.firstElementChild as HTMLElement;
  document.body.appendChild(sheet);
  const input = sheet.querySelector("#todo-edit-input") as HTMLInputElement;

  const save = () => {
    const val = input.value.trim();
    if (!val) { input.focus(); return; }
    item.title = val;
    item.category = categorizeTodoItem(val);
    saveTodoItems(state.todos);
    sheet.remove();
    render();
  };
  sheet.addEventListener("click", (e) => { if ((e.target as HTMLElement) === sheet) sheet.remove(); });
  sheet.querySelector<HTMLElement>("[data-stop-propagation]")!.addEventListener("click", (e) => e.stopPropagation());
  sheet.querySelector<HTMLElement>("#todo-edit-close")!.addEventListener("click", () => sheet.remove());
  sheet.querySelector<HTMLElement>("#todo-edit-save")!.addEventListener("click", save);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

// ── Event detail sheet ─────────────────────────────────────────────────────

async function deleteEventSeries(sid: string): Promise<void> {
  // Step 1: immediately hide everything visible in the current view and mark
  // the series ID as deleted so ALL future fetches (any date range) filter it out.
  const visibleSeriesEvents = state.events.filter((e) => extractSeriesId(e.description) === sid);
  for (const e of visibleSeriesEvents) {
    pendingDeletes.set(e.uid, PERMANENT);
    hiddenFingerprints.add(eventFp(e));
  }
  deletedSeriesIds.add(sid);
  savePendingDeletes(pendingDeletes);
  saveHiddenFps(hiddenFingerprints);
  saveDeletedSids(deletedSeriesIds);
  state.events = state.events.filter((e) => extractSeriesId(e.description) !== sid);
  saveCachedEvents(state.events);
  render();

  const config = loadConfig();
  if (!config || !navigator.onLine) {
    showTransientBanner(`${visibleSeriesEvents.length} Termine lokal ausgeblendet ✓`);
    return;
  }

  // Step 2: fetch a wide date range to find ALL occurrences that weren't in the
  // current view, then delete every one of them from HA.
  const client = new HAClient(config);
  let allSeriesEvents = visibleSeriesEvents;
  try {
    const wideStart = new Date(Date.now() - 90 * 86_400_000);      // 3 months back
    const wideEnd   = new Date(Date.now() + 3 * 365 * 86_400_000); // 3 years ahead
    const broadFetch = await client.getAllEvents(wideStart, wideEnd);
    const found = broadFetch.filter((e) => extractSeriesId(e.description) === sid);
    // Track fingerprints and UIDs for the newly discovered events too
    for (const e of found) {
      pendingDeletes.set(e.uid, PERMANENT);
      hiddenFingerprints.add(eventFp(e));
    }
    savePendingDeletes(pendingDeletes);
    saveHiddenFps(hiddenFingerprints);
    // Merge visible + discovered, deduplicated by uid
    const seen = new Set(visibleSeriesEvents.map((e) => e.uid));
    allSeriesEvents = [...visibleSeriesEvents, ...found.filter((e) => !seen.has(e.uid))];
  } catch { /* network error — fall back to deleting only the visible events */ }

  const toDelete = allSeriesEvents.filter((e) => !e.uid.startsWith("local-"));
  let firstErr = "";
  const tasks = toDelete.map((e) => () =>
    client.deleteEvent(e.memberId ?? "", e.uid, e.recurrenceId).catch((err: unknown) => {
      if (!firstErr) firstErr = err instanceof Error ? err.message : String(err);
      throw err;
    }),
  );
  const { fulfilled, rejected: fail } = await runBatch(tasks, 5);
  if (fail > 0) {
    console.error(`[deleteEventSeries] ${fail} failures, first: ${firstErr}`);
    showTransientBanner(
      `${fulfilled} von ${toDelete.length} gelöscht · ${fail} fehlgeschlagen (${escHtml(String(firstErr))})`,
      true,
    );
  } else {
    showTransientBanner(`${allSeriesEvents.length} Termine gelöscht ✓`, false);
  }
}

function showDeleteSeriesDialog(ev: CalendarEvent, sid: string, count: number, detailSheet: HTMLElement): void {
  const dlg = document.createElement("div");
  dlg.className = "delete-series-backdrop";
  dlg.innerHTML = `
    <div class="delete-series-sheet">
      <p class="delete-series-title">Termin löschen</p>
      <p class="delete-series-subtitle">„${escHtml(ev.summary)}" ist Teil einer Serie von ${count} Terminen.</p>
      <button class="delete-series-btn" id="dsd-single">Nur diesen Termin</button>
      <button class="delete-series-btn delete-series-btn--danger" id="dsd-all">Alle ${count} Termine der Serie löschen</button>
      <button class="delete-series-btn delete-series-btn--cancel" id="dsd-cancel">Abbrechen</button>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector("#dsd-single")!.addEventListener("click", () => {
    dlg.remove(); detailSheet.remove(); void deleteEvent(ev);
  });
  dlg.querySelector("#dsd-all")!.addEventListener("click", () => {
    dlg.remove(); detailSheet.remove(); void deleteEventSeries(sid);
  });
  dlg.querySelector("#dsd-cancel")!.addEventListener("click", () => dlg.remove());
}

function showEventDetail(ev: CalendarEvent): void {
  document.getElementById("event-detail-sheet")?.remove();
  const member = state.members.find((m) => m.id === ev.memberId);
  const color = member?.color ?? "#8E8E93";
  const grad = `linear-gradient(135deg,${color} 0%,${color}88 100%)`;

  const pad = (n: number) => String(n).padStart(2, "0");
  const fmtDate = (d: Date) =>
    `${d.getDate()}. ${["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][d.getMonth()]} ${d.getFullYear()}`;
  const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const diffDays = Math.round((ev.end.getTime() - ev.start.getTime()) / 86_400_000);
  const when = ev.allDay
    ? (diffDays > 1 ? `${fmtDate(ev.start)} – ${fmtDate(ev.end)}` : fmtDate(ev.start))
    : `${fmtDate(ev.start)}, ${fmtTime(ev.start)} – ${fmtTime(ev.end)}`;

  // Generierte Termine (Feiertage, MotoGP) sind schreibgeschützt — nur teilen.
  const isReadOnly = ev.memberId === HOLIDAY_MEMBER_ID || ev.memberId === MOTOGP_MEMBER_ID;
  const actions = isReadOnly
    ? `<div class="detail-actions">
        <button class="detail-share" data-action="share-event-from-detail">Teilen</button>
      </div>`
    : `<div class="detail-actions">
        <button class="detail-edit" data-action="edit-event-from-detail">Bearbeiten</button>
        <button class="detail-share" data-action="share-event-from-detail">Teilen</button>
        <button class="detail-delete" data-action="delete-event-from-detail">Löschen</button>
      </div>
      <div class="detail-actions detail-actions--secondary">
        <button class="detail-ics" data-action="ics-event-from-detail">ICS-Datei herunterladen</button>
      </div>
      <p class="detail-ics-hint">Speichert in Downloads → Signal: + → Datei → Downloads → anhängen</p>`;

  const html = `<div id="event-detail-sheet" class="detail-backdrop" data-action="close-detail">
    <div class="detail-sheet" data-stop-propagation>
      <div class="detail-handle"></div>
      <div class="detail-bar" style="background:${grad};"></div>
      <div class="detail-body">
        <p class="detail-title">${escHtml(ev.summary)}</p>
        <p class="detail-meta">${when}</p>
        ${member ? `<div class="detail-member"><span class="detail-avatar${isEmojiInitial(member.initial) ? " detail-avatar--emoji" : ""}" style="background:${grad};">${member.initial}</span><span class="detail-member-name">${escHtml(member.name)}</span></div>` : ""}
        ${ev.location ? `<p class="detail-location">📍 ${escHtml(ev.location)}</p>` : ""}
        ${stripMetaTags(ev.description) ? `<p class="detail-notes">${escHtml(stripMetaTags(ev.description)).replace(/\n/g, "<br>")}</p>` : ""}
      </div>
      ${actions}
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
  if (!isReadOnly) {
    sheet.querySelector<HTMLElement>("[data-action='edit-event-from-detail']")
      ?.addEventListener("click", () => { sheet.remove(); openEditModal(ev); });
  }
  sheet.querySelector<HTMLElement>("[data-action='share-event-from-detail']")
    ?.addEventListener("click", () => {
      // Text-only share: formatted event description for messaging apps (WhatsApp, iMessage…)
      const lines: string[] = [`📅 ${ev.summary}`, `🗓 ${when}`];
      if (member) lines.push(`👤 ${member.name}`);
      if (ev.location) lines.push(`📍 ${ev.location}`);
      const notes = stripMetaTags(ev.description);
      if (notes) lines.push(`📝 ${notes}`);
      const text = lines.join("\n");
      if (navigator.share) {
        void navigator.share({ title: ev.summary, text }).catch((err) => {
          if ((err as { name?: string }).name !== "AbortError") {
            showTransientBanner("Teilen fehlgeschlagen");
          }
        });
      } else {
        void navigator.clipboard.writeText(text).then(() => {
          showTransientBanner("In Zwischenablage kopiert ✓");
        });
      }
    });
  if (!isReadOnly) {
    sheet.querySelector<HTMLElement>("[data-action='ics-event-from-detail']")
      ?.addEventListener("click", () => {
        const icsContent = generateICS(ev);
        const icsFileName = `${ev.summary.replace(/[^a-zA-Z0-9À-ɏ]/g, "_")}.ics`;
        // Use octet-stream so iOS saves to Downloads instead of intercepting as Calendar.
        // Signal's share extension converts .ics file paths to text (Signal bug), so the
        // only reliable path to Signal is: download → Files app → Signal + → Datei.
        const blob = new Blob([icsContent], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = icsFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        showTransientBanner(`${icsFileName} gespeichert → Signal: + → Datei → Downloads`);
      });
    sheet.querySelector<HTMLElement>("[data-action='delete-event-from-detail']")
      ?.addEventListener("click", () => {
        const sid = extractSeriesId(ev.description);
        if (sid) {
          const count = state.events.filter((e) => extractSeriesId(e.description) === sid).length;
          showDeleteSeriesDialog(ev, sid, count, sheet);
        } else {
          sheet.remove();
          void deleteEvent(ev);
        }
      });
  }

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
  const memberId = ev.memberId ?? state.members[0]?.id ?? "";
  const startDate = new Date(ev.start);
  // ev.end is inclusive (normalizeEvent subtracts 1 day); modal stores allDay end as exclusive
  const endDate = ev.allDay
    ? new Date(ev.end.getTime() + 86_400_000)
    : new Date(ev.end);
  const JS_DAY_TO_RRULE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const weekDay = JS_DAY_TO_RRULE[startDate.getDay()];
  const weekPos = Math.min(4, Math.ceil(startDate.getDate() / 7));

  // Restore recurrence settings from the [rrule:...] meta-tag stored in the description.
  const seriesId = extractSeriesId(ev.description);
  const rruleRaw = extractSeriesRrule(ev.description);
  let rruleFreq: string = "";
  let rruleWeekdays = [weekDay];
  let rruleUntil = new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
  let rruleMonthMode: "monthday" | "weekday" = "monthday";
  let rruleMonthWeekPos = weekPos;
  let rruleMonthWeekDay = weekDay;
  if (rruleRaw) {
    const freqM = rruleRaw.match(/FREQ=([^;]+)/);
    if (freqM) rruleFreq = `FREQ=${freqM[1]}`;
    const bydayM = rruleRaw.match(/BYDAY=([^;]+)/);
    if (bydayM) {
      const byday = bydayM[1];
      // Numeric prefix (e.g. "2MO") → monthly weekday mode
      if (/^-?\d/.test(byday)) {
        rruleMonthMode = "weekday";
        const posM = byday.match(/^(-?\d+)([A-Z]{2})/);
        if (posM) { rruleMonthWeekPos = Number(posM[1]); rruleMonthWeekDay = posM[2]; }
      } else {
        rruleWeekdays = byday.split(",");
      }
    }
    const untilM = rruleRaw.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
    if (untilM) {
      rruleUntil = new Date(Number(untilM[1]), Number(untilM[2]) - 1, Number(untilM[3]));
    }
  }

  state.modal = {
    tab: "datum",
    summary: ev.summary,
    startDate,
    endDate,
    allDay: ev.allDay,
    rruleFreq: rruleFreq as import("./views/event-modal.ts").RecurrenceFreq,
    rruleUntil,
    rruleWeekdays,
    rruleMonthMode,
    rruleMonthWeekPos,
    rruleMonthWeekDay,
    memberId,
    originalMemberId: memberId,
    location: ev.location ?? "",
    notes: stripMetaTags(ev.description),
    editUid: ev.uid,
    seriesId: seriesId ?? undefined,
    seriesRrule: rruleRaw ?? undefined,
    reminderMinutes: extractReminder(ev.description),
  };
  render();
}

// ── Recurrence expansion (fallback when HA backend rejects RRULE) ─────────

const RRULE_TO_JS_DAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// Series ID is embedded in the description as "[sid:xxx]" so all occurrences
// can be found and bulk-deleted even after a page reload or cross-device sync.
function extractSeriesId(description: string | undefined): string | null {
  if (!description) return null;
  const m = description.match(/\[sid:([a-z0-9]+)\]/);
  return m ? m[1] : null;
}

function extractSeriesRrule(description: string | undefined): string | null {
  if (!description) return null;
  const m = description.match(/\[rrule:([^\]]+)\]/);
  return m ? m[1] : null;
}

function stripMetaTags(description: string | undefined): string {
  if (!description) return "";
  return description
    .replace(/\n?\[sid:[a-z0-9]+\]/g, "")
    .replace(/\n?\[rrule:[^\]]+\]/g, "")
    .replace(/\n?\[remind:\d+\]/g, "")
    .trim();
}

// ── ICS generator ──────────────────────────────────────────────────────────

function generateICS(ev: CalendarEvent): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  // Local floating time (no Z, no TZID) — calendar apps display in device timezone
  const fmtDt = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const fmtD = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
  // UTC timestamp for DTSTAMP
  const fmtUtc = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  // Escape special chars in text values per RFC 5545
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Familienkalender//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `SUMMARY:${esc(ev.summary)}`,
    `DTSTAMP:${fmtUtc(new Date())}`,
  ];
  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${fmtD(ev.start)}`);
    // ev.end is inclusive; iCal DTEND for all-day is exclusive (+1 day)
    lines.push(`DTEND;VALUE=DATE:${fmtD(new Date(ev.end.getTime() + 86_400_000))}`);
  } else {
    lines.push(`DTSTART:${fmtDt(ev.start)}`);
    lines.push(`DTEND:${fmtDt(ev.end)}`);
  }
  if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
  const notes = stripMetaTags(ev.description);
  if (notes) lines.push(`DESCRIPTION:${esc(notes)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}




// ── ICS import ─────────────────────────────────────────────────────────────

interface ParsedICSEvent {
  summary: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  description?: string;
}

function parseICS(raw: string): ParsedICSEvent[] {
  // Unfold continuation lines (RFC 5545 §3.1)
  const text = raw.replace(/\r\n[ \t]/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const unesc = (s: string) =>
    s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");

  function parseDtValue(val: string, params: string): { date: Date; allDay: boolean } {
    const isDate = params.includes("VALUE=DATE") && !val.includes("T");
    if (isDate) {
      const y = +val.slice(0, 4), m = +val.slice(4, 6) - 1, d = +val.slice(6, 8);
      return { date: new Date(y, m, d), allDay: true };
    }
    const y = +val.slice(0, 4), mo = +val.slice(4, 6) - 1, d = +val.slice(6, 8);
    const h = +val.slice(9, 11), min = +val.slice(11, 13), s = +(val.slice(13, 15) || "0");
    const utc = val.endsWith("Z");
    return {
      date: utc ? new Date(Date.UTC(y, mo, d, h, min, s)) : new Date(y, mo, d, h, min, s),
      allDay: false,
    };
  }

  const events: ParsedICSEvent[] = [];
  let inEvent = false;
  const props: Record<string, string> = {};
  const params: Record<string, string> = {};

  for (const line of text.split("\n")) {
    const t = line.trimEnd();
    if (t === "BEGIN:VEVENT") {
      inEvent = true;
      for (const k of Object.keys(props)) delete props[k];
      for (const k of Object.keys(params)) delete params[k];
      continue;
    }
    if (t === "END:VEVENT") {
      inEvent = false;
      if (!props["SUMMARY"] || !props["DTSTART"]) continue;
      const { date: start, allDay } = parseDtValue(props["DTSTART"], params["DTSTART"] ?? "");
      let end: Date;
      if (props["DTEND"]) {
        const r = parseDtValue(props["DTEND"], params["DTEND"] ?? "");
        end = allDay ? new Date(r.date.getTime() - 86_400_000) : r.date;
      } else if (props["DURATION"]) {
        let ms = 0;
        const dm = props["DURATION"].match(/(\d+)D/); if (dm) ms += +dm[1] * 86_400_000;
        const hm = props["DURATION"].match(/(\d+)H/); if (hm) ms += +hm[1] * 3_600_000;
        const mm = props["DURATION"].match(/(\d+)M/); if (mm) ms += +mm[1] * 60_000;
        end = allDay ? new Date(start.getTime() + ms - 86_400_000) : new Date(start.getTime() + ms);
      } else {
        end = allDay ? new Date(start) : new Date(start.getTime() + 3_600_000);
      }
      const ev: ParsedICSEvent = { summary: unesc(props["SUMMARY"]), start, end, allDay };
      if (props["LOCATION"]) ev.location = unesc(props["LOCATION"]);
      if (props["DESCRIPTION"]) ev.description = unesc(props["DESCRIPTION"]);
      events.push(ev);
      continue;
    }
    if (!inEvent) continue;
    const ci = t.indexOf(":");
    if (ci === -1) continue;
    const nameParams = t.slice(0, ci);
    const value = t.slice(ci + 1);
    const si = nameParams.indexOf(";");
    const name = (si === -1 ? nameParams : nameParams.slice(0, si)).toUpperCase();
    props[name] = value;
    if (si !== -1) params[name] = nameParams.slice(si + 1).toUpperCase();
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function triggerICSImport(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".ics,text/calendar";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed = parseICS(text);
        showICSImportSheet(parsed);
      } catch {
        showTransientBanner("ICS-Datei konnte nicht gelesen werden", true);
      }
    };
    reader.readAsText(file, "utf-8");
  });
  input.click();
}

function showICSImportSheet(events: ParsedICSEvent[]): void {
  document.getElementById("ics-import-sheet")?.remove();

  if (events.length === 0) {
    showTransientBanner("Keine Termine in der ICS-Datei gefunden");
    return;
  }

  function escH(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  const pad = (n: number) => n.toString().padStart(2, "0");
  const fmtD = (d: Date) => `${d.getDate()}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  const fmtT = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const memberOptions = state.members
    .map((m) => `<option value="${m.id}">${escH(m.name)}</option>`)
    .join("");

  const eventRows = events.map((ev) => {
    const when = ev.allDay
      ? fmtD(ev.start)
      : `${fmtD(ev.start)}, ${fmtT(ev.start)} – ${fmtT(ev.end)}`;
    return `<div class="ics-import-event">
      <p class="ics-import-event__title">${escH(ev.summary)}</p>
      <p class="ics-import-event__when">${when}</p>
    </div>`;
  }).join("");

  const count = events.length;
  const html = `<div id="ics-import-sheet" class="sheet-backdrop">
    <div class="bottom-sheet ics-import-sheet" data-stop-propagation>
      <div class="bottom-sheet__handle"></div>
      <p class="bottom-sheet__title">${count} Termin${count !== 1 ? "e" : ""} importieren</p>
      <div class="ics-import-member-row">
        <span class="ics-import-label">Kalender</span>
        <select class="ics-import-select" id="ics-import-member">${memberOptions}</select>
      </div>
      <div class="ics-import-events">${eventRows}</div>
      <div class="ics-import-actions">
        <button class="ics-import-cancel" id="ics-import-cancel">Abbrechen</button>
        <button class="ics-import-confirm" id="ics-import-confirm">Alle importieren</button>
      </div>
    </div>
  </div>`;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const sheet = wrapper.firstElementChild as HTMLElement;
  document.body.appendChild(sheet);

  document.getElementById("ics-import-cancel")!.addEventListener("click", () => sheet.remove());
  sheet.addEventListener("click", (e) => { if ((e.target as HTMLElement) === sheet) sheet.remove(); });
  sheet.querySelector<HTMLElement>("[data-stop-propagation]")!
    .addEventListener("click", (e) => e.stopPropagation());

  document.getElementById("ics-import-confirm")!.addEventListener("click", async () => {
    const memberId = (document.getElementById("ics-import-member") as HTMLSelectElement).value;
    const btn = document.getElementById("ics-import-confirm") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Importiere…";

    const config = loadConfig();
    if (!config) {
      showTransientBanner("Kein HA-Zugang konfiguriert", true);
      sheet.remove();
      return;
    }
    const client = new HAClient(config);
    let ok = 0, fail = 0;
    for (const ev of events) {
      try {
        await client.createEvent(memberId, ev.summary, ev.start, ev.end, ev.allDay, {
          location: ev.location,
          description: ev.description,
        });
        ok++;
      } catch {
        fail++;
      }
    }
    sheet.remove();
    if (fail === 0) {
      showTransientBanner(`${ok} Termin${ok !== 1 ? "e" : ""} importiert ✓`);
    } else {
      showTransientBanner(`${ok} importiert, ${fail} fehlgeschlagen`, true);
    }
    setTimeout(() => void refreshEvents(), 2_000);
  });
}

function extractReminder(description: string | undefined): number {
  if (!description) return 0;
  const m = description.match(/\[remind:(\d+)\]/);
  return m ? parseInt(m[1], 10) : 0;
}

function nthWeekdayInMonth(year: number, month: number, pos: number, weekday: number): Date {
  if (pos === -1) {
    const last = new Date(year, month + 1, 0);
    return new Date(year, month, last.getDate() - (last.getDay() - weekday + 7) % 7);
  }
  const first = new Date(year, month, 1);
  return new Date(year, month, 1 + (weekday - first.getDay() + 7) % 7 + (pos - 1) * 7);
}

function expandRecurrences(
  startDate: Date,
  endDate: Date,
  modal: ModalState,
): Array<{ start: Date; end: Date }> {
  const duration = endDate.getTime() - startDate.getTime();
  const result: Array<{ start: Date; end: Date }> = [];
  // Set until to end of the until day (23:59:59) so same-day occurrences are included.
  const until = modal.rruleUntil
    ? new Date(modal.rruleUntil.getFullYear(), modal.rruleUntil.getMonth(), modal.rruleUntil.getDate(), 23, 59, 59)
    : new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
  const shiftDays = (base: Date, days: number): Date =>
    new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, base.getHours(), base.getMinutes());
  const add = (s: Date) => { if (s >= startDate && s <= until) result.push({ start: s, end: new Date(s.getTime() + duration) }); };

  if (modal.rruleFreq === "FREQ=DAILY") {
    for (let i = 0; ; i++) {
      const s = shiftDays(startDate, i);
      if (s > until) break;
      add(s);
    }
  } else if (modal.rruleFreq === "FREQ=WEEKLY") {
    const targetDays = new Set(modal.rruleWeekdays.map((d) => RRULE_TO_JS_DAY[d]));
    const weekSunday = shiftDays(startDate, -startDate.getDay());
    for (let w = 0; ; w++) {
      const weekBase = shiftDays(weekSunday, w * 7);
      if (weekBase > until) break;
      for (let d = 0; d < 7; d++) {
        if (!targetDays.has(d)) continue;
        add(shiftDays(weekSunday, w * 7 + d));
      }
    }
  } else if (modal.rruleFreq === "FREQ=MONTHLY") {
    for (let i = 0; ; i++) {
      let base: Date;
      if (modal.rruleMonthMode === "monthday") {
        base = new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate());
      } else {
        const wd = RRULE_TO_JS_DAY[modal.rruleMonthWeekDay] ?? 1;
        base = nthWeekdayInMonth(startDate.getFullYear(), startDate.getMonth() + i, modal.rruleMonthWeekPos, wd);
      }
      base.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
      if (base > until) break;
      add(base);
    }
  } else if (modal.rruleFreq === "FREQ=YEARLY") {
    for (let i = 0; ; i++) {
      const s = new Date(startDate.getFullYear() + i, startDate.getMonth(), startDate.getDate(),
        startDate.getHours(), startDate.getMinutes());
      if (s > until) break;
      add(s);
    }
  }

  return result;
}

// ── Save calendar event ────────────────────────────────────────────────────

async function runBatch<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onProgress?: (done: number, total: number) => void,
): Promise<{ fulfilled: number; rejected: number }> {
  let fulfilled = 0;
  let rejected = 0;
  let idx = 0;
  const total = tasks.length;

  async function worker() {
    while (idx < total) {
      const i = idx++;
      try {
        await tasks[i]();
        fulfilled++;
      } catch {
        rejected++;
      }
      onProgress?.(fulfilled + rejected, total);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  return { fulfilled, rejected };
}

// Bearbeitete Termine für den Poller vormerken: Er führt das update_event per
// WebSocket aus (die iOS-PWA kann das nicht). Op wird an sensor.
// familienkalender_calendar_ops angehängt; der Poller wendet es an und entfernt
// es wieder. Pro UID nur die jüngste Änderung.
function queueCalendarUpdate(
  entityId: string, uid: string, summary: string, start: Date, end: Date, allDay: boolean,
  opts: { location?: string; description?: string; rrule?: string },
): void {
  const cfg = loadConfig();
  if (!cfg) return;
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const event: Record<string, unknown> = { summary };
  if (allDay) { event.dtstart = fmtDate(start); event.dtend = fmtDate(end); }
  else { event.dtstart = start.toISOString(); event.dtend = end.toISOString(); }
  if (opts.location) event.location = opts.location;
  if (opts.description) event.description = opts.description;
  if (opts.rrule) event.rrule = opts.rrule;
  const op = { id: `u-${Date.now()}-${uid}`, type: "update", entity_id: entityId, uid, event };
  void fetch(`${cfg.baseUrl}/api/states/sensor.familienkalender_calendar_ops`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((data) => {
    const existing = ((data as { attributes?: { ops?: Array<{ uid?: string }> } } | null)?.attributes?.ops) ?? [];
    const ops = [...existing.filter((o) => o.uid !== uid), op].slice(-50);
    haWriteState(cfg.baseUrl, cfg.token, "sensor.familienkalender_calendar_ops", String(ops.length), { ops, ts: Date.now() });
  });
}

async function saveEvent(): Promise<void> {
  if (!state.modal) return;
  const { summary, startDate, endDate, allDay, memberId, location, seriesId, seriesRrule, reminderMinutes } = state.modal;
  const rruleStr = buildRruleString(state.modal);
  // When editing a series event, preserve the [sid:] and [rrule:] meta-tags in the description
  // so series membership and recurrence info survive the edit.
  let notes = state.modal.notes;
  if (reminderMinutes > 0) {
    notes = notes ? `${notes}\n[remind:${reminderMinutes}]` : `[remind:${reminderMinutes}]`;
  }
  if (seriesId && !rruleStr) {
    // No new recurrence selected: re-attach existing meta-tags silently
    notes = notes ? `${notes}\n[sid:${seriesId}]${seriesRrule ? `\n[rrule:${seriesRrule}]` : ""}` : `[sid:${seriesId}]${seriesRrule ? `\n[rrule:${seriesRrule}]` : ""}`;
  }

  if (!summary.trim()) {
    const input = document.getElementById("modal-summary") as HTMLInputElement | null;
    if (input) {
      input.classList.add("modal-title-input--error");
      input.focus();
    }
    return;
  }

  const config = loadConfig();
  const { editUid, originalMemberId } = state.modal;
  if (config && navigator.onLine) {
    const client = new HAClient(config);
    try {
      if (editUid && !editUid.startsWith("local-")) {
        // Update am selben Termin (behält die UID, auch bei Datumsänderung —
        // die WebSocket-API kann das). Scheitert es (z.B. iOS-PWA ohne
        // WebSocket), übernimmt unten der Poller-Weg.
        const updated = await client.updateEvent(
          memberId, editUid, summary.trim(), startDate, endDate, allDay, {
            location: location || undefined,
            description: notes || undefined,
            rrule: rruleStr || undefined,
          });
        if (updated) {
          // Verify HA persisted the change — local_calendar occasionally
          // accepts update_event but fails to write the .ics file.
          setTimeout(() => void refreshEvents(), 8_000);
        }
        if (!updated) {
          const opts = { location: location || undefined, description: notes || undefined, rrule: rruleStr || undefined };
          const memberChanged = !!originalMemberId && originalMemberId !== memberId;
          if (memberChanged) {
            // Kalender/Person gewechselt → auf neuem anlegen, alten löschen
            // (Löschen erledigt der Poller über hidden_uids).
            await client.createEvent(memberId, summary.trim(), startDate, endDate, allDay, opts);
            pendingDeletes.set(editUid, PERMANENT);
            savePendingDeletes(pendingDeletes);
          } else {
            // WS-Update ging nicht (z.B. iOS-PWA) → Update über den Poller am
            // SELBEN Termin (gleiche UID) — KEINE Neuanlage, keine Dublette.
            queueCalendarUpdate(memberId, editUid, summary.trim(), startDate, endDate, allDay, opts);
          }
          setTimeout(() => void refreshEvents(), 65_000);
        }
      } else {
        await client.createEvent(memberId, summary.trim(), startDate, endDate, allDay, {
          location: location || undefined,
          description: notes || undefined,
          rrule: rruleStr || undefined,
        });
      }
    } catch (err) {
      // When HA rejects the RRULE, expand and create each occurrence individually.
      // Check this BEFORE the editUid bail-out so editing + adding recurrence also works.
      if (rruleStr && err instanceof Error && /\b[45]\d\d\b/.test(err.message)) {
        try {
          const modal = state.modal!;
          // Preserve existing series ID when re-creating an edited series, otherwise mint a new one.
          const sid = modal.seriesId ?? Date.now().toString(36);
          const sidTag = `[sid:${sid}]`;
          const rruleTag = `[rrule:${rruleStr}]`;
          const descWithSid = notes ? `${notes}\n${sidTag}\n${rruleTag}` : `${sidTag}\n${rruleTag}`;
          const occurrences = expandRecurrences(startDate, endDate, modal);
          const saveBtn = document.querySelector('[data-action="save-event"]') as HTMLButtonElement | null;
          const tasks = occurrences.map(({ start, end }) => () =>
            client.createEvent(memberId, summary.trim(), start, end, allDay, {
              location: location || undefined,
              description: descWithSid,
            })
          );
          const { fulfilled: ok, rejected: fail } = await runBatch(tasks, 3, (done, total) => {
            if (saveBtn) saveBtn.textContent = `${done} / ${total} angelegt…`;
          });
          showTransientBanner(`${ok} Termine angelegt${fail > 0 ? ` · ${fail} fehlgeschlagen` : ""} ✓`);
          // Inclusive duration per occurrence: allDay end is exclusive, subtract 1 day for local state.
          const occDuration = (endDate.getTime() - startDate.getTime()) - (allDay ? 86_400_000 : 0);
          for (const { start } of occurrences) {
            state.events.push({
              uid: `local-${start.getTime()}`,
              summary: summary.trim(),
              start,
              end: new Date(start.getTime() + occDuration),
              allDay,
              memberId,
              location: location || undefined,
              description: descWithSid,
            });
          }
          state.events.sort((a, b) => a.start.getTime() - b.start.getTime());
          saveCachedEvents(state.events);
          state.modal = null;
          render();
          return;
        } catch (expandErr) {
          const msg = expandErr instanceof Error ? expandErr.message : String(expandErr);
          showTransientBanner(`Serien-Erstellung fehlgeschlagen: ${msg}`, true);
          return;
        }
      }
      if (editUid) {
        const msg = err instanceof Error ? err.message : String(err);
        showTransientBanner(`Speichern fehlgeschlagen: ${msg}`, true);
        return;
      }
      enqueue({
        entityId: memberId,
        summary: summary.trim(),
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        allDay,
        location: location || undefined,
        description: notes || undefined,
        rrule: rruleStr || undefined,
      });
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
      rrule: rruleStr || undefined,
    });
  }

  // Calendar views expect inclusive end; modal.endDate is exclusive for allDay (iCal convention).
  const stateEnd = allDay ? new Date(endDate.getTime() - 86_400_000) : endDate;

  if (editUid) {
    const idx = state.events.findIndex((e) => e.uid === editUid);
    const updated: CalendarEvent = {
      uid: editUid,
      summary: summary.trim(),
      start: startDate,
      end: stateEnd,
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
      end: stateEnd,
      allDay,
      memberId,
      location: location || undefined,
      description: notes || undefined,
    });
  }
  state.events.sort((a, b) => a.start.getTime() - b.start.getTime());
  saveCachedEvents(state.events);
  if (!editUid) {
    // Zur Woche/zum Monat des neuen Termins springen, damit er sichtbar ist —
    // sonst „verschwindet" ein Termin, der außerhalb der aktuellen Woche liegt
    // (z.B. „nächsten Mittwoch").
    state.weekStart = startOfWeek(startDate);
    state.monthStart = startOfMonth(startDate);
    state.selectedDate = new Date(startDate);
  }
  state.modal = null;
  render();
  // Do NOT call refreshEvents() here — HA needs time to index the new event.
  // Fetching immediately would return stale data and processQueue() could
  // replay queued items creating duplicates. The local state is already correct.
}

// ── Duplicate detection & cleanup ─────────────────────────────────────────

function findDuplicateUids(events: CalendarEvent[]): { strict: string[]; soft: string[] } {
  // A duplicate is only an event that is TRULY identical to another: same
  // calendar, same name, same all-day flag, AND the exact same start (and end
  // for all-day). Different days/durations are never duplicates — that keeps
  // legitimate multi-day events ("Hochzeit Standesamt" Fr + Sa) intact.
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const sig = `${e.memberId ?? ""}|${e.summary.toLowerCase()}|${e.allDay ? "AD" : "T"}|${e.start.getTime()}|${e.allDay ? e.end.getTime() : ""}`;
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig)!.push(e);
  }

  const dupes = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Survivor: prefer an explicitly restored event so a tombstone always wins;
    // otherwise keep the first. All other identical copies are duplicates.
    const survivor = group.find((e) => restoredUids.has(e.uid)) ?? group[0];
    for (const e of group) {
      if (e.uid !== survivor.uid) dupes.add(e.uid);
    }
  }

  return { strict: [...dupes], soft: [] };
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
    const withoutHiddenCleanup = fresh.filter((e) => {
      const exp = pendingDeletes.get(e.uid);
      if (exp === PERMANENT) return false;
      if (exp !== undefined && exp > nowMs) return false;
      const fp = eventFp(e);
      if (hiddenFingerprints.has(fp)) return false;
      const sid = extractSeriesId(e.description);
      if (sid && deletedSeriesIds.has(sid)) return false;
      return true;
    });
    const seenFpCleanup = new Set<string>();
    const visible = withoutHiddenCleanup.filter((e) => {
      const fp = `${e.memberId}|${e.start.getTime()}|${e.summary.toLowerCase()}`;
      if (seenFpCleanup.has(fp)) return false;
      seenFpCleanup.add(fp);
      return true;
    });

    const { strict: dupeUids } = findDuplicateUids(visible);
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
        .map((ev) => client.deleteEvent(ev.memberId ?? "", ev.uid, ev.recurrenceId)),
    );
    savePendingDeletes(pendingDeletes);

    const failedResults = results.filter((r) => r.status === "rejected");
    // 400 = read-only calendar; event is already hidden via sensor — not a real failure
    const realFailures = failedResults.filter((r) => {
      if (r.status !== "rejected") return false;
      const status = (r.reason as { httpStatus?: number })?.httpStatus;
      return status !== 400;
    });
    const failed = realFailures.length;
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const firstErr = failed > 0 && realFailures[0].status === "rejected"
      ? (realFailures[0].reason instanceof Error ? realFailures[0].reason.message : String(realFailures[0].reason))
      : "";

    const result = document.createElement("div");
    result.className = "dupe-banner";
    const msg = failed > 0
      ? `${succeeded} gelöscht · ${failed} HA-Fehler: ${escHtml(String(firstErr))}`
      : `${succeeded} Duplikate gelöscht ✓`;
    result.innerHTML = `<span style="flex:1;">${escHtml(msg)}</span><span class="dupe-banner__dismiss">✕</span>`;
    result.querySelector(".dupe-banner__dismiss")!.addEventListener("click", () => result.remove());
    document.body.appendChild(result);
    setTimeout(() => result.remove(), 8000);

  } catch (err) {
    toast?.remove();
    if (!silent) {
      const errBanner = document.createElement("div");
      errBanner.className = "dupe-banner";
      errBanner.style.color = "#FF453A";
      errBanner.innerHTML = `<span style="flex:1;">${escHtml(`Fehler: ${err instanceof Error ? err.message : String(err)}`)}</span><span class="dupe-banner__dismiss">✕</span>`;
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
  // Explicit user delete overrides any prior restore tombstone.
  if (restoredUids.delete(ev.uid)) {
    localStorage.setItem(RESTORED_UIDS_KEY, JSON.stringify([...restoredUids]));
  }
  pendingDeletes.set(ev.uid, PERMANENT);
  savePendingDeletes(pendingDeletes);

  state.events = state.events.filter((e) => e.uid !== ev.uid);
  saveCachedEvents(state.events);
  render();

  const config = loadConfig();
  if (config && navigator.onLine) {
    const client = new HAClient(config);
    // Direktes Löschen per UID nur, wenn wir die ECHTE HA-UID kennen. Frisch
    // angelegte Termine (auch per Sprache) tragen zunächst eine Platzhalter-UID
    // "local-…", weil calendar.create_event die UID nicht zurückgibt — sie
    // existieren aber sehr wohl in HA. Für die greift unten die Titel+Start-
    // Suche.
    const isLocal = ev.uid.startsWith("local-");
    if (!isLocal) {
      try {
        // Schnellweg per WebSocket (funktioniert auf Desktop/Android). Scheitert
        // er (z.B. installierte iOS-PWA: „operation is insecure"), ist das nicht
        // schlimm — die UID steht in der Sperrliste (hidden_uids), und der Poller
        // löscht den Termin serverseitig. Deshalb KEIN Fehlerbanner.
        await client.deleteEvent(ev.memberId ?? "", ev.uid, ev.recurrenceId);
      } catch (err) {
        console.warn("WS-Löschung fehlgeschlagen — Poller übernimmt:", err instanceof Error ? err.message : err);
      }
    }
    // HA nach Termin(en) mit gleichem Titel + Startdatum + Kalender durchsuchen
    // und löschen. Deckt zwei Fälle ab:
    //  1) lokal angelegte Termine, deren echte HA-UID die App nicht kennt,
    //  2) Duplikate durch fehlgeschlagene Move-/Edit-Löschungen.
    if (!ev.recurrenceId) await deleteHADuplicates(client, ev);
  }
}

async function deleteHADuplicates(client: HAClient, ev: CalendarEvent): Promise<void> {
  if (!ev.memberId) return;
  const dayStart = new Date(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate());
  const rangeStart = new Date(dayStart.getTime() - 86_400_000);
  const rangeEnd = new Date(dayStart.getTime() + 2 * 86_400_000);
  try {
    const others = await client.getEvents(ev.memberId, rangeStart, rangeEnd);
    for (const o of others) {
      if (o.uid === ev.uid || o.recurrenceId) continue;
      if (o.summary !== ev.summary) continue;
      // Gleiches Startdatum (Duplikat), nicht nur zufällig gleicher Titel.
      if (o.start.getFullYear() !== dayStart.getFullYear()
        || o.start.getMonth() !== dayStart.getMonth()
        || o.start.getDate() !== dayStart.getDate()) continue;
      try {
        await client.deleteEvent(ev.memberId, o.uid);
        pendingDeletes.set(o.uid, PERMANENT);
        state.events = state.events.filter((e) => e.uid !== o.uid);
      } catch { /* best-effort */ }
    }
    savePendingDeletes(pendingDeletes);
    saveCachedEvents(state.events);
  } catch { /* Abruf fehlgeschlagen — kein Abbruch, primäres Löschen zählt */ }
}

function showTransientBanner(text: string, isError = false): void {
  const banner = document.createElement("div");
  banner.className = "dupe-banner";
  if (isError) banner.style.color = "#FF453A";
  banner.innerHTML = `<span style="flex:1;">${escHtml(text)}</span><span class="dupe-banner__dismiss">✕</span>`;
  banner.querySelector(".dupe-banner__dismiss")!.addEventListener("click", () => banner.remove());
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 8000);
}

// ── HA data refresh ────────────────────────────────────────────────────────

let lastFailedAt = 0;
const RETRY_COOLDOWN_MS = 45_000;

// When the user taps "Heute", every render within the next 3 s scrolls to
// today's row. This covers both the immediate render AND the refreshEvents
// re-render that fires after the HA fetch, which would otherwise reset scroll.
let scrollTodayUntil = 0;

async function refreshEvents(): Promise<void> {
  const config = loadConfig();
  if (!config) return;
  if (Date.now() - lastFailedAt < RETRY_COOLDOWN_MS) return;
  try {
    const client = new HAClient(config);
    let rangeStart: Date;
    let rangeEnd: Date;
    if (state.viewMode === "month") {
      // 2 months back + current + 4 months ahead for instant swiping.
      rangeStart = addMonths(state.monthStart, -2);
      rangeEnd = addMonths(state.monthStart, 5);
    } else {
      // Fetch 4 weeks back + current + 8 weeks ahead so swiping shows events
      // instantly from state.events without waiting for the next HA round-trip.
      rangeStart = addDays(state.weekStart, -28);
      rangeEnd = addDays(state.weekStart, 63);
    }
    const fresh = await client.getAllEvents(rangeStart, rangeEnd);
    // getAllEvents only deduplicates by UID; pendingDeletes/fingerprint filtering
    // happens here.
    const now = Date.now();
    // Pass 1: find events HA still returns despite being PERMANENT-deleted → ghost-retry.
    // We do NOT collect fingerprints here. Fingerprint suppression (hiddenFps) used to
    // block all events sharing a fingerprint with any PERMANENT entry, which caused
    // legitimate copies with different UIDs to permanently vanish when the old
    // dedup code incorrectly marked duplicates PERMANENT. Only hiddenFingerprints
    // (explicitly set by the user via series-delete) is used for fingerprint filtering.
    const ghostsToRetryDelete: CalendarEvent[] = [];
    for (const e of fresh) {
      if (pendingDeletes.get(e.uid) === PERMANENT && !e.uid.startsWith("local-") && e.memberId) {
        ghostsToRetryDelete.push(e);
      }
    }
    if (ghostsToRetryDelete.length > 0 && navigator.onLine) {
      const toRetry = ghostsToRetryDelete.filter((e) => (ghostRetryFails.get(e.uid) ?? 0) < 3);
      void Promise.allSettled(
        toRetry.map((e) =>
          client.deleteEvent(e.memberId ?? "", e.uid, e.recurrenceId).catch((err) => {
            ghostRetryFails.set(e.uid, (ghostRetryFails.get(e.uid) ?? 0) + 1);
            if ((ghostRetryFails.get(e.uid) ?? 0) >= 3) {
              console.warn(`[ghost-retry] giving up on uid=${e.uid} (${e.summary}) — not deletable via HA API`);
            }
            throw err;
          }),
        ),
      );
    }
    // Pass 2: filter by UID (pendingDeletes), persistent fingerprints, and deleted series IDs.
    const withoutHidden = fresh.filter((e) => {
      const exp = pendingDeletes.get(e.uid);
      if (exp === PERMANENT) return false;
      if (exp !== undefined && exp > now) return false;
      const fp = eventFp(e);
      if (hiddenFingerprints.has(fp)) return false;
      const sid = extractSeriesId(e.description);
      if (sid && deletedSeriesIds.has(sid)) return false;
      return true;
    });
    // Pass 3: fingerprint dedup — when duplicates exist, keep the one with the
    // latest end date (most recent edit wins over stale original that failed to delete).
    const fpBest = new Map<string, CalendarEvent>();
    for (const e of withoutHidden) {
      const fp = `${e.memberId}|${e.start.getTime()}|${e.summary.toLowerCase()}`;
      const cur = fpBest.get(fp);
      if (!cur || e.end > cur.end) fpBest.set(fp, e);
    }
    const merged = [...fpBest.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
    // Auto-deduplicate: filter duplicate UIDs from the display without persisting
    // anything to pendingDeletes. Writing to pendingDeletes here caused a cascade:
    // dedup-marked UIDs triggered the ghost-retry to delete real calendar events
    // from HA, and their shared fingerprint blocked any new copies from showing.
    // Dedup is now pure display logic — only explicit user deletes touch pendingDeletes.
    const { strict: strictDupes } = findDuplicateUids(merged);
    const dupesToHide = strictDupes.filter((uid) => !restoredUids.has(uid));
    let clean = merged;
    if (dupesToHide.length > 0) {
      const dupeSet = new Set(dupesToHide);
      clean = merged.filter((e) => !dupeSet.has(e.uid));
    }
    // Inject placeholders for in-flight member moves where HA hasn't indexed
    // the new event yet. Once HA returns it (fingerprint match), auto-drop.
    const moveNow = Date.now();
    for (const [fp, { event: pending, expiry }] of pendingMoveEvents) {
      if (expiry < moveNow) { pendingMoveEvents.delete(fp); continue; }
      const haHasIt = clean.some(
        (e) => `${e.memberId}|${e.start.getTime()}|${e.summary.toLowerCase()}` === fp,
      );
      if (haHasIt) {
        pendingMoveEvents.delete(fp);
      } else {
        clean.push(pending);
        clean.sort((a, b) => a.start.getTime() - b.start.getTime());
      }
    }
    state.events = clean;
    saveCachedEvents(clean);
    dismissHAError();
    if (state.activeTab === "kalender") render();
    // Reminders are sent server-side by reminder_poller.py (HA automation),
    // so they fire even when the PWA is closed.
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
  el.innerHTML = `<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(detail ?? "HA nicht erreichbar")}</span><button class="ha-error-reconnect">Erneut versuchen</button><button class="ha-error-settings" title="Einstellungen">${gearSvg}</button><span style="margin-left:4px;opacity:.7;cursor:pointer;">✕</span>`;
  el.querySelector(".ha-error-reconnect")!.addEventListener("click", (e) => {
    e.stopPropagation();
    el.remove();
    lastFailedAt = 0;
    void refreshEvents();
  });
  el.querySelector(".ha-error-settings")!.addEventListener("click", (e) => {
    e.stopPropagation();
    el.remove();
    renderConfig(true);
  });
  el.addEventListener("click", () => el.remove());
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 20000);
}

function dismissHAError(): void {
  document.getElementById("ha-error-banner")?.remove();
}

// ── Config screen ──────────────────────────────────────────────────────────

function renderConfig(showBack = false): void {
  const existing = loadConfig();
  const canGoBack = showBack || !!existing;
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
      ${canGoBack ? `<button id="cfg-cancel" style="margin-top:12px;background:none;color:rgba(235,235,245,0.6);border:1px solid rgba(235,235,245,0.2);">Zurück</button>` : ""}
      <p style="margin-top:24px;font-size:11px;color:rgba(235,235,245,0.3);text-align:center;">Build: ${__BUILD_TIME__}</p>
    </div>
  `;
  document.getElementById("cfg-cancel")?.addEventListener("click", () => {
    render();
  });
  document.getElementById("cfg-save")!.addEventListener("click", () => {
    const url = (document.getElementById("cfg-url") as HTMLInputElement).value.trim();
    const token = (document.getElementById("cfg-token") as HTMLInputElement).value.trim();
    const raw = (document.getElementById("cfg-entities") as HTMLTextAreaElement).value;
    const entities = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!url || !token || entities.length === 0) {
      alert("Bitte alle Felder ausfüllen");
      return;
    }
    if (!/^https?:\/\/./.test(url)) {
      alert("URL muss mit http:// oder https:// beginnen");
      return;
    }
    // Warnen, wenn der Token über unverschlüsseltes HTTP zu einem nicht-lokalen
    // Server gesendet würde — dort könnte er im Netzwerk mitgelesen werden.
    const isLocalHost = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|homeassistant(\.local)?|[\w-]+\.local)(:\d+)?/i.test(url);
    if (url.startsWith("http://") && !isLocalHost) {
      const proceed = confirm(
        "Warnung: Mit http:// wird dein HA-Token unverschlüsselt übertragen und kann im Netzwerk mitgelesen werden.\n\n" +
        "Für einen entfernten Server bitte https:// verwenden (z.B. die Nabu-Casa-URL).\n\n" +
        "Trotzdem mit http:// fortfahren?",
      );
      if (!proceed) return;
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
  // Per KI gesetzte Kategorien (aiCat) NICHT mit Stichwörtern überschreiben.
  const recatTodos = todos.map((i) => i.aiCat ? i : { ...i, category: categorizeTodoItem(i.title) });
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
  haWriteState(cfg.baseUrl, cfg.token, HA_ENTITIES_ENTITY,
    new Date(ts).toISOString(), { entities, ts });
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
  scrollTodayUntil = Date.now() + 5000;
  render();
  // Sync birthday data + Lösch-Blockliste from HA (cross-device persistence).
  // Die Blockliste ZUERST laden, damit gelöschte Geburtstage nach einem Reload
  // nicht kurz wieder aufblitzen. Es gibt bewusst keinen automatischen ICS-/
  // iCloud-Re-Import — Geburtstage werden manuell verwaltet.
  void syncDeletedBirthdaysFromHA()
    .then(() => syncBirthdaysFromHA())
    .then(() => render());
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
  // Mirror the notification config to HA on boot so the server-side reminder
  // automation has an up-to-date member→service mapping even if it was last
  // saved before this sync existed.
  const bootNotifCfg = loadNotifConfig();
  if (bootNotifCfg) pushNotifConfigToHA(bootNotifCfg);
  // Retry once after 5 s — catches the race where this device boots before the
  // source device has pushed its items to the HA sensor.
  setTimeout(() => { pullShopping(); pullTodos(); }, 5_000);
  // Periodic re-sync so changes made on other devices show up without a
  // full app restart. 60s is a reasonable balance between freshness and load.
  setInterval(() => { pullShopping(); pullTodos(); }, 60_000);
  // Sync hidden UIDs + calendar events every 5 minutes so deletions made on
  // other devices appear without requiring an app restart.
  setInterval(() => {
    void syncHiddenUidsFromHA().then(() => void refreshEvents());
  }, 5 * 60_000);
  // Also pull when the app comes back to the foreground.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      pullShopping();
      pullTodos();
      void syncHiddenUidsFromHA().then(() => void refreshEvents());
    }
  });
}

updateQueueBadge();
// On reconnect, refresh first (which calls processQueue after state is populated)
// so the already-in-HA dedup check sees real UIDs before any creates fire.
window.addEventListener("online", () => void refreshEvents());


// ── Calendar swipe navigation ──────────────────────────────────────────────

(function setupCalendarSwipe() {
  let startX = 0, startY = 0;
  let tracking = false, panning = false;
  // Whether the touch started inside the vertically-scrollable week list.
  // When true we need to be much more conservative about claiming the gesture
  // horizontally — any vertical-dominant movement must stay as native scroll.
  let inScrollArea = false;

  function slideEl(): HTMLElement | null {
    return app.querySelector(".week-list") ?? app.querySelector(".month-scroll");
  }

  function resetSlide(): void {
    const el = slideEl();
    if (!el) return;
    el.style.transition = "transform 0.2s ease";
    el.style.transform = "";
    (el as HTMLElement & { _willChange?: boolean }).style.willChange = "";
  }

  app.addEventListener("touchstart", (e: TouchEvent) => {
    if (state.activeTab !== "kalender" || state.modal) return;
    const target = e.target as HTMLElement;
    // Only block taps on actual buttons (FAB, toolbar). Event items use a div
    // with data-action and must allow swipe-through — a tap still opens the
    // event because we only preventDefault once horizontal pan is confirmed.
    if (target.closest("button")) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
    panning = false;
    inScrollArea = Boolean(target.closest(".week-list, .month-scroll"));
    // Do NOT set willChange/transition here — setting willChange:transform on
    // an overflow:scroll element breaks iOS native scroll compositing.
    // We defer it to the moment horizontal panning is actually confirmed.
  }, { passive: true });

  app.addEventListener("touchmove", (e: TouchEvent) => {
    if (!tracking) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (!panning) {
      if (adx < 6 && ady < 6) return;
      // Inside a scrollable area: yield to native scroll on any vertical-dominant
      // gesture so the user can always scroll the list. Only claim the gesture
      // when horizontal movement clearly wins (adx > ady).
      if (inScrollArea && ady >= adx) { tracking = false; resetSlide(); return; }
      // Outside scrollable area: cancel only when clearly vertical (>67°).
      if (!inScrollArea && ady > adx * 2.4) { tracking = false; resetSlide(); return; }
      panning = true;
      // Horizontal swipe confirmed — now safe to set up animation layer.
      const setupEl = slideEl();
      if (setupEl) { setupEl.style.transition = "none"; setupEl.style.willChange = "transform"; }
    }
    // Horizontal pan confirmed — prevent iOS history-swipe and native scroll
    e.preventDefault();
    const el = slideEl();
    if (el) el.style.transform = `translateX(${dx * 0.85}px)`;
  }, { passive: false });

  app.addEventListener("touchcancel", () => {
    tracking = false; panning = false;
    resetSlide();
  }, { passive: true });

  app.addEventListener("touchend", (e: TouchEvent) => {
    if (!tracking) return;
    tracking = false;
    if (drag) { panning = false; resetSlide(); return; }

    const dx = e.changedTouches[0].clientX - startX;
    const adx = Math.abs(dx);

    if (adx < 18 || !panning) { resetSlide(); return; }

    panning = false;
    const dir = dx < 0 ? 1 : -1;
    const W = window.innerWidth;
    const exitX = dx < 0 ? -W : W;
    const enterX = -exitX;

    const el = slideEl();
    if (el) {
      el.style.transition = "transform 0.15s ease-in";
      el.style.transform = `translateX(${exitX}px)`;
    }

    setTimeout(() => {
      if (state.viewMode === "month") state.monthStart = addMonths(state.monthStart, dir);
      else state.weekStart = addDays(state.weekStart, 7 * dir);
      render();
      const newEl = slideEl();
      if (newEl) {
        newEl.style.transition = "none";
        newEl.style.transform = `translateX(${enterX}px)`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          newEl.style.transition = "transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)";
          newEl.style.transform = "";
          newEl.style.willChange = "";
        }));
      }
      // Delay data refresh so it doesn't interrupt the entrance animation
      setTimeout(() => void refreshEvents(), 280);
    }, 160);
  }, { passive: true });
})();

// ── Pull-to-refresh ────────────────────────────────────────────────────────
(function setupPullToRefresh(): void {
  const THRESHOLD = 72;
  let startY = 0;
  let curY = 0;
  let scrollEl: HTMLElement | null = null;
  let ind: HTMLElement | null = null;

  function getIndicator(): HTMLElement {
    if (!ind) {
      ind = document.createElement("div");
      ind.className = "ptr-indicator";
      ind.innerHTML = `<div class="ptr-indicator__circle"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#007AFF" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></div>`;
      document.body.appendChild(ind);
    }
    return ind;
  }

  function removeIndicator(): void {
    ind?.remove();
    ind = null;
  }

  function updateIndicator(dy: number): void {
    const progress = Math.min(1, dy / THRESHOLD);
    const indicator = getIndicator();
    const topPx = -18 + dy * 0.55;
    indicator.style.top = `${topPx}px`;
    indicator.style.opacity = String(Math.min(1, dy / 36));
    const svg = indicator.querySelector("svg")!;
    svg.style.transform = `rotate(${progress * 270}deg)`;
  }

  let startX = 0;
  let armed = false; // touch began near the top of the calendar list

  app.addEventListener("touchstart", (e: TouchEvent) => {
    armed = false;
    scrollEl = null;
    if (state.activeTab !== "kalender" || state.modal || drag) return;
    if ((e.target as HTMLElement).closest("button")) return;
    // Locate the scroll container directly — the pull may start anywhere
    // (header, day cell, event), not necessarily inside the list itself.
    const el = app.querySelector<HTMLElement>(".week-list, .month-scroll");
    if (!el || el.scrollTop > 2) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    curY = startY;
    scrollEl = el;
    armed = true;
  }, { passive: true });

  app.addEventListener("touchmove", (e: TouchEvent) => {
    if (!armed || !scrollEl) return;
    curY = e.touches[0].clientY;
    const dy = curY - startY;
    const dx = e.touches[0].clientX - startX;
    // Once the list scrolls away from the top, abandon the gesture.
    if (scrollEl.scrollTop > 2) { armed = false; scrollEl = null; removeIndicator(); return; }
    // Horizontal-dominant → it's a calendar swipe, not a pull. Bail out.
    if (Math.abs(dx) > Math.abs(dy)) { armed = false; scrollEl = null; removeIndicator(); return; }
    if (dy > 8) updateIndicator(dy); else removeIndicator();
  }, { passive: true });

  app.addEventListener("touchend", () => {
    if (!armed || !scrollEl) { removeIndicator(); return; }
    const dy = curY - startY;
    const doRefresh = dy >= THRESHOLD && scrollEl.scrollTop <= 2;
    armed = false;
    scrollEl = null;
    removeIndicator();
    if (doRefresh) {
      showTransientBanner("Wird aktualisiert…");
      lastFailedAt = 0; // clear any cooldown so a manual pull always refetches
      void refreshEvents();
      void syncDeletedBirthdaysFromHA().then(() => syncBirthdaysFromHA()).then(() => render());
      void syncHiddenUidsFromHA().then(() => void refreshEvents());
    }
  }, { passive: true });

  app.addEventListener("touchcancel", () => { armed = false; scrollEl = null; removeIndicator(); }, { passive: true });
})();

// ── Service Worker reload on update ───────────────────────────────────────
// When a new SW activates and claims this client it sends "sw-reload".
// Reloading here ensures the page picks up the new SW's cached assets
// instead of continuing to run the old JS/CSS bundle.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (evt) => {
    if ((evt.data as { type?: string })?.type === "sw-reload") {
      window.location.reload();
    }
  });
}
