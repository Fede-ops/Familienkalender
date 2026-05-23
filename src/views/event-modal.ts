import type { FamilyMember } from "../types.ts";

export type RecurrenceFreq = "" | "FREQ=DAILY" | "FREQ=WEEKLY" | "FREQ=MONTHLY" | "FREQ=YEARLY";

export interface ModalState {
  tab: "datum" | "detail" | "erinnerung";
  summary: string;
  startDate: Date;
  endDate: Date;           // allDay: exclusive iCal end (last_day + 1); timed: actual end
  allDay: boolean;
  rruleFreq: RecurrenceFreq;
  rruleUntil: Date;        // series end date (inclusive); ignored when rruleFreq is ""
  rruleWeekdays: string[]; // for WEEKLY: ["MO","TU",...] — at least one element
  rruleMonthMode: "monthday" | "weekday"; // for MONTHLY
  rruleMonthWeekPos: number;  // 1..4 or -1 (last)
  rruleMonthWeekDay: string;  // "MO"|"TU"|"WE"|"TH"|"FR"|"SA"|"SU"
  memberId: string;
  originalMemberId?: string;
  location: string;
  notes: string;
  editUid?: string;
  // Preserved during edit so meta-tags survive a save without being visible to the user
  seriesId?: string;        // [sid:xxx] from original description
  seriesRrule?: string;     // [rrule:...] from original description
}

// Map JS getDay() (0=Sun) → RRULE day code
const JS_DAY_TO_RRULE = ["SU","MO","TU","WE","TH","FR","SA"];

export function defaultModalState(members: FamilyMember[], date?: Date): ModalState {
  const now = new Date();
  const start = date ? new Date(date) : new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(now.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  const weekDay = JS_DAY_TO_RRULE[start.getDay()];
  const weekPos = Math.min(4, Math.ceil(start.getDate() / 7));

  const until = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());

  return {
    tab: "datum",
    summary: "",
    startDate: start,
    endDate: end,
    allDay: false,
    rruleFreq: "",
    rruleUntil: until,
    rruleWeekdays: [weekDay],
    rruleMonthMode: "monthday",
    rruleMonthWeekPos: weekPos,
    rruleMonthWeekDay: weekDay,
    memberId: members[0]?.id ?? "",
    location: "",
    notes: "",
  };
}

