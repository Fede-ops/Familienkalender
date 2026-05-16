import type { FamilyMember } from "../types.ts";

export interface ModalState {
  tab: "datum" | "detail" | "erinnerung";
  summary: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  memberId: string;
  location: string;
  notes: string;
}

export function defaultModalState(members: FamilyMember[]): ModalState {
  const now = new Date();
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return {
    tab: "datum",
    summary: "",
    startDate: start,
    endDate: end,
    allDay: false,
    memberId: members[0]?.id ?? "",
    location: "",
    notes: "",
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtDateTimeLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDateLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shade(hex: string, pct: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v + Math.round((255 * pct) / 100)));
  return `rgb(${clamp((n >> 16) & 0xff)},${clamp((n >> 8) & 0xff)},${clamp(n & 0xff)})`;
}

export function renderEventModal(state: ModalState, members: FamilyMember[]): string {
  const tabsHtml = (["datum", "detail", "erinnerung"] as const)
    .map(
      (key) =>
        `<button class="modal-tab${key === state.tab ? " modal-tab--active" : ""}" data-action="modal-tab" data-tab="${key}">${
          key === "datum" ? "Datum" : key === "detail" ? "Detail" : "Erinnerung"
        }</button>`
    )
    .join("");

  let tabBody = "";

  if (state.tab === "datum") {
    const isOn = state.allDay;
    tabBody = `
      <div class="field-group">
        <div class="field${isOn ? " field--toggle" : " field--toggle field--toggle-off"}">
          <span class="field__label">Ganztägig</span>
          <span class="field__value" data-action="toggle-allday"></span>
        </div>
      </div>
      <div class="field-group">
        ${
          isOn
            ? `<div class="field field--datetime">
                <span class="field__label">Datum</span>
                <input class="field__input" type="date" id="modal-start" value="${fmtDateLocal(state.startDate)}" />
               </div>
               <div class="field field--datetime">
                <span class="field__label">Enddatum</span>
                <input class="field__input" type="date" id="modal-end" value="${fmtDateLocal(state.endDate)}" />
               </div>`
            : `<div class="field field--datetime">
                <span class="field__label">Beginnt</span>
                <input class="field__input" type="datetime-local" id="modal-start" value="${fmtDateTimeLocal(state.startDate)}" />
               </div>
               <div class="field field--datetime">
                <span class="field__label">Endet</span>
                <input class="field__input" type="datetime-local" id="modal-end" value="${fmtDateTimeLocal(state.endDate)}" />
               </div>`
        }
      </div>`;
  } else if (state.tab === "detail") {
    const membersHtml = members
      .map((m) => {
        const grad = `linear-gradient(135deg,${m.color} 0%,${shade(m.color, -30)} 100%)`;
        return `<button class="member-chip${m.id === state.memberId ? " member-chip--active" : ""}" data-action="select-member" data-member-id="${m.id}">
          <span class="member-chip__avatar" style="background:${grad};">${m.initial}</span>
          <span class="member-chip__name">${m.name}</span>
        </button>`;
      })
      .join("");
    tabBody = `
      <div class="section-label">Kalender</div>
      <div class="member-picker">${membersHtml}</div>
      <div class="field-group">
        <div class="field field--column">
          <input class="field__input" id="modal-location" placeholder="Ort" value="${state.location}" />
        </div>
        <div class="field field--column" style="border-bottom:none;">
          <textarea class="field__input field__textarea" id="modal-notes" placeholder="Notizen hinzufügen...">${state.notes}</textarea>
        </div>
      </div>`;
  } else {
    tabBody = `
      <div class="field-group">
        <div class="field">
          <span class="field__label">Erinnerung</span>
          <span class="field__value field__value--accent">15 Min. vorher ›</span>
        </div>
        <div class="field">
          <span class="field__label">Zweite Erinnerung</span>
          <span class="field__value">Keine ›</span>
        </div>
      </div>`;
  }

  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal-sheet" data-stop-propagation>
      <div class="modal-handle"></div>
      <div class="modal-header">
        <button class="modal-header__close" data-action="close-modal">Abbrechen</button>
        <span class="modal-header__title">Neues Event</span>
        <button class="modal-header__action" data-action="save-event">Speichern</button>
      </div>
      <div class="modal-title-block">
        <input class="modal-title-input" id="modal-summary" placeholder="Beschreibung des Events…" value="${state.summary}" autocomplete="off" />
      </div>
      <div class="modal-tabs">${tabsHtml}</div>
      <div class="modal-body">${tabBody}</div>
    </div>
  </div>`;
}
