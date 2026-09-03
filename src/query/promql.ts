import {
  arithmetic,
  arithmeticUnit,
  asNumber,
  cloneLabels,
  compare,
  isHistogram,
  labelsKey,
  matches,
  parseDuration,
  QueryFailure,
  uniquePush,
} from "./shared";
import type {
  HistogramValue,
  Labels,
  MatcherFact,
  MetricSeries,
  QueryContext,
  QueryFacts,
  QueryValue,
  SampleValue,
  SemanticNode,
} from "./types";

type TokenKind = "id" | "number" | "string" | "duration" | "symbol" | "eof";
interface Token { kind: TokenKind; value: string; position: number }

type Expr =
  | { kind: "number"; value: number }
  | { kind: "selector"; metric?: string; matchers: MatcherFact[]; range?: number; offset?: number; at?: number | string }
  | { kind: "subquery"; expression: Expr; range: number; resolution?: number; offset?: number; at?: number | string }
  | { kind: "call"; name: string; args: Expr[] }
  | { kind: "aggregation"; operator: string; expression: Expr; parameter?: Expr; grouping: "none" | "by" | "without"; labels: string[] }
  | { kind: "unary"; operator: "+" | "-"; expression: Expr }
  | { kind: "binary"; operator: string; left: Expr; right: Expr; bool: boolean; matching: VectorMatching };

interface VectorMatching {
  mode: "default" | "on" | "ignoring";
  labels: string[];
  cardinality: "one-to-one" | "many-to-one" | "one-to-many";
  include: string[];
}

interface EvalSample {
  labels: Labels;
  timestamp: number;
  value: SampleValue;
  unit?: string;
  ids: string[];
  sources: string[];
  events: string[];
}

interface EvalSeries {
  labels: Labels;
  values: Array<{ timestamp: number; value: SampleValue; events: string[] }>;
  unit?: string;
  ids: string[];
  sources: string[];
  rangeStart: number;
  rangeEnd: number;
}

type EvalValue =
  | { kind: "scalar"; value: number; timestamp: number }
  | { kind: "vector"; samples: EvalSample[] }
  | { kind: "matrix"; series: EvalSeries[] };

const aggregations = new Set(["sum", "avg", "min", "max", "count", "topk", "bottomk"]);
const calls = new Set([
  "rate", "increase", "avg_over_time", "min_over_time", "max_over_time", "sum_over_time",
  "count_over_time", "last_over_time", "present_over_time", "changes", "resets", "predict_linear",
  "absent", "absent_over_time", "histogram_quantile", "scalar",
]);
const comparisonOperators = new Set(["==", "!=", ">", "<", ">=", "<="]);
const setOperators = new Set(["and", "or", "unless"]);

class Lexer {
  private index = 0;
  constructor(private readonly source: string) {}

  scan(): Token[] {
    const tokens: Token[] = [];
    while (this.index < this.source.length) {
      const position = this.index;
      const character = this.source[this.index]!;
      if (/\s/.test(character)) { this.index++; continue; }
      if (character === "#") {
        while (this.index < this.source.length && this.source[this.index] !== "\n") this.index++;
        continue;
      }
      if (character === '"') { tokens.push(this.string()); continue; }
      const two = this.source.slice(this.index, this.index + 2);
      if (["=~", "!~", "==", "!=", ">=", "<="].includes(two)) {
        this.index += 2;
        tokens.push({ kind: "symbol", value: two, position });
        continue;
      }
      if (/[0-9.]/.test(character) && (character !== "." || /\d/.test(this.source[this.index + 1] ?? ""))) {
        tokens.push(this.numberOrDuration());
        continue;
      }
      if (/[A-Za-z_]/.test(character)) {
        const match = /^[A-Za-z_][A-Za-z0-9_:]*/.exec(this.source.slice(this.index))!;
        this.index += match[0].length;
        tokens.push({ kind: "id", value: match[0], position });
        continue;
      }
      if ("{}[](),:+-*/%^><=@".includes(character)) {
        this.index++;
        tokens.push({ kind: "symbol", value: character, position });
        continue;
      }
      throw new QueryFailure("syntax", `unexpected character ${JSON.stringify(character)}`, position);
    }
    tokens.push({ kind: "eof", value: "", position: this.source.length });
    return tokens;
  }

  private string(): Token {
    const position = this.index++;
    let value = "";
    while (this.index < this.source.length) {
      const character = this.source[this.index++]!;
      if (character === '"') return { kind: "string", value, position };
      if (character !== "\\") { value += character; continue; }
      if (this.index >= this.source.length) break;
      const escaped = this.source[this.index++]!;
      const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" };
      value += escapes[escaped] ?? escaped;
    }
    throw new QueryFailure("syntax", "unterminated string", position);
  }

  private numberOrDuration(): Token {
    const position = this.index;
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(this.source.slice(this.index));
    if (!match) throw new QueryFailure("syntax", "invalid number", position);
    this.index += match[0].length;
    const duration = /^(?:ms|[smhdwy])/.exec(this.source.slice(this.index));
    if (!duration) return { kind: "number", value: match[0], position };
    let value = match[0] + duration[0];
    this.index += duration[0].length;
    while (true) {
      const part = /^\d+(?:\.\d+)?(?:ms|[smhdwy])/.exec(this.source.slice(this.index));
      if (!part) break;
      value += part[0];
      this.index += part[0].length;
    }
    return { kind: "duration", value, position };
  }
}

class Parser {
  private cursor = 0;
  readonly semantic: SemanticNode[] = [];
  constructor(private readonly tokens: Token[], private readonly context: QueryContext) {}

  parse(): Expr {
    if (this.peek().kind === "eof") throw new QueryFailure("syntax", "query is empty", 0);
    const expression = this.expression(0);
    const remaining = this.peek();
    if (remaining.kind !== "eof") throw new QueryFailure("syntax", `unexpected token ${remaining.value}`, remaining.position);
    return expression;
  }

