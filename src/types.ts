export interface FamilyMember {
  id: string;
  name: string;
  initial: string;
  color: string;
}

export interface CalendarEvent {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  allDay: boolean;
  description?: string;
  location?: string;
  memberId?: string;
}

export type ViewMode = "week" | "month";
