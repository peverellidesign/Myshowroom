/** Timezone helpers (no external dependency). */

function tzOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUtc - date.getTime()) / 60000;
}

/** Converts a local wall-clock time (YYYY-MM-DD + minutes from midnight) in `timeZone` to a UTC Date. */
export function zonedToUtc(day: string, minutes: number, timeZone: string) {
  const [y, m, d] = day.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60));
  const offset = tzOffsetMinutes(guess, timeZone);
  const result = new Date(guess.getTime() - offset * 60000);
  // Correct around DST transitions.
  const offset2 = tzOffsetMinutes(result, timeZone);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2 * 60000);
}

/** Returns the YYYY-MM-DD of a date in a timezone. */
export function dayKey(date: Date, timeZone = "Europe/Zurich") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Minutes from midnight in a timezone. */
export function minutesOfDay(date: Date, timeZone = "Europe/Zurich") {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(date);
  return Number(parts.find((p) => p.type === "hour")?.value) * 60 + Number(parts.find((p) => p.type === "minute")?.value);
}

/** ISO weekday 1 (Mon) … 7 (Sun) for a YYYY-MM-DD string. */
export function isoWeekday(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function minutesToHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function hhmmToMinutes(v: string) {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + (m || 0);
}

export const WEEKDAY_LABELS = ["", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