  private expression(minimumPrecedence: number): Expr {
    let left = this.unary();
    while (true) {
      const operator = this.binaryOperator();
      const precedence = operator === undefined ? -1 : this.precedence(operator);
      if (operator === undefined || precedence < minimumPrecedence) break;
      this.cursor++;
      const modifiers = this.modifiers(operator);
      const right = this.expression(precedence + (operator === "^" ? 0 : 1));
      left = { kind: "binary", operator, left, right, ...modifiers };
      this.semantic.push({ kind: "binary", operator, bool: modifiers.bool });
      if (setOperators.has(operator)) this.semantic.push({ kind: "set-operator", operator: operator as "and" | "or" | "unless" });
      if (modifiers.matching.mode !== "default" || modifiers.matching.cardinality !== "one-to-one") {
        this.semantic.push({
          kind: "vector-match",
          matching: modifiers.matching.mode,
          labels: modifiers.matching.labels,
          cardinality: modifiers.matching.cardinality,
          include: modifiers.matching.include,
        });
      }
      if (modifiers.matching.cardinality !== "one-to-one") this.semantic.push({ kind: "group-modifier", side: modifiers.matching.cardinality === "many-to-one" ? "left" : "right", cardinality: modifiers.matching.cardinality, include: modifiers.matching.include });
    }
    return left;
  }

  private unary(): Expr {
    if (this.at("+") || this.at("-")) {
      const operator = this.take().value as "+" | "-";
      return { kind: "unary", operator, expression: this.unary() };
    }
    return this.postfix(this.primary());
  }

  private primary(): Expr {
    const token = this.peek();
    if (token.kind === "number") { this.cursor++; return { kind: "number", value: Number(token.value) }; }
    if (this.takeIf("(")) {
      const expression = this.expression(0);
      this.expect(")");
      return expression;
    }
    if (this.at("{")) return this.selector(undefined);
    if (token.kind !== "id") throw new QueryFailure("syntax", `expected expression, got ${token.value || "end of query"}`, token.position);
    this.cursor++;
    const name = token.value;
    if (aggregations.has(name)) return this.aggregation(name);
    if (this.at("(")) return this.call(name, token.position);
    return this.selector(name);
  }

  private selector(metric?: string): Expr {
    const matchers: MatcherFact[] = [];
    if (this.takeIf("{")) {
      if (!this.takeIf("}")) {
        do {
          const label = this.expectKind("id");
          const operator = this.take();
          if (!["=", "!=", "=~", "!~"].includes(operator.value)) {
            throw new QueryFailure("syntax", "expected label matcher", operator.position);
          }
          const value = this.expectKind("string");
          if (operator.value === "=~" || operator.value === "!~") {
            try { new RegExp(`^(?:${value.value})$`); }
            catch { throw new QueryFailure("syntax", `invalid regular expression ${JSON.stringify(value.value)}`, value.position); }
          }
          matchers.push({ label: label.value, operator: operator.value as MatcherFact["operator"], value: value.value });
        } while (this.takeIf(","));
        this.expect("}");
      }
    } else if (!metric) {
      throw new QueryFailure("syntax", "selector requires a metric name or label matchers", this.peek().position);
    }
    if (!metric && (!matchers.length || matches({}, matchers))) throw new QueryFailure("syntax", "vector selector must contain a matcher that does not match an empty label set");
    this.semantic.push({ kind: "metric-selector", metric, matchers: [...matchers] });
    for (const matcher of matchers) this.semantic.push({ kind: "metric-selector", metric, matchers: [matcher] });
    return { kind: "selector", metric, matchers };
  }

  private postfix(base: Expr): Expr {
    let expression = base;
    if (this.takeIf("[")) {
      const range = this.duration();
      let resolution: number | undefined;
      const subquery = this.takeIf(":");
      if (subquery && !this.at("]")) resolution = this.duration();
      this.expect("]");
      if (subquery) {
        expression = { kind: "subquery", expression, range, resolution };
        this.semantic.push({ kind: "subquery", range, ...(resolution === undefined ? {} : { resolution }) });
      } else if (expression.kind === "selector") {
        expression.range = range;
        this.semantic.push({ kind: "range-selector", seconds: range });
      } else {
        throw new QueryFailure("syntax", "ranges on expressions require subquery syntax [range:resolution]", this.peek(-1).position);
      }
    }
    let sawOffset = false;
    let sawAt = false;
    while ((this.atId("offset") && !sawOffset) || (this.at("@") && !sawAt)) {
      if (this.takeIfId("offset")) {
        sawOffset = true;
        const sign = this.takeIf("-") ? -1 : 1;
        const offset = sign * this.duration();
        if (expression.kind !== "selector" && expression.kind !== "subquery") throw new QueryFailure("syntax", "offset must follow a selector or subquery");
        expression.offset = offset;
        this.semantic.push({ kind: "time-modifier", modifier: "offset", value: offset });
      } else {
        this.expect("@");
        sawAt = true;
        const token = this.take();
        let at: number | string;
        if (token.kind === "number") at = Number(token.value);
        else if (token.kind === "id" && ["start", "end"].includes(token.value) && this.takeIf("(")) {
          this.expect(")");
          at = token.value;
        } else throw new QueryFailure("syntax", "@ expects a timestamp, start(), or end()", token.position);
        if (expression.kind !== "selector" && expression.kind !== "subquery") throw new QueryFailure("syntax", "@ must follow a selector or subquery");
        expression.at = at;
        this.semantic.push({ kind: "time-modifier", modifier: "at", value: at });
      }
    }
    return expression;
  }

  private call(name: string, position: number): Expr {
    if (!calls.has(name)) throw new QueryFailure("unsupported", `PromQL function ${name} is not supported`, position);
    this.expect("(");
    const args: Expr[] = [];
    if (!this.takeIf(")")) {
      do args.push(this.expression(0)); while (this.takeIf(","));
      this.expect(")");
    }
    const expected = name === "predict_linear" || name === "histogram_quantile" ? 2 : 1;
    if (args.length !== expected) throw new QueryFailure("syntax", `${name} expects ${expected} argument${expected === 1 ? "" : "s"}`, position);
    this.semantic.push({ kind: "function", name, inputKind: this.inputKind(name, args) });
    return { kind: "call", name, args };
  }