/** Builds the RRULE string to send to HA from the current modal state. */
export function buildRruleString(s: ModalState): string {
  if (!s.rruleFreq) return "";
  const until = s.rruleUntil
    ? `;UNTIL=${s.rruleUntil.getFullYear()}${pad(s.rruleUntil.getMonth() + 1)}${pad(s.rruleUntil.getDate())}`
    : "";
  let base: string = s.rruleFreq;
  if (s.rruleFreq === "FREQ=WEEKLY" && s.rruleWeekdays.length > 0) {
    base = `${s.rruleFreq};BYDAY=${s.rruleWeekdays.join(",")}`;
  } else if (s.rruleFreq === "FREQ=MONTHLY" && s.rruleMonthMode === "weekday" && s.rruleMonthWeekDay) {
    base = `${s.rruleFreq};BYDAY=${s.rruleMonthWeekPos}${s.rruleMonthWeekDay}`;
  }
  return base + until;
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

const DE_WEEKDAY: Record<string, string> = {
  MO: "Montag", TU: "Dienstag", WE: "Mittwoch",
  TH: "Donnerstag", FR: "Freitag", SA: "Samstag", SU: "Sonntag",
};
const DE_WEEKDAY_SHORT: Record<string, string> = {
  MO: "Mo", TU: "Di", WE: "Mi", TH: "Do", FR: "Fr", SA: "Sa", SU: "So",
};
const RRULE_DAYS_ORDER = ["MO","TU","WE","TH","FR","SA","SU"];

function posLabel(pos: number): string {
  return pos === -1 ? "letzten" : ["ersten","zweiten","dritten","vierten"][pos - 1] ?? `${pos}.`;
}

export function renderEventModal(state: ModalState, members: FamilyMember[], occurrenceCount?: number): string {
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

    // allDay end is stored as exclusive iCal (last_day + 1) — show the inclusive last day.
    const endDisplayDate = isOn ? new Date(state.endDate.getTime() - 86_400_000) : state.endDate;

    // ── Recurrence frequency selector ────────────────────────────────────
    const freqOptions: { value: RecurrenceFreq; label: string }[] = [
      { value: "", label: "Nie" },
      { value: "FREQ=DAILY", label: "Täglich" },
      { value: "FREQ=WEEKLY", label: "Wöchentlich" },
      { value: "FREQ=MONTHLY", label: "Monatlich" },
      { value: "FREQ=YEARLY", label: "Jährlich" },
    ];
    const freqHtml = freqOptions
      .map((o) => `<option value="${o.value}"${o.value === state.rruleFreq ? " selected" : ""}>${o.label}</option>`)
      .join("");

    // ── Weekly: weekday chip picker ───────────────────────────────────────
    const weekdayPickerHtml = state.rruleFreq === "FREQ=WEEKLY"
      ? `<div class="field-group">
           <div class="field field--column" style="gap:10px;padding:14px 16px;">
             <span class="field__label" style="font-size:13px;color:var(--text-secondary)">Wochentage</span>
             <div class="weekday-picker">
               ${RRULE_DAYS_ORDER.map((d) =>
                 `<button class="weekday-chip${state.rruleWeekdays.includes(d) ? " weekday-chip--active" : ""}"
                    data-action="toggle-weekday" data-day="${d}">${DE_WEEKDAY_SHORT[d]}</button>`
               ).join("")}
             </div>
           </div>
         </div>`
      : "";

    // ── Monthly: mode + position + weekday ───────────────────────────────
    let monthlyHtml = "";
    if (state.rruleFreq === "FREQ=MONTHLY") {
      const dayOfMonth = state.startDate.getDate();
      const dayName = DE_WEEKDAY[state.rruleMonthWeekDay] ?? state.rruleMonthWeekDay;
      const modeOpts = [
        { value: "monthday", label: `Am ${dayOfMonth}. des Monats` },
        { value: "weekday",  label: `Am ${posLabel(state.rruleMonthWeekPos)} ${dayName}` },
      ].map((o) => `<option value="${o.value}"${o.value === state.rruleMonthMode ? " selected" : ""}>${o.label}</option>`).join("");

      const weekdayOpts = RRULE_DAYS_ORDER
        .map((d) => `<option value="${d}"${d === state.rruleMonthWeekDay ? " selected" : ""}>${DE_WEEKDAY[d]}</option>`)
        .join("");

      const posOpts = [1,2,3,4,-1]
        .map((p) => `<option value="${p}"${p === state.rruleMonthWeekPos ? " selected" : ""}>${posLabel(p).charAt(0).toUpperCase() + posLabel(p).slice(1)}</option>`)
        .join("");

      monthlyHtml = `
        <div class="field-group">
          <div class="field">
            <span class="field__label">Modus</span>
            <select class="field__input field__select" id="modal-month-mode" data-action="recur-change">${modeOpts}</select>
          </div>
          ${state.rruleMonthMode === "weekday" ? `
          <div class="field">
            <span class="field__label">Position</span>
            <select class="field__input field__select" id="modal-month-pos" data-action="recur-change">${posOpts}</select>
          </div>
          <div class="field">
            <span class="field__label">Wochentag</span>
            <select class="field__input field__select" id="modal-month-weekday" data-action="recur-change">${weekdayOpts}</select>
          </div>` : ""}
        </div>`;
    }

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
                <input class="field__input" type="date" id="modal-end" value="${fmtDateLocal(endDisplayDate)}" />
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
      </div>
      ${state.seriesId && !state.rruleFreq ? `<div class="field-group">
        <div class="field">
          <span class="field__label" style="color:var(--text-secondary)">Teil einer Serie</span>
          <span class="field__value" style="color:var(--text-secondary);font-size:13px">Nur dieser Termin wird geändert</span>
        </div>
      </div>` : ""}
      <div class="field-group">
        <div class="field">
          <span class="field__label">Wiederholen</span>
          <select class="field__input field__select" id="modal-rrule" data-action="recur-change">${freqHtml}</select>
        </div>
        ${state.rruleFreq ? `<div class="field field--datetime">
          <span class="field__label">Serie endet am</span>
          <input class="field__input" type="date" id="modal-rrule-until" value="${fmtDateLocal(state.rruleUntil)}" />
        </div>
        ${occurrenceCount !== undefined ? `<div class="field">
          <span class="field__label" style="color:var(--text-secondary);font-size:13px">Termine werden angelegt</span>
          <span class="field__value" style="color:var(--text-secondary)">${occurrenceCount}</span>
        </div>` : ""}` : ""}
      </div>
      ${weekdayPickerHtml}
      ${monthlyHtml}`;
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
        <span class="modal-header__title">${state.editUid ? "Event bearbeiten" : "Neues Event"}</span>
        <button class="modal-header__action" data-action="save-event">${state.editUid ? "Aktualisieren" : "Speichern"}</button>
      </div>
      <div class="modal-title-block">
        <input class="modal-title-input" id="modal-summary" placeholder="Beschreibung des Events…" value="${state.summary}" autocomplete="off" />
      </div>
      <div class="modal-tabs">${tabsHtml}</div>
      <div class="modal-body">${tabBody}</div>
    </div>
  </div>`;
}
