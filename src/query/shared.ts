import type {
  HistogramValue,
  Labels,
  MatcherFact,
  QueryFacts,
  QueryLineage,
  SampleValue,
} from "./types";

export class QueryFailure extends Error {
  constructor(
    readonly kind: "syntax" | "unsupported" | "execution",
    message: string,
    readonly position?: number,
  ) {
    super(message);
  }
}

export function emptyFacts(): QueryFacts {
  return {
    semantic: [],
    cost: { seriesScanned: 0, samplesScanned: 0, streamsScanned: 0, recordsScanned: 0, scannedBytes: 0, returned: 0 },
    lineage: {
      metricSeries: [],
      metricSamples: [],
      logStreams: [],
      records: [],
      sources: [],
      events: [],
      operands: [],
      fieldOrigins: {},
      parserErrors: [],
      warnings: [],
    },
  };
}

export function uniquePush(target: string[], ...values: Array<string | undefined>): void {
  for (const value of values) if (value !== undefined && !target.includes(value)) target.push(value);
}

export function mergeLineage(target: QueryLineage, source: QueryLineage): void {
  uniquePush(target.metricSeries, ...source.metricSeries);
  for (const sample of source.metricSamples) {
    if (!target.metricSamples.some((candidate) => candidate.seriesId === sample.seriesId && candidate.timestamp === sample.timestamp)) target.metricSamples.push(sample);
  }
  uniquePush(target.logStreams, ...source.logStreams);
  uniquePush(target.records, ...source.records);
  uniquePush(target.sources, ...source.sources);
  uniquePush(target.events, ...source.events);
  for (const operand of source.operands) target.operands.push(operand);
  for (const error of source.parserErrors) {
    if (!target.parserErrors.some((candidate) => candidate.recordId === error.recordId && candidate.stage === error.stage)) {
      target.parserErrors.push(error);
    }
  }
  uniquePush(target.warnings, ...source.warnings);
  for (const [field, origins] of Object.entries(source.fieldOrigins)) {
    const existing = (target.fieldOrigins[field] ??= []);
    for (const origin of origins) if (!existing.includes(origin)) existing.push(origin);
  }
}

export function labelsKey(labels: Labels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(",");
}

export function cloneLabels(labels: Labels): Labels {
  return { ...labels };
}

export function matches(labels: Labels, matchers: MatcherFact[]): boolean {
  return matchers.every(({ label, operator, value }) => {
    const actual = labels[label] ?? "";
    if (operator === "=") return actual === value;
    if (operator === "!=") return actual !== value;
    let expression: RegExp;
    try {
      expression = new RegExp(`^(?:${value})$`);
    } catch {
      throw new QueryFailure("execution", `invalid regular expression ${JSON.stringify(value)}`);
    }
    return operator === "=~" ? expression.test(actual) : !expression.test(actual);
  });
}

const durationUnits: Record<string, number> = {
  ms: 0.001,
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  y: 31536000,
};

export function parseDuration(text: string): number {
  if (!text || text === "0") return 0;
  let total = 0;
  let offset = 0;
  const part = /(\d+(?:\.\d+)?)(ms|[smhdwy])/gy;
  while (offset < text.length) {
    part.lastIndex = offset;
    const match = part.exec(text);
    if (!match || match.index !== offset) throw new QueryFailure("syntax", `invalid duration ${JSON.stringify(text)}`);
    total += Number(match[1]) * durationUnits[match[2] as keyof typeof durationUnits]!;
    offset = part.lastIndex;
  }
  return total;
}

export function parseBytes(text: string): number {
  const match = /^(\d+(?:\.\d+)?)([kmgtpe]?i?b)$/i.exec(text);
  if (!match) throw new QueryFailure("execution", `invalid byte value ${JSON.stringify(text)}`);
  const unit = match[2]!.toLowerCase();
  const prefixes = ["b", "kb", "mb", "gb", "tb", "pb", "eb"];
  const binary = ["b", "kib", "mib", "gib", "tib", "pib", "eib"];
  const list = unit.includes("i") ? binary : prefixes;
  const power = list.indexOf(unit);
  return Number(match[1]) * (unit.includes("i") ? 1024 : 1000) ** power;
}

export function asNumber(value: SampleValue): number {
  if (typeof value !== "number") throw new QueryFailure("execution", "histogram value cannot be used as a number here");
  return value;
}

export function isHistogram(value: SampleValue): value is HistogramValue {
  return typeof value === "object" && Array.isArray(value.buckets);
}

export function compare(operator: string, left: number, right: number): boolean {
  switch (operator) {
    case "==": return left === right;
    case "!=": return left !== right;
    case ">": return left > right;
    case "<": return left < right;
    case ">=": return left >= right;
    case "<=": return left <= right;
    default: throw new QueryFailure("execution", `unknown comparison operator ${operator}`);
  }
}

export function arithmetic(operator: string, left: number, right: number): number {
  switch (operator) {
    case "+": return left + right;
    case "-": return left - right;
    case "*": return left * right;
    case "/": return left / right;
    case "%": return left % right;
    case "^": return left ** right;
    default: throw new QueryFailure("execution", `unknown arithmetic operator ${operator}`);
  }
}

export function arithmeticUnit(operator: string, left?: string, right?: string): string | undefined {
  return operator === "/" && left !== undefined && left === right ? "ratio" : left;
}

export function quantile(q: number, values: number[]): number {
  if (Number.isNaN(q) || q < 0) return Number.NEGATIVE_INFINITY;
  if (q > 1) return Number.POSITIVE_INFINITY;
  if (!values.length) return Number.NaN;
  const ordered = [...values].sort((a, b) => a - b);
  const rank = q * (ordered.length - 1);
  const lower = Math.floor(rank);
  const fraction = rank - lower;
  const a = ordered[lower]!;
  const b = ordered[Math.min(lower + 1, ordered.length - 1)]!;
  return a + (b - a) * fraction;
}

export function renderTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/{{\s*\.?([A-Za-z_][\w]*)\s*}}/g, (_whole, key: string) => String(values[key] ?? ""));
}