  private aggregation(operator: string): Expr {
    let grouping: "none" | "by" | "without" = "none";
    let labels: string[] = [];
    if (this.atId("by") || this.atId("without")) ({ grouping, labels } = this.grouping());
    this.expect("(");
    let parameter: Expr | undefined;
    let expression = this.expression(0);
    if (this.takeIf(",")) {
      parameter = expression;
      expression = this.expression(0);
    }
    this.expect(")");
    if (grouping === "none" && (this.atId("by") || this.atId("without"))) ({ grouping, labels } = this.grouping());
    if ((operator === "topk" || operator === "bottomk") !== (parameter !== undefined)) {
      throw new QueryFailure("syntax", `${operator} ${operator === "topk" || operator === "bottomk" ? "requires" : "does not accept"} a parameter`);
    }
    this.semantic.push({ kind: "aggregation", operator, grouping, labels: [...labels] });
    return { kind: "aggregation", operator, expression, ...(parameter ? { parameter } : {}), grouping, labels };
  }

  private inputKind(name: string, args: Expr[]): string {
    if (name === "absent" || name === "scalar") return "instant-vector";
    if (["absent_over_time", "changes", "resets", "avg_over_time", "min_over_time", "max_over_time", "sum_over_time", "count_over_time", "last_over_time", "present_over_time"].includes(name)) return "range-vector";
    const types = this.metricTypes(args[name === "histogram_quantile" ? 1 : 0]);
    if (name === "histogram_quantile") return types.has("native-histogram") ? "native-histogram" : "classic-histogram";
    if (name === "predict_linear") return types.has("gauge") ? "gauge-range" : "range-vector";
    if (name === "rate" || name === "increase") {
      if (types.has("classic-histogram")) return "classic-bucket-range";
      if (types.has("counter")) return "counter-range";
    }
    return "range-vector";
  }

  private metricTypes(expression: Expr | undefined): Set<MetricSeries["type"]> {
    const types = new Set<MetricSeries["type"]>();
    const visit = (node: Expr | undefined): void => {
      if (!node) return;
      if (node.kind === "selector") {
        for (const series of this.context.metrics ?? []) {
          if ((!node.metric || series.metric === node.metric) && matches({ __name__: series.metric, ...series.labels }, node.matchers)) types.add(series.type);
        }
      } else if (node.kind === "subquery" || node.kind === "unary") visit(node.expression);
      else if (node.kind === "call") node.args.forEach(visit);
      else if (node.kind === "aggregation") { visit(node.expression); visit(node.parameter); }
      else if (node.kind === "binary") { visit(node.left); visit(node.right); }
    };
    visit(expression);
    return types;
  }

  private grouping(): { grouping: "by" | "without"; labels: string[] } {
    const grouping = this.take().value as "by" | "without";
    this.expect("(");
    const labels: string[] = [];
    if (!this.takeIf(")")) {
      do labels.push(this.expectKind("id").value); while (this.takeIf(","));
      this.expect(")");
    }
    return { grouping, labels };
  }

  private modifiers(operator: string): { bool: boolean; matching: VectorMatching } {
    let bool = false;
    const matching: VectorMatching = { mode: "default", labels: [], cardinality: "one-to-one", include: [] };
    if (this.takeIfId("bool")) {
      if (!comparisonOperators.has(operator)) throw new QueryFailure("syntax", "bool is valid only on comparisons");
      bool = true;
    }
    if (this.atId("on") || this.atId("ignoring")) {
      matching.mode = this.take().value as "on" | "ignoring";
      matching.labels = this.labelList();
    }
    if (this.atId("group_left") || this.atId("group_right")) {
      const side = this.take().value;
      matching.cardinality = side === "group_left" ? "many-to-one" : "one-to-many";
      if (this.at("(")) matching.include = this.labelList();
    }
    if (setOperators.has(operator) && matching.cardinality !== "one-to-one") throw new QueryFailure("syntax", "group modifiers are not valid on set operators");
    return { bool, matching };
  }

  private labelList(): string[] {
    this.expect("(");
    const labels: string[] = [];
    if (!this.takeIf(")")) {
      do labels.push(this.expectKind("id").value); while (this.takeIf(","));
      this.expect(")");
    }
    return labels;
  }

  private duration(): number {
    const token = this.take();
    if (token.kind !== "duration") throw new QueryFailure("syntax", "expected duration", token.position);
    return parseDuration(token.value);
  }

  private binaryOperator(): string | undefined {
    const token = this.peek();
    if (["+", "-", "*", "/", "%", "^", "==", "!=", ">", "<", ">=", "<="].includes(token.value)) return token.value;
    if (token.kind === "id" && setOperators.has(token.value)) return token.value;
    if (token.kind === "id" && token.value === "atan2") throw new QueryFailure("unsupported", "PromQL operator atan2 is not supported", token.position);
    return undefined;
  }

  private precedence(operator: string): number {
    if (operator === "or") return 1;
    if (operator === "and" || operator === "unless") return 2;
    if (comparisonOperators.has(operator)) return 3;
    if (operator === "+" || operator === "-") return 4;
    if (["*", "/", "%"].includes(operator)) return 5;
    return 6;
  }

  private expect(value: string): Token {
    const token = this.take();
    if (token.value !== value) throw new QueryFailure("syntax", `expected ${value}, got ${token.value || "end of query"}`, token.position);
    return token;
  }
  private expectKind(kind: TokenKind): Token {
    const token = this.take();
    if (token.kind !== kind) throw new QueryFailure("syntax", `expected ${kind}, got ${token.value || "end of query"}`, token.position);
    return token;
  }
  private at(value: string): boolean { return this.peek().value === value; }
  private atId(value: string): boolean { const token = this.peek(); return token.kind === "id" && token.value === value; }
  private takeIf(value: string): boolean { if (!this.at(value)) return false; this.cursor++; return true; }
  private takeIfId(value: string): boolean { if (!this.atId(value)) return false; this.cursor++; return true; }
  private take(): Token { return this.tokens[Math.min(this.cursor++, this.tokens.length - 1)]!; }
  private peek(relative = 0): Token { return this.tokens[Math.max(0, Math.min(this.cursor + relative, this.tokens.length - 1))]!; }
}

