import type { QueryValue, SampleValue } from "../query";

export const escapeHtml = (value: unknown): string => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

export const formatValue = (value: SampleValue | number): string => typeof value === "number"
  ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 5 }).format(value)
  : `histogram · count ${value.count} · sum ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value.sum)}`;

export const labelsText = (labels: Record<string, string>): string =>
  Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}="${value}"`).join(", ") || "no labels";

export const labelsPlain = (labels: Record<string, string>): string =>
  Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("  ") || "no labels";

export function formatTime(value: string | number | undefined): string {
  if (value === undefined) return "—";
  const date = new Date(typeof value === "number" ? value * 1000 : value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

/** Wall-clock face of a campaign timestamp, e.g. 09:12. */
export function clockTime(value: string | number | undefined): string {
  if (value === undefined) return "--:--";
  const date = new Date(typeof value === "number" ? value * 1000 : value);
  return Number.isNaN(date.valueOf()) ? "--:--" : date.toISOString().slice(11, 16);
}

export function clockSeconds(value: string | number | undefined): string {
  if (value === undefined) return "--:--:--";
  const date = new Date(typeof value === "number" ? value * 1000 : value);
  return Number.isNaN(date.valueOf()) ? "--:--:--" : date.toISOString().slice(11, 19);
}

export function calendarDate(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(date.getUTCDate()).padStart(2, "0")} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "7 h 48 min", or "48 min" under an hour. */
export function minutesPhrase(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return hours ? `${hours} h ${String(rest).padStart(2, "0")} min` : `${rest} min`;
}

export function resultSize(result: QueryValue): number {
  if (result.type === "scalar") return 1;
  if (result.type === "instant-vector" || result.type === "range-vector") return result.series.length;
  return result.streams.reduce((sum, stream) => sum + stream.records.length, 0);
}

export function resultKindLabel(result: QueryValue): string {
  if (result.type === "scalar") return "SCALAR";
  if (result.type === "instant-vector") return "INSTANT VECTOR";
  if (result.type === "range-vector") return "RANGE VECTOR";
  return "RECORDS";
}

export function highlightQuery(source: string): string {
  const token = /("(?:\\.|[^"\\])*")|(\b\d+(?:\.\d+)?(?:ms|s|m|h|d|w|KiB|MiB|GiB)?\b)|(\b[a-zA-Z_:][\w:]*)(?=\s*\()|(!=|=~|!~|==|>=|<=|[+\-*/%^><=])|([{}[\](),|])/g;
  let output = "";
  let cursor = 0;
  for (const match of source.matchAll(token)) {
    output += escapeHtml(source.slice(cursor, match.index));
    const kind = match[1] ? "string" : match[2] ? "number" : match[3] ? "function" : match[4] ? "operator" : "punctuation";
    output += `<span class="tok-${kind}">${escapeHtml(match[0])}</span>`;
    cursor = (match.index ?? 0) + match[0].length;
  }
  return `${output}${escapeHtml(source.slice(cursor))}\n`;
}

export const paperclip = (width = 22, height = 48, colour = "#e8785a"): string =>
  `<svg width="${width}" height="${height}" viewBox="0 0 22 48" aria-hidden="true" focusable="false"><path d="M 6 44 L 6 8 A 5 5 0 0 1 16 8 L 16 38 A 3 3 0 0 1 10 38 L 10 12" fill="none" stroke="${colour}" stroke-width="3.5" stroke-linecap="round"/></svg>`;

const mouths = [
  '<path d="M 13 28 Q 20 22 27 28" fill="none" stroke="#1f2d44" stroke-width="2" stroke-linecap="round"/>',
  '<line x1="13" y1="27" x2="27" y2="27" stroke="#1f2d44" stroke-width="2" stroke-linecap="round"/>',
  '<path d="M 13 25 Q 20 30 27 25" fill="none" stroke="#1f2d44" stroke-width="2" stroke-linecap="round"/>',
  '<path d="M 12 24 Q 20 33 28 24" fill="none" stroke="#1f2d44" stroke-width="2" stroke-linecap="round"/>',
  '<path d="M 11 23 Q 20 36 29 23 Z" fill="#1f2d44"/>',
];

/** One face per standing band, worst to best. The reached band is filled coral. */
export function face(position: number, count: number, reached: boolean): string {
  const step = count > 1 ? (mouths.length - 1) / (count - 1) : 0;
  const mouth = mouths[Math.round(position * step)] ?? mouths[2];
  return `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="20" r="18" fill="${reached ? "#e8785a" : "#fffdf7"}" stroke="#1f2d44" stroke-width="2"/><circle cx="14" cy="16" r="2" fill="#1f2d44"/><circle cx="26" cy="16" r="2" fill="#1f2d44"/>${mouth}</svg>`;
}

/** Sunburst wall clock with hands set to the campaign hour and minute. */
export function wallClock(hour: number, minute: number): string {
  const minuteAngle = minute * 6;
  const hourAngle = (hour % 12) * 30 + minute * 0.5;
  return `<svg class="wall-clock" width="112" height="112" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
    <g stroke="#f5cf62" stroke-width="4" stroke-linecap="round">
      <line x1="60" y1="4" x2="60" y2="18"/><line x1="60" y1="102" x2="60" y2="116"/>
      <line x1="4" y1="60" x2="18" y2="60"/><line x1="102" y1="60" x2="116" y2="60"/>
      <line x1="20" y1="20" x2="30" y2="30"/><line x1="90" y1="90" x2="100" y2="100"/>
      <line x1="20" y1="100" x2="30" y2="90"/><line x1="90" y1="30" x2="100" y2="20"/>
    </g>
    <circle cx="60" cy="60" r="36" fill="#fffdf7" stroke="#1f2d44" stroke-width="3"/>
    <line x1="60" y1="60" x2="60" y2="40" stroke="#1f2d44" stroke-width="4" stroke-linecap="round" transform="rotate(${hourAngle.toFixed(1)} 60 60)"/>
    <line x1="60" y1="60" x2="60" y2="32" stroke="#1f2d44" stroke-width="3" stroke-linecap="round" transform="rotate(${minuteAngle.toFixed(1)} 60 60)"/>
    <circle cx="60" cy="60" r="3" fill="#e8785a"/>
  </svg>`;
}

export function initials(name: string): string {
  return name.split(/[\s,.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "M";
}
