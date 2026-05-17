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

export type TabKey = "kalender" | "todo" | "einkauf";

export interface ShoppingItem {
  id: string;
  name: string;
  category: string;
  checked: boolean;
}

export interface TodoItem {
  id: string;
  title: string;
  category: string;
  completed: boolean;
  createdAt: number;
  memberId?: string;
}
