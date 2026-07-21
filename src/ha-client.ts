import type { CalendarEvent } from "./types.ts";

interface HAConfig {
  baseUrl: string;
  token: string;
  calendarEntities: string[];
}

const STORAGE_KEY = "ha-config";

// Lokale Zeit MIT Zeitzonen-Offset formatieren, z.B. "2026-07-23T16:00:00+02:00".
// WICHTIG: Ohne Offset speichert Home Assistant den Termin als "floating"
// (zeitzonenlose) Zeit — und solche Termine lassen sich später NICHT mehr per
// calendar.delete_event löschen (HA vergleicht intern zeitzonenlose mit
// zeitzonen-bewusster Zeit → 400 Bad Request).
function fmtDateTimeTZ(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  const offMin = -d.getTimezoneOffset();                 // Minuten östlich von UTC
  const sign = offMin >= 0 ? "+" : "-";
  const off = `${sign}${pad(Math.floor(Math.abs(offMin) / 60))}:${pad(Math.abs(offMin) % 60)}`;
  return `${date}T${time}${off}`;
}

export function loadConfig(): HAConfig | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HAConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: HAConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export class HAClient {
  constructor(private config: HAConfig) {}

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`HA request failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  async listCalendars(): Promise<{ entity_id: string; name: string }[]> {
    return this.request("/api/calendars");
  }

  async getEvents(entityId: string, start: Date, end: Date): Promise<CalendarEvent[]> {
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const raw = await this.request<RawHAEvent[]>(
      `/api/calendars/${entityId}?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`,
    );
    return raw.map((event) => normalizeEvent(event, entityId));
  }

  async getAllEvents(start: Date, end: Date): Promise<CalendarEvent[]> {
    const results = await Promise.allSettled(
      this.config.calendarEntities.map((entityId) => this.getEvents(entityId, start, end)),
    );
    const events: CalendarEvent[] = [];
    const errors: string[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") events.push(...r.value);
      else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
    if (errors.length > 0 && events.length === 0) throw new Error(errors[0]);
    // Dedup only by HA uid — fingerprint dedup is done in the caller AFTER
    // the pendingDeletes filter so that hidden events can correctly suppress
    // sibling duplicates that share the same (entity+start+summary) fingerprint.
    const seenUid = new Set<string>();
    const deduped = events.filter((e) => {
      if (seenUid.has(e.uid)) return false;
      seenUid.add(e.uid);
      return true;
    });
    return deduped.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  async createEvent(
    entityId: string,
    summary: string,
    start: Date,
    end: Date,
    allDay: boolean,
    opts?: { location?: string; description?: string; rrule?: string },
  ): Promise<void> {
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmtDate = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const body: Record<string, string> = { entity_id: entityId, summary };
    if (allDay) {
      body.start_date = fmtDate(start);
      body.end_date = fmtDate(end);
    } else {
      body.start_date_time = fmtDateTimeTZ(start);
      body.end_date_time = fmtDateTimeTZ(end);
    }
    if (opts?.location) body.location = opts.location;
    if (opts?.description) body.description = opts.description;
    if (opts?.rrule) body.rrule = opts.rrule;

    const res = await fetch(`${this.config.baseUrl}/api/services/calendar/create_event`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const raw = (await res.text()).trim();
        const parsed = JSON.parse(raw) as { message?: string };
        detail = typeof parsed.message === "string" ? parsed.message : raw;
      } catch { /* ignore */ }
      console.error(`[create_event] FAILED ${res.status}: ${detail || "(empty)"}\n  request: ${JSON.stringify(body)}`);
      throw new Error(`HA create_event failed: ${res.status}${detail ? `: ${detail}` : ""}`);
    }
  }

  async updateEvent(
    entityId: string,
    uid: string,
    summary: string,
    start: Date,
    end: Date,
    allDay: boolean,
    opts?: { location?: string; description?: string; rrule?: string },
  ): Promise<boolean> {
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmtDate = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const body: Record<string, string> = { entity_id: entityId, uid, summary };
    if (allDay) {
      body.start_date = fmtDate(start);
      body.end_date = fmtDate(end);
    } else {
      body.start_date_time = fmtDateTimeTZ(start);
      body.end_date_time = fmtDateTimeTZ(end);
    }
    if (opts?.location) body.location = opts.location;
    if (opts?.description) body.description = opts.description;
    if (opts?.rrule) body.rrule = opts.rrule;

    const res = await fetch(`${this.config.baseUrl}/api/services/calendar/update_event`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 400) return false; // not supported by this calendar backend
    if (!res.ok) throw new Error(`HA update_event failed: ${res.status}`);
    return true;
  }

  async deleteEvent(entityId: string, uid: string, recurrenceId?: string): Promise<void> {
    const body: Record<string, string> = { entity_id: entityId, uid };
    // Recurring event instances require recurrence_id + range so HA knows
    // which occurrence to delete — without these, HA returns 400.
    if (recurrenceId) {
      body.recurrence_id = recurrenceId;
      body.range = "this_event";
    }
    const res = await fetch(`${this.config.baseUrl}/api/services/calendar/delete_event`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Read once as text so we get whatever HA returned — JSON error body,
      // HTML error page, or plain text. Then surface it verbatim.
      let rawBody = "";
      try { rawBody = (await res.text()).trim(); } catch { /* ignore */ }
      // Many HA service errors look like {"message":"..."} — extract that
      // single field if present, otherwise keep the raw body.
      let detail = rawBody;
      try {
        const parsed = JSON.parse(rawBody) as { message?: string };
        if (parsed && typeof parsed.message === "string") detail = parsed.message;
      } catch { /* not JSON, keep raw */ }
      // Log the full details to the browser console for debugging.
      console.error(
        `[delete_event] FAILED ${res.status} ${res.statusText}\n` +
        `  request: ${JSON.stringify(body)}\n` +
        `  response: ${rawBody || "(empty)"}`,
      );
      const err = new Error(
        `HA delete_event ${res.status}: ${detail || "(leerer Body)"} (entity=${entityId} uid=${uid})`,
      );
      (err as Error & { httpStatus: number }).httpStatus = res.status;
      throw err;
    }
  }

  // Diagnostic: return whatever HA knows about a calendar entity so the
  // user can confirm which integration is providing it.
  async getEntityState(entityId: string): Promise<unknown> {
    return this.request(`/api/states/${entityId}`);
  }
}

interface RawHAEvent {
  summary: string;
  uid?: string;
  recurrence_id?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

function parseDateStr(str: string): Date {
  // Date-only strings (e.g. "2026-05-23") must be parsed as local midnight,
  // not UTC midnight — otherwise timezone shifts cause wrong day comparisons.
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(str);
}

function normalizeEvent(raw: RawHAEvent, calendarId: string): CalendarEvent {
  const allDay = Boolean(raw.start.date && !raw.start.dateTime);
  const startStr = raw.start.dateTime ?? raw.start.date!;
  const endStr = raw.end.dateTime ?? raw.end.date!;
  const startDate = parseDateStr(startStr);
  const startMs = startDate.getTime();
  let endDate = parseDateStr(endStr);
  // All-day events follow the iCal exclusive DTEND convention (end = last inclusive day + 1).
  // Subtract 1 day so our filters (>=) and bar layout work with the inclusive last day.
  if (allDay && endDate > startDate) {
    endDate = new Date(endDate.getTime() - 86_400_000);
  }
  return {
    // Use epoch ms (not the raw string) so the fallback UID is stable
    // regardless of whether HA returns "+02:00" or "Z" timezone format.
    uid: raw.uid ?? `${calendarId}-${startMs}-${raw.summary}`,
    summary: raw.summary,
    start: startDate,
    end: endDate,
    allDay,
    description: raw.description,
    location: raw.location,
    memberId: calendarId,
    recurrenceId: raw.recurrence_id,
  };
}