class Evaluator {
  constructor(private readonly context: QueryContext, private readonly facts: QueryFacts) {}

  run(expression: Expr, timestamp = this.context.timestamp): EvalValue {
    switch (expression.kind) {
      case "number": return { kind: "scalar", value: expression.value, timestamp };
      case "selector": return this.selector(expression, timestamp);
      case "subquery": return this.subquery(expression, timestamp);
      case "call": return this.call(expression, timestamp);
      case "aggregation": return this.aggregate(expression, timestamp);
      case "unary": return this.unary(expression, timestamp);
      case "binary": return this.binary(expression, timestamp);
    }
  }

  private selector(expression: Extract<Expr, { kind: "selector" }>, timestamp: number): EvalValue {
    const evaluationTime = this.modifiedTime(timestamp, expression.at, expression.offset);
    const result: EvalSeries[] = [];
    for (const series of this.context.metrics ?? []) {
      if (expression.metric && series.metric !== expression.metric) continue;
      const labels = { __name__: series.metric, ...series.labels };
      if (!matches(labels, expression.matchers)) continue;
      this.facts.cost.seriesScanned++;
      const id = series.id ?? `${series.metric}{${labelsKey(series.labels)}}`;
      uniquePush(this.facts.lineage.metricSeries, id);
      uniquePush(this.facts.lineage.sources, series.source);
      const start = expression.range === undefined ? evaluationTime - (this.context.lookback ?? 300) : evaluationTime - expression.range;
      const samples = series.samples
        .filter((sample) => sample.timestamp <= evaluationTime && sample.timestamp > start)
        .sort((a, b) => a.timestamp - b.timestamp);
      this.facts.cost.samplesScanned += samples.length;
      if (!samples.length) continue;
      const contributing = expression.range === undefined ? samples.slice(-1) : samples;
      for (const sample of contributing) {
        if (!this.facts.lineage.metricSamples.some((candidate) => candidate.seriesId === id && candidate.timestamp === sample.timestamp)) {
          this.facts.lineage.metricSamples.push({ seriesId: id, timestamp: sample.timestamp });
        }
      }
      const values = samples.map((sample) => {
        return { timestamp: sample.timestamp, value: sample.value, events: [...(sample.eventIds ?? [])] };
      });
      result.push({ labels, values, unit: series.unit, ids: [id], sources: series.source ? [series.source] : [], rangeStart: start, rangeEnd: evaluationTime });
    }
    if (expression.range !== undefined) return { kind: "matrix", series: result };
    return {
      kind: "vector",
      samples: result.map((series) => {
        const latest = series.values.at(-1)!;
        return { labels: series.labels, timestamp, value: latest.value, unit: series.unit, ids: series.ids, sources: series.sources, events: latest.events };
      }),
    };
  }

  private subquery(expression: Extract<Expr, { kind: "subquery" }>, timestamp: number): EvalValue {
    const end = this.modifiedTime(timestamp, expression.at, expression.offset);
    const start = end - expression.range;
    const step = expression.resolution ?? this.context.step ?? Math.max(1, Math.min(60, expression.range / 10));
    const grouped = new Map<string, EvalSeries>();
    for (let time = start + step; time <= end + 1e-9; time += step) {
      const value = this.run(expression.expression, time);
      if (value.kind === "scalar") {
        const entry = grouped.get("") ?? { labels: {}, values: [], ids: [], sources: [], rangeStart: start, rangeEnd: end };
        entry.values.push({ timestamp: time, value: value.value, events: [] });
        grouped.set("", entry);
      } else if (value.kind === "vector") {
        for (const sample of value.samples) {
          const key = labelsKey(sample.labels);
          const entry = grouped.get(key) ?? { labels: sample.labels, values: [], unit: sample.unit, ids: [], sources: [], rangeStart: start, rangeEnd: end };
          entry.values.push({ timestamp: time, value: sample.value, events: sample.events });
          uniquePush(entry.ids, ...sample.ids);
          uniquePush(entry.sources, ...sample.sources);
          grouped.set(key, entry);
        }
      } else throw new QueryFailure("execution", "subquery expression must return a scalar or instant vector");
    }
    return { kind: "matrix", series: [...grouped.values()] };
  }

  private call(expression: Extract<Expr, { kind: "call" }>, timestamp: number): EvalValue {
    const args = expression.args.map((argument) => this.run(argument, timestamp));
    const first = args[0]!;
    if (expression.name === "scalar") {
      if (first.kind !== "vector") throw new QueryFailure("execution", "scalar expects an instant vector");
      const value = first.samples.length === 1 ? asNumber(first.samples[0]!.value) : Number.NaN;
      return { kind: "scalar", value, timestamp };
    }
    if (expression.name === "absent") {
      if (first.kind !== "vector") throw new QueryFailure("execution", "absent expects an instant vector");
      return { kind: "vector", samples: first.samples.length ? [] : [this.generatedSample(this.absentLabels(expression.args[0]!), 1, timestamp)] };
    }
    if (expression.name === "absent_over_time") {
      if (first.kind !== "matrix") throw new QueryFailure("execution", "absent_over_time expects a range vector");
      return { kind: "vector", samples: first.series.length ? [] : [this.generatedSample(this.absentLabels(expression.args[0]!), 1, timestamp)] };
    }
    if (expression.name === "histogram_quantile") return this.histogramQuantile(args, timestamp);
    if (expression.name === "predict_linear") return this.predictLinear(args, timestamp);
    if (first.kind !== "matrix") throw new QueryFailure("execution", `${expression.name} expects a range vector`);
    const samples: EvalSample[] = [];
    for (const series of first.series) {
      const value = this.rangeFunction(expression.name, series);
      if (value === undefined) continue;
      const labels = cloneLabels(series.labels);
      delete labels.__name__;
      const unit = expression.name === "rate" && !isHistogram(value) && series.labels.le === undefined ? "per-second" : series.unit;
      samples.push({ labels, timestamp, value, unit, ids: series.ids, sources: series.sources, events: series.values.flatMap((item) => item.events) });
    }
    return { kind: "vector", samples };
  }

