import type { CalendarEvent } from "./types.ts";

interface HAConfig {
  baseUrl: string;
  token: string;
  calendarEntities: string[];
}

const STORAGE_KEY = "ha-config";

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
    // Deduplicate: same uid wins; for fallback uids, same (member+start+title) wins.
    const seen = new Set<string>();
    const deduped = events.filter((e) => {
      if (seen.has(e.uid)) return false;
      seen.add(e.uid);
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
    opts?: { location?: string; description?: string },
  ): Promise<void> {
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmtDate = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const fmtDateTime = (d: Date) =>
      `${fmtDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

    const body: Record<string, string> = { entity_id: entityId, summary };
    if (allDay) {
      body.start_date = fmtDate(start);
      body.end_date = fmtDate(end);
    } else {
      body.start_date_time = fmtDateTime(start);
      body.end_date_time = fmtDateTime(end);
    }
    if (opts?.location) body.location = opts.location;
    if (opts?.description) body.description = opts.description;

    const res = await fetch(`${this.config.baseUrl}/api/services/calendar/create_event`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HA create_event failed: ${res.status}`);
  }

  async updateEvent(
    entityId: string,
    uid: string,
    summary: string,
    start: Date,
    end: Date,
    allDay: boolean,
    opts?: { location?: string; description?: string },
  ): Promise<void> {
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmtDate = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const fmtDateTime = (d: Date) =>
      `${fmtDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

    const body: Record<string, string> = { entity_id: entityId, uid, summary };
    if (allDay) {
      body.start_date = fmtDate(start);
      body.end_date = fmtDate(end);
    } else {
      body.start_date_time = fmtDateTime(start);
      body.end_date_time = fmtDateTime(end);
    }
    if (opts?.location) body.location = opts.location;
    if (opts?.description) body.description = opts.description;

    const res = await fetch(`${this.config.baseUrl}/api/services/calendar/update_event`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HA update_event failed: ${res.status}`);
  }

  async deleteEvent(entityId: string, uid: string): Promise<void> {
    const res = await fetch(`${this.config.baseUrl}/api/services/calendar/delete_event`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ entity_id: entityId, uid }),
    });
    if (!res.ok) throw new Error(`HA delete_event failed: ${res.status}`);
  }
}

interface RawHAEvent {
  summary: string;
  uid?: string;
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
  const startMs = parseDateStr(startStr).getTime();
  return {
    // Use epoch ms (not the raw string) so the fallback UID is stable
    // regardless of whether HA returns "+02:00" or "Z" timezone format.
    uid: raw.uid ?? `${calendarId}-${startMs}-${raw.summary}`,
    summary: raw.summary,
    start: parseDateStr(startStr),
    end: parseDateStr(endStr),
    allDay,
    description: raw.description,
    location: raw.location,
    memberId: calendarId,
  };
}
