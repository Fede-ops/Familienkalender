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
    const results = await Promise.all(
      this.config.calendarEntities.map((entityId) => this.getEvents(entityId, start, end)),
    );
    return results.flat().sort((a, b) => a.start.getTime() - b.start.getTime());
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

function normalizeEvent(raw: RawHAEvent, calendarId: string): CalendarEvent {
  const allDay = Boolean(raw.start.date && !raw.start.dateTime);
  const startStr = raw.start.dateTime ?? raw.start.date!;
  const endStr = raw.end.dateTime ?? raw.end.date!;
  return {
    uid: raw.uid ?? `${calendarId}-${startStr}-${raw.summary}`,
    summary: raw.summary,
    start: new Date(startStr),
    end: new Date(endStr),
    allDay,
    description: raw.description,
    location: raw.location,
    memberId: calendarId,
  };
}