  private rangeFunction(name: string, series: EvalSeries): SampleValue | undefined {
    const values = series.values;
    if (!values.length) return undefined;
    if (name === "present_over_time") return 1;
    if (name === "last_over_time") return values.at(-1)!.value;
    if (name === "rate" || name === "increase") {
      if (values.length < 2) return undefined;
      if (isHistogram(values[0]!.value)) return this.histogramRate(series, name === "rate");
      const numeric = values.map((item) => ({ timestamp: item.timestamp, value: asNumber(item.value) }));
      return this.extrapolatedCounter(numeric, series.rangeStart, series.rangeEnd, name === "rate");
    }
    const numeric = values.map((item) => asNumber(item.value));
    if (name === "count_over_time") return numeric.length;
    if (name === "sum_over_time") return numeric.reduce((sum, value) => sum + value, 0);
    if (name === "avg_over_time") return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
    if (name === "min_over_time") return Math.min(...numeric);
    if (name === "max_over_time") return Math.max(...numeric);
    if (name === "changes") return numeric.slice(1).reduce((count, value, index) => count + (value !== numeric[index] ? 1 : 0), 0);
    if (name === "resets") return numeric.slice(1).reduce((count, value, index) => count + (value < numeric[index]! ? 1 : 0), 0);
    throw new QueryFailure("unsupported", `PromQL function ${name} is not supported`);
  }

  private extrapolatedCounter(samples: Array<{ timestamp: number; value: number }>, start: number, end: number, rate: boolean): number {
    const first = samples[0]!;
    const last = samples.at(-1)!;
    let change = last.value - first.value;
    let previous = first.value;
    for (const sample of samples.slice(1)) {
      if (sample.value < previous) change += previous;
      previous = sample.value;
    }
    const sampled = last.timestamp - first.timestamp;
    if (sampled <= 0) return 0;
    const average = sampled / (samples.length - 1);
    let toStart = first.timestamp - start;
    let toEnd = end - last.timestamp;
    if (change > 0 && first.value >= 0) toStart = Math.min(toStart, sampled * (first.value / change));
    const threshold = average * 1.1;
    const extrapolated = sampled
      + (toStart < threshold ? toStart : average / 2)
      + (toEnd < threshold ? toEnd : average / 2);
    const result = change * extrapolated / sampled;
    return rate ? result / (end - start) : result;
  }

  private histogramRate(series: EvalSeries, rate: boolean): HistogramValue {
    const values = series.values;
    const last = values.at(-1)!.value as HistogramValue;
    if (!isHistogram(last)) throw new QueryFailure("execution", "mixed float and histogram samples");
    if (!values.every((item) => isHistogram(item.value))) throw new QueryFailure("execution", "mixed float and histogram samples");
    const component = (read: (value: HistogramValue) => number): number => this.extrapolatedCounter(
      values.map((item) => ({ timestamp: item.timestamp, value: read(item.value as HistogramValue) })),
      series.rangeStart,
      series.rangeEnd,
      rate,
    );
    const buckets = last.buckets.map((bucket) => {
      const lower = bucketLower(bucket);
      const upper = bucketUpper(bucket);
      return { lower, upper, count: component((histogram) => histogram.buckets.find((candidate) => bucketLower(candidate) === lower && bucketUpper(candidate) === upper)?.count ?? 0) };
    });
    return {
      ...last,
      count: component((histogram) => histogram.count),
      sum: component((histogram) => histogram.sum),
      zeroCount: component((histogram) => histogram.zeroCount ?? 0),
      buckets,
    };
  }

  private predictLinear(args: EvalValue[], timestamp: number): EvalValue {
    const range = args[0]!;
    const horizon = args[1]!;
    if (range.kind !== "matrix" || horizon.kind !== "scalar") throw new QueryFailure("execution", "predict_linear expects a range vector and scalar horizon");
    const samples: EvalSample[] = [];
    for (const series of range.series) {
      if (series.values.length < 2) continue;
      const origin = series.values[0]!.timestamp;
      const points = series.values.map((item) => ({ x: item.timestamp - origin, y: asNumber(item.value) }));
      const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
      const slope = denominator === 0 ? Number.NaN : points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator;
      const predicted = meanY + slope * ((series.rangeEnd - origin) + horizon.value - meanX);
      const labels = cloneLabels(series.labels); delete labels.__name__;
      samples.push({ labels, timestamp, value: predicted, unit: series.unit, ids: series.ids, sources: series.sources, events: series.values.flatMap((item) => item.events) });
    }
    return { kind: "vector", samples };
  }

  private histogramQuantile(args: EvalValue[], timestamp: number): EvalValue {
    const q = args[0]!;
    const vector = args[1]!;
    if (q.kind !== "scalar" || vector.kind !== "vector") throw new QueryFailure("execution", "histogram_quantile expects a scalar and instant vector");
    const output: EvalSample[] = [];
    const classic = new Map<string, { labels: Labels; buckets: Array<{ upper: number; count: number }>; inputs: EvalSample[] }>();
    for (const sample of vector.samples) {
      if (isHistogram(sample.value)) {
        const labels = cloneLabels(sample.labels); delete labels.__name__;
        output.push({ ...sample, labels, value: this.nativeQuantile(q.value, sample.value), timestamp });
        continue;
      }
      if (sample.labels.le === undefined) continue;
      const labels = cloneLabels(sample.labels); delete labels.le; delete labels.__name__;
      const key = labelsKey(labels);
      const group = classic.get(key) ?? { labels, buckets: [], inputs: [] };
      group.buckets.push({ upper: sample.labels.le === "+Inf" ? Infinity : Number(sample.labels.le), count: sample.value });
      group.inputs.push(sample);
      classic.set(key, group);
    }
    for (const group of classic.values()) {
      const value = this.bucketQuantile(q.value, group.buckets);
      output.push({
        labels: group.labels, timestamp, value, unit: group.inputs[0]?.unit,
        ids: group.inputs.flatMap((item) => item.ids), sources: group.inputs.flatMap((item) => item.sources), events: group.inputs.flatMap((item) => item.events),
      });
    }
    return { kind: "vector", samples: output };
  }

  private bucketQuantile(q: number, buckets: Array<{ upper: number; count: number }>): number {
    if (q < 0) return -Infinity;
    if (q > 1) return Infinity;
    const ordered = [...buckets].sort((a, b) => a.upper - b.upper);
    if (ordered.length < 2 || ordered.at(-1)?.upper !== Infinity) return Number.NaN;
    for (let index = 1; index < ordered.length; index++) ordered[index]!.count = Math.max(ordered[index]!.count, ordered[index - 1]!.count);
    const total = ordered.at(-1)!.count;
    if (!total) return Number.NaN;
    const rank = q * total;
    let index = ordered.findIndex((bucket) => bucket.count >= rank);
    if (index === ordered.length - 1) return ordered[index - 1]!.upper;
    index = Math.max(0, index);
    const upper = ordered[index]!.upper;
    const lower = index === 0 ? Math.min(0, upper) : ordered[index - 1]!.upper;
    const before = index === 0 ? 0 : ordered[index - 1]!.count;
    const inBucket = ordered[index]!.count - before;
    return inBucket <= 0 ? upper : lower + (upper - lower) * (rank - before) / inBucket;
  }

  private nativeQuantile(q: number, histogram: HistogramValue): number {
    if (q < 0) return -Infinity;
    if (q > 1) return Infinity;
    const buckets = histogram.buckets.map((bucket) => ({ lower: bucketLower(bucket), upper: bucketUpper(bucket), count: bucket.count }));
    if ((histogram.zeroCount ?? 0) > 0) {
      const threshold = histogram.zeroThreshold ?? 0;
      buckets.push({ lower: -threshold, upper: threshold, count: histogram.zeroCount! });
    }
    buckets.sort((a, b) => a.upper - b.upper);
    const total = histogram.count || buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    if (!total || !buckets.length) return Number.NaN;
    const rank = q * total;
    let before = 0;
    const bucket = buckets.find((candidate) => {
      if (before + candidate.count >= rank) return true;
      before += candidate.count;
      return false;
    }) ?? buckets.at(-1)!;
    if (bucket.upper === Infinity) return bucket.lower;
    if (bucket.lower === -Infinity) return bucket.upper;
    const fraction = (rank - before) / Math.max(1, bucket.count);
    if (histogram.interpolation === "exponential" && bucket.lower > 0) return bucket.lower * (bucket.upper / bucket.lower) ** fraction;
    if (histogram.interpolation === "exponential" && bucket.upper < 0) return -((-bucket.lower) * ((-bucket.upper) / (-bucket.lower)) ** fraction);
    return bucket.lower + (bucket.upper - bucket.lower) * fraction;
  }

  private aggregate(expression: Extract<Expr, { kind: "aggregation" }>, timestamp: number): EvalValue {
    const input = this.run(expression.expression, timestamp);
    if (input.kind !== "vector") throw new QueryFailure("execution", `${expression.operator} expects an instant vector`);
    let k: number | undefined;
    if (expression.parameter) {
      const parameter = this.run(expression.parameter, timestamp);
      if (parameter.kind !== "scalar") throw new QueryFailure("execution", `${expression.operator} parameter must be scalar`);
      k = Math.max(0, Math.floor(parameter.value));
    }
    const groups = new Map<string, EvalSample[]>();
    for (const sample of input.samples) {
      const groupLabels = this.groupLabels(sample.labels, expression.grouping, expression.labels);
      const key = labelsKey(groupLabels);
      const group = groups.get(key) ?? [];
      group.push(sample);
      groups.set(key, group);
    }
    const samples: EvalSample[] = [];
    for (const group of groups.values()) {
      if (expression.operator === "topk" || expression.operator === "bottomk") {
        const direction = expression.operator === "topk" ? -1 : 1;
        samples.push(...[...group].sort((a, b) => direction * (asNumber(a.value) - asNumber(b.value))).slice(0, k));
        continue;
      }
      const labels = this.groupLabels(group[0]!.labels, expression.grouping, expression.labels);
      const value = this.aggregateValues(expression.operator, group.map((sample) => sample.value));
      samples.push({
        labels, timestamp, value, unit: expression.operator === "count" ? "count" : group[0]!.unit,
        ids: group.flatMap((sample) => sample.ids), sources: group.flatMap((sample) => sample.sources), events: group.flatMap((sample) => sample.events),
      });
    }
    return { kind: "vector", samples };
  }

  private aggregateValues(operator: string, values: SampleValue[]): SampleValue {
    if (operator === "count") return values.length;
    if (values.some(isHistogram)) {
      if (operator !== "sum" || !values.every(isHistogram)) throw new QueryFailure("execution", `${operator} cannot aggregate histogram values`);
      const histograms = values as HistogramValue[];
      const first = histograms[0]!;
      return {
        ...first,
        count: histograms.reduce((sum, value) => sum + value.count, 0),
        sum: histograms.reduce((sum, value) => sum + value.sum, 0),
        zeroCount: histograms.reduce((sum, value) => sum + (value.zeroCount ?? 0), 0),
        buckets: first.buckets.map((bucket) => ({
          lower: bucketLower(bucket), upper: bucketUpper(bucket),
          count: histograms.reduce((sum, value) => sum + (value.buckets.find((item) => bucketLower(item) === bucketLower(bucket) && bucketUpper(item) === bucketUpper(bucket))?.count ?? 0), 0),
        })),
      };
    }
    const numbers = values as number[];
    if (operator === "sum") return numbers.reduce((sum, value) => sum + value, 0);
    if (operator === "avg") return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    if (operator === "min") return Math.min(...numbers);
    if (operator === "max") return Math.max(...numbers);
    throw new QueryFailure("unsupported", `aggregation ${operator} is unsupported`);
  }

  private groupLabels(labels: Labels, grouping: "none" | "by" | "without", names: string[]): Labels {
    if (grouping === "by") return Object.fromEntries(names.filter((name) => labels[name] !== undefined).map((name) => [name, labels[name]!]));
    if (grouping === "without") return Object.fromEntries(Object.entries(labels).filter(([name]) => name !== "__name__" && !names.includes(name)));
    return {};
  }

  private unary(expression: Extract<Expr, { kind: "unary" }>, timestamp: number): EvalValue {
    const value = this.run(expression.expression, timestamp);
    if (expression.operator === "+") return value;
    if (value.kind === "scalar") return { ...value, value: -value.value };
    if (value.kind === "vector") return { kind: "vector", samples: value.samples.map((sample) => ({ ...sample, value: -asNumber(sample.value) })) };
    throw new QueryFailure("execution", "unary operators do not accept range vectors");
  }

  private binary(expression: Extract<Expr, { kind: "binary" }>, timestamp: number): EvalValue {
    const left = this.run(expression.left, timestamp);
    const right = this.run(expression.right, timestamp);
    if (left.kind === "matrix" || right.kind === "matrix") throw new QueryFailure("execution", "binary operators do not accept range vectors");
    if ((left.kind === "scalar" || right.kind === "scalar") && (expression.matching.mode !== "default" || expression.matching.cardinality !== "one-to-one")) {
      throw new QueryFailure("execution", "vector matching modifiers require two instant vectors");
    }
    if (left.kind === "scalar" && right.kind === "scalar") {
      if (setOperators.has(expression.operator)) throw new QueryFailure("execution", "set operators require vectors");
      if (comparisonOperators.has(expression.operator) && !expression.bool) throw new QueryFailure("execution", "scalar comparisons require the bool modifier");
      const value = comparisonOperators.has(expression.operator)
        ? Number(compare(expression.operator, left.value, right.value))
        : arithmetic(expression.operator, left.value, right.value);
      return { kind: "scalar", value, timestamp };
    }
    if (setOperators.has(expression.operator)) {
      if (left.kind !== "vector" || right.kind !== "vector") throw new QueryFailure("execution", "set operators require two vectors");
      return this.setBinary(expression, left.samples, right.samples);
    }
    if (left.kind === "scalar" && right.kind === "vector") return { kind: "vector", samples: this.scalarVector(expression, left.value, right.samples, true, timestamp) };
    if (left.kind === "vector" && right.kind === "scalar") return { kind: "vector", samples: this.scalarVector(expression, right.value, left.samples, false, timestamp) };
    return { kind: "vector", samples: this.vectorBinary(expression, (left as Extract<EvalValue, {kind:"vector"}>).samples, (right as Extract<EvalValue, {kind:"vector"}>).samples, timestamp) };
  }

  private scalarVector(expression: Extract<Expr, { kind: "binary" }>, scalar: number, vector: EvalSample[], scalarLeft: boolean, timestamp: number): EvalSample[] {
    const output: EvalSample[] = [];
    for (const sample of vector) {
      const left = scalarLeft ? scalar : asNumber(sample.value);
      const right = scalarLeft ? asNumber(sample.value) : scalar;
      if (comparisonOperators.has(expression.operator)) {
        const pass = compare(expression.operator, left, right);
        if (!pass && !expression.bool) continue;
        const labels = cloneLabels(sample.labels);
        if (expression.bool) delete labels.__name__;
        output.push({ ...sample, labels, timestamp, value: expression.bool ? Number(pass) : sample.value });
      } else {
        const labels = cloneLabels(sample.labels); delete labels.__name__;
        output.push({ ...sample, labels, timestamp, value: arithmetic(expression.operator, left, right) });
      }
    }
    return output;
  }

  private vectorBinary(expression: Extract<Expr, { kind: "binary" }>, left: EvalSample[], right: EvalSample[], timestamp: number): EvalSample[] {
    const leftGroups = this.matchGroups(left, expression.matching);
    const rightGroups = this.matchGroups(right, expression.matching);
    const output: EvalSample[] = [];
    for (const [key, leftGroup] of leftGroups) {
      const rightGroup = rightGroups.get(key);
      if (!rightGroup) continue;
      if (expression.matching.cardinality === "one-to-one" && (leftGroup.length > 1 || rightGroup.length > 1)) throw new QueryFailure("execution", "many-to-many matching is not allowed");
      if (expression.matching.cardinality === "many-to-one" && rightGroup.length > 1) throw new QueryFailure("execution", "group_left requires a unique right-hand match");
      if (expression.matching.cardinality === "one-to-many" && leftGroup.length > 1) throw new QueryFailure("execution", "group_right requires a unique left-hand match");
      for (const lhs of leftGroup) for (const rhs of rightGroup) {
        const leftValue = asNumber(lhs.value);
        const rightValue = asNumber(rhs.value);
        const pass = comparisonOperators.has(expression.operator) ? compare(expression.operator, leftValue, rightValue) : true;
        if (!pass && !expression.bool) continue;
        const labels = this.binaryLabels(lhs, rhs, expression);
        const value = comparisonOperators.has(expression.operator)
          ? (expression.bool ? Number(pass) : lhs.value)
          : arithmetic(expression.operator, leftValue, rightValue);
        output.push({ labels, timestamp, value, unit: arithmeticUnit(expression.operator, lhs.unit, rhs.unit), ids: [...lhs.ids, ...rhs.ids], sources: [...lhs.sources, ...rhs.sources], events: [...lhs.events, ...rhs.events] });
      }
      this.facts.lineage.operands.push({ operator: expression.operator, left: leftGroup.flatMap((sample) => sample.ids), right: rightGroup.flatMap((sample) => sample.ids) });
    }
    return output;
  }

  private binaryLabels(left: EvalSample, right: EvalSample, expression: Extract<Expr, { kind: "binary" }>): Labels {
    const base = cloneLabels(expression.matching.cardinality === "one-to-many" ? right.labels : left.labels);
    if (!comparisonOperators.has(expression.operator) || expression.bool || expression.matching.mode === "on") delete base.__name__;
    const one = expression.matching.cardinality === "many-to-one" ? right.labels : left.labels;
    for (const label of expression.matching.include) {
      if (one[label] !== undefined) base[label] = one[label]!;
      else delete base[label];
    }
    return base;
  }

  private setBinary(expression: Extract<Expr, { kind: "binary" }>, left: EvalSample[], right: EvalSample[]): EvalValue {
    const rightKeys = new Set(right.map((sample) => this.matchKey(sample.labels, expression.matching)));
    let samples = left.filter((sample) => expression.operator === "unless" ? !rightKeys.has(this.matchKey(sample.labels, expression.matching)) : rightKeys.has(this.matchKey(sample.labels, expression.matching)));
    if (expression.operator === "or") {
      const leftKeys = new Set(left.map((sample) => this.matchKey(sample.labels, expression.matching)));
      samples = [...left, ...right.filter((sample) => !leftKeys.has(this.matchKey(sample.labels, expression.matching)))];
    }
    return { kind: "vector", samples };
  }

  private matchGroups(samples: EvalSample[], matching: VectorMatching): Map<string, EvalSample[]> {
    const groups = new Map<string, EvalSample[]>();
    for (const sample of samples) {
      const key = this.matchKey(sample.labels, matching);
      const group = groups.get(key) ?? [];
      group.push(sample);
      groups.set(key, group);
    }
    return groups;
  }

  private matchKey(labels: Labels, matching: VectorMatching): string {
    const selected = Object.fromEntries(Object.entries(labels).filter(([name]) => {
      if (matching.mode === "on") return matching.labels.includes(name);
      return name !== "__name__" && (matching.mode !== "ignoring" || !matching.labels.includes(name));
    }));
    return labelsKey(selected);
  }

  private absentLabels(expression: Expr): Labels {
    if (expression.kind !== "selector") return {};
    const labels: Labels = {};
    for (const matcher of expression.matchers) if (matcher.operator === "=") labels[matcher.label] = matcher.value;
    return labels;
  }

  private generatedSample(labels: Labels, value: number, timestamp: number): EvalSample {
    return { labels, value, timestamp, ids: [], sources: [], events: [] };
  }

  private modifiedTime(timestamp: number, at?: number | string, offset = 0): number {
    const fixed = at === "start" ? (this.context.start ?? timestamp) : at === "end" ? (this.context.end ?? timestamp) : typeof at === "number" ? at : timestamp;
    return fixed - offset;
  }
}

function present(value: EvalValue, facts: QueryFacts): QueryValue {
  if (value.kind === "scalar") return { type: "scalar", timestamp: value.timestamp, value: value.value };
  if (value.kind === "vector") {
    facts.cost.returned = value.samples.length;
    for (const sample of value.samples) uniquePush(facts.lineage.events, ...sample.events);
    return { type: "instant-vector", series: value.samples.map(({ labels, timestamp, value: sampleValue, unit }) => ({ labels, timestamp, value: sampleValue, ...(unit ? { unit } : {}) })) };
  }
  facts.cost.returned = value.series.length;
  for (const series of value.series) for (const sample of series.values) uniquePush(facts.lineage.events, ...sample.events);
  return {
    type: "range-vector",
    series: value.series.map(({ labels, values, unit }) => ({ labels, values: values.map(({ timestamp, value: sampleValue }) => ({ timestamp, value: sampleValue })), ...(unit ? { unit } : {}) })),
  };
}

function rangeEvaluation(expression: Expr, evaluator: Evaluator, context: QueryContext, facts: QueryFacts): QueryValue {
  const start = context.start!;
  const end = context.end!;
  const step = context.step!;
  if (step <= 0 || end < start) throw new QueryFailure("execution", "range evaluation requires start <= end and a positive step");
  const groups = new Map<string, { labels: Labels; values: Array<{timestamp:number;value:SampleValue}>; unit?: string }>();
  for (let timestamp = start; timestamp <= end + 1e-9; timestamp += step) {
    const value = evaluator.run(expression, timestamp);
    if (value.kind === "matrix") throw new QueryFailure("execution", "range expressions cannot be returned directly by a range query");
    if (value.kind === "scalar") {
      const group = groups.get("") ?? { labels: {}, values: [] };
      group.values.push({ timestamp, value: value.value });
      groups.set("", group);
    } else for (const sample of value.samples) {
      const key = labelsKey(sample.labels);
      const group = groups.get(key) ?? { labels: sample.labels, values: [], ...(sample.unit ? { unit: sample.unit } : {}) };
      group.values.push({ timestamp, value: sample.value });
      uniquePush(facts.lineage.events, ...sample.events);
      groups.set(key, group);
    }
  }
  facts.cost.returned = groups.size;
  return { type: "range-vector", series: [...groups.values()] };
}

export function executePromql(query: string, context: QueryContext, facts: QueryFacts): QueryValue {
  const parser = new Parser(new Lexer(query).scan(), context);
  const expression = parser.parse();
  facts.semantic.push(...parser.semantic);
  for (const node of facts.semantic) if (node.kind === "metric-selector") {
    const types = new Set((context.metrics ?? []).filter((series) => (!node.metric || series.metric === node.metric) && matches({ __name__: series.metric, ...series.labels }, node.matchers)).map((series) => series.type).filter((type) => type !== undefined));
    if (types.size === 1) node.metricType = [...types][0];
  }
  const evaluator = new Evaluator(context, facts);
  if (context.step !== undefined) {
    if (context.start === undefined || context.end === undefined || context.step === undefined) throw new QueryFailure("execution", "start, end, and step must be supplied together");
    return rangeEvaluation(expression, evaluator, context, facts);
  }
  return present(evaluator.run(expression), facts);
}

function bucketLower(bucket: HistogramValue["buckets"][number]): number { return bucket.lower ?? bucket.lowerBound!; }
function bucketUpper(bucket: HistogramValue["buckets"][number]): number { return bucket.upper ?? bucket.upperBound!; }
