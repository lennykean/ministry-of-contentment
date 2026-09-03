import {
  arithmetic,
  arithmeticUnit,
  compare,
  labelsKey,
  matches,
  parseBytes,
  parseDuration,
  quantile,
  QueryFailure,
  uniquePush,
} from "./shared";
import type {
  Labels,
  LogRecord,
  LogStream,
  MatcherFact,
  QueryContext,
  QueryFacts,
  QueryValue,
  RecordsResult,
  ResultRecord,
  SemanticNode,
} from "./types";

type TokenKind = "id" | "number" | "string" | "duration" | "bytes" | "symbol" | "eof";
interface Token { kind: TokenKind; value: string; position: number }

type Stage =
  | { kind: "line-filter"; operator: "|=" | "!=" | "|~" | "!~" | "|>" | "!>"; value: string }
  | { kind: "parser"; parser: "json" | "logfmt" | "pattern" | "regexp"; value?: string }
  | { kind: "label-filter"; field: string; operator: string; value: string | number; valueType: "string" | "number" | "duration" | "bytes"; conversion?: "duration" | "bytes" }
  | { kind: "unwrap"; field: string; conversion: "number" | "duration" | "bytes" }
  | { kind: "line-format"; template: string }
  | { kind: "label-format"; assignments: Array<{ label: string; template: string }> }
  | { kind: "drop"; labels: string[] };

type Expr =
  | { kind: "number"; value: number }
  | { kind: "log"; matchers: MatcherFact[]; stages: Stage[]; range?: number; offset?: number }
  | { kind: "call"; name: string; args: Expr[]; grouping: "none" | "by" | "without"; labels: string[] }
  | { kind: "aggregation"; operator: string; expression: Expr; parameter?: Expr; grouping: "none" | "by" | "without"; labels: string[] }
  | { kind: "unary"; operator: "+" | "-"; expression: Expr }
  | { kind: "binary"; operator: string; left: Expr; right: Expr; bool: boolean; matching: VectorMatching };

interface VectorMatching {
  mode: "default" | "on" | "ignoring";
  labels: string[];
  cardinality: "one-to-one" | "many-to-one" | "one-to-many";
  include: string[];
}

interface WorkingRecord extends ResultRecord {
  sample?: number;
  sampleUnit?: string;
  source?: string;
  eventIds: string[];
}

interface WorkingStream {
  id: string;
  labels: Labels;
  records: WorkingRecord[];
  source?: string;
  rangeStart: number;
  rangeEnd: number;
}

interface MetricSample {
  labels: Labels;
  timestamp: number;
  value: number;
  ids: string[];
  sources: string[];
  events: string[];
  unit?: string;
}

type EvalValue =
  | { kind: "scalar"; value: number; timestamp: number }
  | { kind: "logs"; streams: WorkingStream[]; ranged: boolean }
  | { kind: "vector"; samples: MetricSample[] };

const aggregations = new Set(["sum", "avg", "min", "max", "count", "topk", "bottomk"]);
const rangeFunctions = new Set([
  "count_over_time", "rate", "bytes_over_time", "bytes_rate", "absent_over_time",
  "avg_over_time", "min_over_time", "max_over_time", "sum_over_time", "last_over_time", "quantile_over_time",
]);
const comparisonOperators = new Set(["==", "!=", ">", "<", ">=", "<="]);
const setOperators = new Set(["and", "or", "unless"]);

class Lexer {
  private index = 0;
  constructor(private readonly source: string) {}

  scan(): Token[] {
    const output: Token[] = [];
    while (this.index < this.source.length) {
      const position = this.index;
      const character = this.source[this.index]!;
      if (/\s/.test(character)) { this.index++; continue; }
      if (character === "#") {
        while (this.index < this.source.length && this.source[this.index] !== "\n") this.index++;
        continue;
      }
      if (character === '"' || character === "`") { output.push(this.string(character)); continue; }
      const two = this.source.slice(this.index, this.index + 2);
      if (["|=", "|~", "|>", "!>", "=~", "!~", "==", "!=", ">=", "<="].includes(two)) {
        this.index += 2; output.push({ kind: "symbol", value: two, position }); continue;
      }
      if (/[0-9.]/.test(character) && (character !== "." || /\d/.test(this.source[this.index + 1] ?? ""))) {
        output.push(this.numberWithUnit()); continue;
      }
      if (/[A-Za-z_]/.test(character)) {
        const match = /^[A-Za-z_][A-Za-z0-9_.:]*/.exec(this.source.slice(this.index))!;
        this.index += match[0].length;
        output.push({ kind: "id", value: match[0], position }); continue;
      }
      if ("{}[](),+-*/%^><=|".includes(character)) {
        this.index++; output.push({ kind: "symbol", value: character, position }); continue;
      }
      throw new QueryFailure("syntax", `unexpected character ${JSON.stringify(character)}`, position);
    }
    output.push({ kind: "eof", value: "", position: this.source.length });
    return output;
  }

  private string(quote: string): Token {
    const position = this.index++;
    let value = "";
    while (this.index < this.source.length) {
      const character = this.source[this.index++]!;
      if (character === quote) return { kind: "string", value, position };
      if (character !== "\\" || quote === "`") { value += character; continue; }
      if (this.index >= this.source.length) break;
      const escaped = this.source[this.index++]!;
      const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" };
      value += escapes[escaped] ?? escaped;
    }
    throw new QueryFailure("syntax", "unterminated string", position);
  }

  private numberWithUnit(): Token {
    const position = this.index;
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(this.source.slice(this.index));
    if (!number) throw new QueryFailure("syntax", "invalid number", position);
    this.index += number[0].length;
    const suffix = /^(?:[kmgtpe]?i?b|ms|[smhdwy])/i.exec(this.source.slice(this.index));
    if (!suffix) return { kind: "number", value: number[0], position };
    this.index += suffix[0].length;
    let value = number[0] + suffix[0];
    if (/^(?:ms|[smhdwy])$/.test(suffix[0])) {
      while (true) {
        const part = /^\d+(?:\.\d+)?(?:ms|[smhdwy])/.exec(this.source.slice(this.index));
        if (!part) break;
        value += part[0]; this.index += part[0].length;
      }
      return { kind: "duration", value, position };
    }
    return { kind: "bytes", value, position };
  }
}

class Parser {
  private cursor = 0;
  readonly semantic: SemanticNode[] = [];
  constructor(private readonly tokens: Token[]) {}

  parse(): Expr {
    if (this.peek().kind === "eof") throw new QueryFailure("syntax", "query is empty", 0);
    const expression = this.expression(0);
    const token = this.peek();
    if (token.kind !== "eof") throw new QueryFailure("syntax", `unexpected token ${token.value}`, token.position);
    return expression;
  }

  private expression(minimum: number): Expr {
    let left = this.unary();
    while (true) {
      const operator = this.binaryOperator();
      const precedence = operator === undefined ? -1 : this.precedence(operator);
      if (operator === undefined || precedence < minimum) break;
      this.cursor++;
      const modifiers = this.modifiers(operator);
      const right = this.expression(precedence + (operator === "^" ? 0 : 1));
      left = { kind: "binary", operator, left, right, ...modifiers };
      this.semantic.push({ kind: "binary", operator, bool: modifiers.bool });
      if (setOperators.has(operator)) this.semantic.push({ kind: "set-operator", operator: operator as "and" | "or" | "unless" });
      if (modifiers.matching.mode !== "default" || modifiers.matching.cardinality !== "one-to-one") {
        this.semantic.push({ kind: "vector-match", matching: modifiers.matching.mode, labels: modifiers.matching.labels, cardinality: modifiers.matching.cardinality, include: modifiers.matching.include });
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
    return this.primary();
  }

  private primary(): Expr {
    const token = this.peek();
    if (token.kind === "number") { this.cursor++; return { kind: "number", value: Number(token.value) }; }
    if (this.takeIf("(")) { const expression = this.expression(0); this.expect(")"); return expression; }
    if (this.at("{")) return this.logExpression();
    if (token.kind !== "id") throw new QueryFailure("syntax", `expected expression, got ${token.value || "end of query"}`, token.position);
    this.cursor++;
    if (aggregations.has(token.value)) return this.aggregation(token.value);
    if (!this.at("(")) throw new QueryFailure("syntax", `unexpected identifier ${token.value}`, token.position);
    return this.call(token.value, token.position);
  }

  private logExpression(): Expr {
    this.expect("{");
    const matchers: MatcherFact[] = [];
    if (!this.takeIf("}")) {
      do {
        const label = this.expectKind("id");
        const operator = this.take();
        if (!["=", "!=", "=~", "!~"].includes(operator.value)) throw new QueryFailure("syntax", "expected stream label matcher", operator.position);
        const value = this.expectKind("string");
        if (operator.value === "=~" || operator.value === "!~") {
          try { new RegExp(`^(?:${value.value})$`); }
          catch { throw new QueryFailure("syntax", `invalid regular expression ${JSON.stringify(value.value)}`, value.position); }
        }
        matchers.push({ label: label.value, operator: operator.value as MatcherFact["operator"], value: value.value });
      } while (this.takeIf(","));
      this.expect("}");
    }
    if (!matchers.length || matches({}, matchers)) throw new QueryFailure("syntax", "stream selector must contain a matcher that does not match an empty label set");
    this.semantic.push({ kind: "stream-selector", matchers: [...matchers] });
    const stages: Stage[] = [];
    while (true) {
      const token = this.peek();
      if (["|=", "!=", "|~", "!~", "|>", "!>"].includes(token.value)) {
        this.cursor++;
        const value = this.expectKind("string").value;
        const operator = token.value as Extract<Stage, {kind:"line-filter"}>["operator"];
        stages.push({ kind: "line-filter", operator, value });
        this.semantic.push({ kind: "line-filter", operator });
        continue;
      }
      if (!this.takeIf("|")) break;
      const name = this.expectKind("id");
      if (name.value === "json" || name.value === "logfmt") {
        if (this.at("(") || this.peek().kind === "string") throw new QueryFailure("unsupported", `${name.value} parser parameters are not supported`, name.position);
        stages.push({ kind: "parser", parser: name.value });
        this.semantic.push({ kind: "parser", parser: name.value });
      } else if (name.value === "pattern" || name.value === "regexp") {
        const value = this.expectKind("string").value;
        stages.push({ kind: "parser", parser: name.value, value });
        this.semantic.push({ kind: "parser", parser: name.value });
      } else if (name.value === "unwrap") {
        let conversion: "number" | "duration" | "bytes" = "number";
        let field: string;
        if ((this.atId("duration") || this.atId("duration_seconds") || this.atId("bytes")) && this.peek(1).value === "(") {
          const converter = this.take().value;
          conversion = converter === "bytes" ? "bytes" : "duration";
          this.expect("("); field = this.expectKind("id").value; this.expect(")");
        } else field = this.expectKind("id").value;
        stages.push({ kind: "unwrap", field, conversion });
        this.semantic.push({ kind: "unwrap", field, conversion });
      } else if (name.value === "line_format") {
        stages.push({ kind: "line-format", template: this.expectKind("string").value });
        this.semantic.push({ kind: "formatter", formatter: "line_format" });
      } else if (name.value === "label_format") {
        const assignments: Array<{label:string;template:string}> = [];
        do {
          const label = this.expectKind("id").value;
          this.expect("=");
          assignments.push({ label, template: this.expectKind("string").value });
        } while (this.takeIf(","));
        stages.push({ kind: "label-format", assignments });
        this.semantic.push({ kind: "formatter", formatter: "label_format" });
      } else if (name.value === "drop") {
        const labels: string[] = [];
        do labels.push(this.expectKind("id").value); while (this.takeIf(","));
        stages.push({ kind: "drop", labels });
        this.semantic.push({ kind: "drop", labels: [...labels] });
      } else if (["decolorize", "unpack", "keep", "label_replace"].includes(name.value)) {
        throw new QueryFailure("unsupported", `LogQL pipeline stage ${name.value} is not supported`, name.position);
      } else {
        let field = name.value;
        let conversion: "duration" | "bytes" | undefined;
        if ((name.value === "duration" || name.value === "duration_seconds" || name.value === "bytes") && this.takeIf("(")) {
          conversion = name.value === "bytes" ? "bytes" : "duration";
          field = this.expectKind("id").value;
          this.expect(")");
        }
        const operator = this.take();
        if (!["=", "==", "!=", "=~", "!~", ">", "<", ">=", "<="].includes(operator.value)) {
          throw new QueryFailure("unsupported", `LogQL pipeline stage ${name.value} is not supported`, name.position);
        }
        const value = this.take();
        let parsed: string | number;
        let valueType: Extract<Stage, {kind:"label-filter"}>["valueType"];
        if (value.kind === "string") { parsed = value.value; valueType = "string"; }
        else if (value.kind === "number") { parsed = Number(value.value); valueType = "number"; }
        else if (value.kind === "duration") { parsed = parseDuration(value.value); valueType = "duration"; }
        else if (value.kind === "bytes") { parsed = parseBytes(value.value); valueType = "bytes"; }
        else throw new QueryFailure("syntax", "label filter expects a string, number, duration, or byte value", value.position);
        stages.push({ kind: "label-filter", field, operator: operator.value, value: parsed, valueType, ...(conversion ? { conversion } : {}) });
        this.semantic.push({ kind: "label-filter", label: field, operator: operator.value, valueType });
      }
    }
    let range: number | undefined;
    if (this.takeIf("[")) { range = this.duration(); this.expect("]"); this.semantic.push({ kind: "range-selector", seconds: range }); }
    let offset: number | undefined;
    if (this.takeIfId("offset")) { offset = (this.takeIf("-") ? -1 : 1) * this.duration(); this.semantic.push({ kind: "offset", seconds: offset }); }
    const filter = stages.findIndex((stage) => stage.kind === "line-filter");
    const parser = stages.findIndex((stage) => stage.kind === "parser");
    const expected = filter >= 0 && parser >= 0 ? (filter < parser ? "filter-before-parser" : "parser-before-filter") : undefined;
    this.semantic.push({ kind: "pipeline-order", stages: stages.map((stage) => stage.kind), ...(expected ? { expected } : {}) });
    return { kind: "log", matchers, stages, ...(range === undefined ? {} : { range }), ...(offset === undefined ? {} : { offset }) };
  }

  private call(name: string, position: number): Expr {
    if (!rangeFunctions.has(name)) throw new QueryFailure("unsupported", `LogQL function ${name} is not supported`, position);
    this.expect("(");
    const args: Expr[] = [];
    if (!this.takeIf(")")) {
      do args.push(this.expression(0)); while (this.takeIf(","));
      this.expect(")");
    }
    const expected = name === "quantile_over_time" ? 2 : 1;
    if (args.length !== expected) throw new QueryFailure("syntax", `${name} expects ${expected} argument${expected === 1 ? "" : "s"}`, position);
    const input = args[name === "quantile_over_time" ? 1 : 0];
    const inputKind = input?.kind === "log" && input.stages.some((stage) => stage.kind === "unwrap") ? "unwrapped" : "records";
    let grouping: "none" | "by" | "without" = "none";
    let labels: string[] = [];
    if (this.atId("by") || this.atId("without")) ({ grouping, labels } = this.grouping());
    this.semantic.push({ kind: "range-function", name, inputKind });
    return { kind: "call", name, args, grouping, labels };
  }

  private aggregation(operator: string): Expr {
    let grouping: "none" | "by" | "without" = "none";
    let labels: string[] = [];
    if (this.atId("by") || this.atId("without")) ({ grouping, labels } = this.grouping());
    this.expect("(");
    let parameter: Expr | undefined;
    let expression = this.expression(0);
    if (this.takeIf(",")) { parameter = expression; expression = this.expression(0); }
    this.expect(")");
    if (grouping === "none" && (this.atId("by") || this.atId("without"))) ({ grouping, labels } = this.grouping());
    if ((operator === "topk" || operator === "bottomk") !== (parameter !== undefined)) throw new QueryFailure("syntax", `${operator} has the wrong number of parameters`);
    this.semantic.push({ kind: "aggregation", operator, grouping, labels: [...labels] });
    return { kind: "aggregation", operator, expression, ...(parameter ? { parameter } : {}), grouping, labels };
  }

  private grouping(): {grouping:"by"|"without";labels:string[]} {
    const grouping = this.take().value as "by" | "without";
    const labels = this.labelList();
    return { grouping, labels };
  }

  private modifiers(operator: string): {bool:boolean;matching:VectorMatching} {
    let bool = false;
    const matching: VectorMatching = { mode: "default", labels: [], cardinality: "one-to-one", include: [] };
    if (this.takeIfId("bool")) {
      if (!comparisonOperators.has(operator)) throw new QueryFailure("syntax", "bool is valid only on comparisons");
      bool = true;
    }
    if (this.atId("on") || this.atId("ignoring")) { matching.mode = this.take().value as "on"|"ignoring"; matching.labels = this.labelList(); }
    if (this.atId("group_left") || this.atId("group_right")) {
      matching.cardinality = this.take().value === "group_left" ? "many-to-one" : "one-to-many";
      if (this.at("(")) matching.include = this.labelList();
    }
    if (setOperators.has(operator) && matching.cardinality !== "one-to-one") throw new QueryFailure("syntax", "group modifiers are not valid on set operators");
    return { bool, matching };
  }

  private labelList(): string[] {
    this.expect("("); const labels: string[] = [];
    if (!this.takeIf(")")) { do labels.push(this.expectKind("id").value); while (this.takeIf(",")); this.expect(")"); }
    return labels;
  }
  private duration(): number { const token = this.take(); if (token.kind !== "duration") throw new QueryFailure("syntax", "expected duration", token.position); return parseDuration(token.value); }
  private binaryOperator(): string | undefined {
    const token = this.peek();
    if (["+", "-", "*", "/", "%", "^", "==", "!=", ">", "<", ">=", "<="].includes(token.value)) return token.value;
    if (token.kind === "id" && setOperators.has(token.value)) return token.value;
    return undefined;
  }
  private precedence(operator: string): number {
    if (operator === "or") return 1; if (operator === "and" || operator === "unless") return 2;
    if (comparisonOperators.has(operator)) return 3; if (operator === "+" || operator === "-") return 4;
    if (["*", "/", "%"].includes(operator)) return 5; return 6;
  }
  private expect(value: string): Token { const token = this.take(); if (token.value !== value) throw new QueryFailure("syntax", `expected ${value}, got ${token.value || "end of query"}`, token.position); return token; }
  private expectKind(kind: TokenKind): Token { const token = this.take(); if (token.kind !== kind) throw new QueryFailure("syntax", `expected ${kind}, got ${token.value || "end of query"}`, token.position); return token; }
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
      case "log": return this.logs(expression, timestamp);
      case "call": return this.call(expression, timestamp);
      case "aggregation": return this.aggregate(expression, timestamp);
      case "unary": return this.unary(expression, timestamp);
      case "binary": return this.binary(expression, timestamp);
    }
  }

  private logs(expression: Extract<Expr,{kind:"log"}>, timestamp: number): EvalValue {
    const end = timestamp - (expression.offset ?? 0);
    const rangeStart = expression.range === undefined ? (this.context.start ?? Number.NEGATIVE_INFINITY) : end - expression.range;
    const rangeEnd = expression.range === undefined ? (this.context.end ?? end + Number.EPSILON) : end;
    const ranged = expression.range !== undefined;
    const streams: WorkingStream[] = [];
    for (const stream of this.context.logs ?? []) {
      if (!matches(stream.labels, expression.matchers)) continue;
      this.facts.cost.streamsScanned++;
      const id = stream.id ?? `{${labelsKey(stream.labels)}}`;
      uniquePush(this.facts.lineage.logStreams, id);
      uniquePush(this.facts.lineage.sources, stream.source);
      let records = stream.records
        .filter((record) => ranged
          ? record.timestamp > rangeStart && record.timestamp <= rangeEnd
          : record.timestamp >= rangeStart && (this.context.end === undefined ? record.timestamp <= end : record.timestamp < rangeEnd))
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((record) => this.workingRecord(record, stream, id));
      this.facts.cost.recordsScanned += records.length;
      this.facts.cost.scannedBytes += records.reduce((sum, record) => sum + new TextEncoder().encode(record.line).length, 0);
      for (const stage of expression.stages) records = this.stage(records, stage);
      const groups = new Map<string, WorkingRecord[]>();
      for (const record of records) {
        const key = labelsKey(record.labels);
        const group = groups.get(key) ?? [];
        group.push(record);
        groups.set(key, group);
      }
      for (const [key, group] of groups) streams.push({ id: key === labelsKey(stream.labels) ? id : `${id}:${key}`, labels: { ...group[0]!.labels }, records: group, source: stream.source, rangeStart, rangeEnd });
    }
    return { kind: "logs", streams, ranged };
  }

  private workingRecord(record: LogRecord, stream: LogStream, streamId: string): WorkingRecord {
    const fields: Record<string,string|number> = { ...stream.labels, ...(record.metadata ?? {}) };
    const origins: ResultRecord["fieldOrigins"] = {};
    for (const label of Object.keys(stream.labels)) this.origin(label, "indexed-label", origins);
    for (const field of Object.keys(record.metadata ?? {})) this.origin(field, "structured-metadata", origins);
    return {
      ...record, labels: { ...stream.labels }, fields, fieldOrigins: origins, displayLine: record.line,
      streamId, source: stream.source, eventIds: [...(record.eventIds ?? [])],
    };
  }

  private stage(records: WorkingRecord[], stage: Stage): WorkingRecord[] {
    if (stage.kind === "line-filter") return records.filter((record) => this.lineFilter(record.displayLine, stage));
    if (stage.kind === "parser") return records.map((record) => this.parseRecord(record, stage));
    if (stage.kind === "label-filter") return records.filter((record) => {
      const keep = this.labelFilter(record, stage);
      if (!keep && stage.field === "__error__" && record.error) this.handleErrors(record.id);
      return keep;
    });
    if (stage.kind === "unwrap") return records.map((record) => this.unwrap(record, stage));
    if (stage.kind === "line-format") return records.map((record) => ({ ...record, displayLine: this.template(stage.template, record) }));
    if (stage.kind === "label-format") return records.map((record) => {
      const labels = { ...record.labels };
      for (const assignment of stage.assignments) labels[assignment.label] = this.template(assignment.template, record);
      return { ...record, labels };
    });
    return records.map((record) => {
      const next = { ...record, labels: { ...record.labels }, fields: { ...record.fields }, fieldOrigins: { ...record.fieldOrigins } };
      for (const label of stage.labels) {
        delete next.labels[label]; delete next.fields[label]; delete next.fieldOrigins[label];
        if (label === "__error__") { this.handleErrors(record.id); delete next.error; }
      }
      return next;
    });
  }

  private lineFilter(line: string, stage: Extract<Stage,{kind:"line-filter"}>): boolean {
    if (stage.operator === "|=" || stage.operator === "!=") return stage.operator === "|=" ? line.includes(stage.value) : !line.includes(stage.value);
    let expression: RegExp;
    try { expression = stage.operator === "|>" || stage.operator === "!>" ? this.patternRegex(stage.value, false) : new RegExp(stage.value); }
    catch { throw new QueryFailure("execution", `invalid regular expression ${JSON.stringify(stage.value)}`); }
    const matched = expression.test(line);
    return stage.operator === "|~" || stage.operator === "|>" ? matched : !matched;
  }

  private parseRecord(record: WorkingRecord, stage: Extract<Stage,{kind:"parser"}>): WorkingRecord {
    const next = this.copyRecord(record);
    try {
      let values: Record<string, unknown> = {};
      if (stage.parser === "json") {
        const parsed: unknown = JSON.parse(record.displayLine);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON object required");
        values = parsed as Record<string, unknown>;
      } else if (stage.parser === "logfmt") values = this.logfmt(record.displayLine);
      else {
        const expression = stage.parser === "pattern" ? this.patternRegex(stage.value ?? "", true) : this.namedRegex(stage.value ?? "");
        const match = expression.exec(record.displayLine);
        if (!match) throw new Error(`${stage.parser} did not match`);
        values = match.groups ?? {};
      }
      for (const [name, value] of Object.entries(values)) {
        if (value === null || typeof value === "object") continue;
        const target = next.fields[name] === undefined ? name : `${name}_extracted`;
        next.fields[target] = typeof value === "number" ? value : String(value);
        this.origin(target, "extracted-field", next.fieldOrigins);
      }
    } catch (error) {
      this.recordError(next, stage.parser, `${stage.parser}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return next;
  }

  private labelFilter(record: WorkingRecord, stage: Extract<Stage,{kind:"label-filter"}>): boolean {
    const raw = stage.field === "__error__" ? (record.error ?? "") : (record.fields[stage.field] ?? record.labels[stage.field] ?? "");
    let left: string | number = raw;
    try {
      if (stage.valueType === "number") left = Number(raw);
      if (stage.conversion === "duration" || stage.valueType === "duration") left = parseDurationFlexible(String(raw));
      if (stage.conversion === "bytes" || stage.valueType === "bytes") left = parseBytes(String(raw));
      if (typeof left === "number" && !Number.isFinite(left)) throw new Error("not a finite number");
    } catch (error) {
      this.recordError(record, "label-filter", `LabelFilterErr: ${error instanceof Error ? error.message : String(error)}`);
      return true;
    }
    if (stage.operator === "=~" || stage.operator === "!~") {
      let matched: boolean;
      try { matched = new RegExp(`^(?:${String(stage.value)})$`).test(String(left)); }
      catch { throw new QueryFailure("execution", `invalid regular expression ${JSON.stringify(stage.value)}`); }
      return stage.operator === "=~" ? matched : !matched;
    }
    if (typeof left === "number" && typeof stage.value === "number") return compare(stage.operator === "=" ? "==" : stage.operator, left, stage.value);
    if (!["=", "==", "!="].includes(stage.operator)) throw new QueryFailure("execution", `operator ${stage.operator} requires a numeric label filter`);
    return stage.operator === "!=" ? String(left) !== String(stage.value) : String(left) === String(stage.value);
  }

  private unwrap(record: WorkingRecord, stage: Extract<Stage,{kind:"unwrap"}>): WorkingRecord {
    const next = this.copyRecord(record);
    const raw = next.fields[stage.field] ?? next.labels[stage.field];
    try {
      if (raw === undefined) throw new Error(`field ${stage.field} is missing`);
      const sample = stage.conversion === "duration" ? parseDurationFlexible(String(raw)) : stage.conversion === "bytes" ? parseBytes(String(raw)) : Number(raw);
      if (!Number.isFinite(sample)) throw new Error(`${JSON.stringify(raw)} is not numeric`);
      next.sample = sample;
      next.sampleUnit = stage.conversion === "duration" ? "seconds" : stage.conversion === "bytes" ? "bytes" : undefined;
    } catch (error) {
      delete next.sample;
      this.recordError(next, "unwrap", `SampleExtractionErr: ${error instanceof Error ? error.message : String(error)}`);
    }
    return next;
  }

  private call(expression: Extract<Expr,{kind:"call"}>, timestamp: number): EvalValue {
    const args = expression.args.map((argument) => this.run(argument, timestamp));
    const logs = expression.name === "quantile_over_time" ? args[1] : args[0];
    const parameter = expression.name === "quantile_over_time" ? args[0] : undefined;
    if (!logs || logs.kind !== "logs" || !logs.ranged) throw new QueryFailure("execution", `${expression.name} expects a log range expression`);
    if (parameter && parameter.kind !== "scalar") throw new QueryFailure("execution", "quantile_over_time expects a scalar quantile");
    for (const stream of logs.streams) for (const record of stream.records) {
      if (record.error) throw new QueryFailure("execution", `pipeline error reached metric operation: ${record.error}`);
    }
    if (expression.name === "absent_over_time") {
      const count = logs.streams.reduce((sum, stream) => sum + stream.records.length, 0);
      return { kind: "vector", samples: count ? [] : [{ labels: {}, timestamp, value: 1, ids: [], sources: [], events: [] }] };
    }
    const samples: MetricSample[] = [];
    for (const stream of this.groupLogStreams(logs.streams, expression.grouping, expression.labels)) {
      const records = stream.records;
      if (!records.length) continue;
      let values: number[];
      let unit: string | undefined;
      if (expression.name === "count_over_time" || expression.name === "rate") { values = records.map(() => 1); unit = expression.name === "rate" ? "per-second" : undefined; }
      else if (expression.name === "bytes_over_time" || expression.name === "bytes_rate") { values = records.map((record) => new TextEncoder().encode(record.line).length); unit = expression.name === "bytes_rate" ? "bytes-per-second" : "bytes"; }
      else { values = records.map((record) => {
        if (record.sample === undefined) throw new QueryFailure("execution", `${expression.name} requires unwrap before the range selector`);
        return record.sample;
      }); unit = records.find((record) => record.sampleUnit)?.sampleUnit; }
      let value: number;
      if (expression.name === "count_over_time" || expression.name === "bytes_over_time") value = values.reduce((sum, item) => sum + item, 0);
      else if (expression.name === "rate" || expression.name === "bytes_rate") value = values.reduce((sum, item) => sum + item, 0) / (stream.rangeEnd - stream.rangeStart);
      else if (expression.name === "sum_over_time") value = values.reduce((sum, item) => sum + item, 0);
      else if (expression.name === "avg_over_time") value = values.reduce((sum, item) => sum + item, 0) / values.length;
      else if (expression.name === "min_over_time") value = Math.min(...values);
      else if (expression.name === "max_over_time") value = Math.max(...values);
      else if (expression.name === "last_over_time") value = values.at(-1)!;
      else value = quantile((parameter as Extract<EvalValue,{kind:"scalar"}>).value, values);
      samples.push({
        labels: { ...records[0]!.labels }, timestamp, value, ids: records.map((record) => record.id),
        sources: [...new Set(records.map((record) => record.source).filter((source): source is string => source !== undefined))], events: records.flatMap((record) => record.eventIds), ...(unit ? { unit } : {}),
      });
    }
    return { kind: "vector", samples };
  }

  private groupLogStreams(streams: WorkingStream[], grouping: "none" | "by" | "without", names: string[]): WorkingStream[] {
    if (grouping === "none") return streams;
    const groups = new Map<string, WorkingStream>();
    for (const stream of streams) {
      const labels = this.groupLabels(stream.labels, grouping, names);
      const key = labelsKey(labels);
      const group = groups.get(key) ?? { id: key, labels, records: [], rangeStart: stream.rangeStart, rangeEnd: stream.rangeEnd };
      group.records.push(...stream.records);
      group.records.sort((left, right) => left.timestamp - right.timestamp);
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  private aggregate(expression: Extract<Expr,{kind:"aggregation"}>, timestamp: number): EvalValue {
    const input = this.run(expression.expression, timestamp);
    if (input.kind !== "vector") throw new QueryFailure("execution", `${expression.operator} expects a metric vector`);
    let k: number | undefined;
    if (expression.parameter) {
      const parameter = this.run(expression.parameter, timestamp);
      if (parameter.kind !== "scalar") throw new QueryFailure("execution", `${expression.operator} parameter must be scalar`);
      k = Math.max(0, Math.floor(parameter.value));
    }
    const groups = new Map<string,MetricSample[]>();
    for (const sample of input.samples) {
      const labels = this.groupLabels(sample.labels, expression.grouping, expression.labels);
      const key = labelsKey(labels); const group = groups.get(key) ?? []; group.push(sample); groups.set(key, group);
    }
    const samples: MetricSample[] = [];
    for (const group of groups.values()) {
      if (expression.operator === "topk" || expression.operator === "bottomk") {
        const direction = expression.operator === "topk" ? -1 : 1;
        samples.push(...[...group].sort((a,b) => direction * (a.value - b.value)).slice(0,k)); continue;
      }
      const values = group.map((sample) => sample.value);
      const value = expression.operator === "sum" ? values.reduce((a,b)=>a+b,0)
        : expression.operator === "avg" ? values.reduce((a,b)=>a+b,0)/values.length
        : expression.operator === "min" ? Math.min(...values)
        : expression.operator === "max" ? Math.max(...values) : values.length;
      samples.push({
        labels: this.groupLabels(group[0]!.labels, expression.grouping, expression.labels), timestamp, value,
        ids: group.flatMap((sample)=>sample.ids), sources: group.flatMap((sample)=>sample.sources), events: group.flatMap((sample)=>sample.events), unit: expression.operator === "count" ? "count" : group[0]!.unit,
      });
    }
    return { kind: "vector", samples };
  }

  private unary(expression: Extract<Expr,{kind:"unary"}>, timestamp: number): EvalValue {
    const value = this.run(expression.expression, timestamp);
    if (expression.operator === "+") return value;
    if (value.kind === "scalar") return { ...value, value: -value.value };
    if (value.kind === "vector") return { kind: "vector", samples: value.samples.map((sample) => ({...sample,value:-sample.value})) };
    throw new QueryFailure("execution", "unary operator cannot be applied to records");
  }

  private binary(expression: Extract<Expr,{kind:"binary"}>, timestamp: number): EvalValue {
    const left = this.run(expression.left,timestamp); const right = this.run(expression.right,timestamp);
    if (left.kind === "logs" || right.kind === "logs") throw new QueryFailure("execution", "binary operators require metric values");
    if ((left.kind === "scalar" || right.kind === "scalar") && (expression.matching.mode !== "default" || expression.matching.cardinality !== "one-to-one")) throw new QueryFailure("execution", "vector matching modifiers require two instant vectors");
    if (left.kind === "scalar" && right.kind === "scalar") {
      if (setOperators.has(expression.operator)) throw new QueryFailure("execution", "set operators require vectors");
      return { kind:"scalar",timestamp,value:comparisonOperators.has(expression.operator)?Number(compare(expression.operator,left.value,right.value)):arithmetic(expression.operator,left.value,right.value) };
    }
    if (setOperators.has(expression.operator)) {
      if (left.kind!=="vector"||right.kind!=="vector") throw new QueryFailure("execution","set operators require vectors");
      const rightKeys=new Set(right.samples.map((sample)=>this.matchKey(sample.labels,expression.matching)));
      let samples=left.samples.filter((sample)=>expression.operator==="unless"?!rightKeys.has(this.matchKey(sample.labels,expression.matching)):rightKeys.has(this.matchKey(sample.labels,expression.matching)));
      if(expression.operator==="or"){const leftKeys=new Set(left.samples.map((sample)=>this.matchKey(sample.labels,expression.matching)));samples=[...left.samples,...right.samples.filter((sample)=>!leftKeys.has(this.matchKey(sample.labels,expression.matching)))];}
      return {kind:"vector",samples};
    }
    if(left.kind==="scalar"&&right.kind==="vector")return{kind:"vector",samples:this.scalarVector(expression,left.value,right.samples,true,timestamp)};
    if(left.kind==="vector"&&right.kind==="scalar")return{kind:"vector",samples:this.scalarVector(expression,right.value,left.samples,false,timestamp)};
    return{kind:"vector",samples:this.vectorBinary(expression,(left as Extract<EvalValue,{kind:"vector"}>).samples,(right as Extract<EvalValue,{kind:"vector"}>).samples,timestamp)};
  }

  private scalarVector(expression:Extract<Expr,{kind:"binary"}>,scalar:number,vector:MetricSample[],scalarLeft:boolean,timestamp:number):MetricSample[]{
    return vector.flatMap((sample)=>{const left=scalarLeft?scalar:sample.value;const right=scalarLeft?sample.value:scalar;
      if(comparisonOperators.has(expression.operator)){const pass=compare(expression.operator,left,right);if(!pass&&!expression.bool)return[];return[{...sample,timestamp,value:expression.bool?Number(pass):sample.value}];}
      return[{...sample,timestamp,value:arithmetic(expression.operator,left,right)}];});
  }

  private vectorBinary(expression:Extract<Expr,{kind:"binary"}>,left:MetricSample[],right:MetricSample[],timestamp:number):MetricSample[]{
    const lhs=this.groups(left,expression.matching);const rhs=this.groups(right,expression.matching);const output:MetricSample[]=[];
    for(const[key,leftGroup]of lhs){const rightGroup=rhs.get(key);if(!rightGroup)continue;
      if(expression.matching.cardinality==="one-to-one"&&(leftGroup.length>1||rightGroup.length>1))throw new QueryFailure("execution","many-to-many matching is not allowed");
      if(expression.matching.cardinality==="many-to-one"&&rightGroup.length>1)throw new QueryFailure("execution","group_left requires unique right matches");
      if(expression.matching.cardinality==="one-to-many"&&leftGroup.length>1)throw new QueryFailure("execution","group_right requires unique left matches");
      for(const a of leftGroup)for(const b of rightGroup){const pass=comparisonOperators.has(expression.operator)?compare(expression.operator,a.value,b.value):true;if(!pass&&!expression.bool)continue;
        const base={...(expression.matching.cardinality==="one-to-many"?b.labels:a.labels)};
        const one=expression.matching.cardinality==="many-to-one"?b.labels:a.labels;
        for(const label of expression.matching.include)if(one[label]!==undefined)base[label]=one[label]!;
        output.push({labels:base,timestamp,value:comparisonOperators.has(expression.operator)?(expression.bool?Number(pass):a.value):arithmetic(expression.operator,a.value,b.value),ids:[...a.ids,...b.ids],sources:[...a.sources,...b.sources],events:[...a.events,...b.events],unit:arithmeticUnit(expression.operator,a.unit,b.unit)});}
      this.facts.lineage.operands.push({operator:expression.operator,left:leftGroup.flatMap((sample)=>sample.ids),right:rightGroup.flatMap((sample)=>sample.ids)});
    }return output;
  }

  private groups(samples:MetricSample[],matching:VectorMatching):Map<string,MetricSample[]>{const groups=new Map<string,MetricSample[]>();for(const sample of samples){const key=this.matchKey(sample.labels,matching);const group=groups.get(key)??[];group.push(sample);groups.set(key,group);}return groups;}
  private matchKey(labels:Labels,matching:VectorMatching):string{return labelsKey(Object.fromEntries(Object.entries(labels).filter(([name])=>matching.mode==="on"?matching.labels.includes(name):matching.mode!=="ignoring"||!matching.labels.includes(name))));}
  private groupLabels(labels:Labels,grouping:"none"|"by"|"without",names:string[]):Labels{if(grouping==="by")return Object.fromEntries(names.filter((name)=>labels[name]!==undefined).map((name)=>[name,labels[name]!]));if(grouping==="without")return Object.fromEntries(Object.entries(labels).filter(([name])=>!names.includes(name)));return{};}

  private copyRecord(record:WorkingRecord):WorkingRecord{return{...record,labels:{...record.labels},fields:{...record.fields},fieldOrigins:{...record.fieldOrigins}};}
  private recordError(record:WorkingRecord,stage:string,error:string):void{record.error=error;record.fields.__error__=error;this.origin("__error__","extracted-field",record.fieldOrigins);if(!this.facts.lineage.parserErrors.some((item)=>item.recordId===record.id&&item.stage===stage))this.facts.lineage.parserErrors.push({recordId:record.id,stage,error,handled:false});}
  private handleErrors(recordId:string):void{for(const error of this.facts.lineage.parserErrors)if(error.recordId===recordId)error.handled=true;}
  private origin(field:string,origin:"indexed-label"|"structured-metadata"|"extracted-field",local:ResultRecord["fieldOrigins"]):void{local[field]=origin;const origins=(this.facts.lineage.fieldOrigins[field]??=[]);if(!origins.includes(origin))origins.push(origin);}
  private template(template:string,record:WorkingRecord):string{return template.replace(/{{\s*\.([A-Za-z_][\w.]*)\s*}}/g,(_match:string,name:string)=>String(record.fields[name]??record.labels[name]??""));}
  private logfmt(line:string):Record<string,string>{const values:Record<string,string>={};const expression=/([A-Za-z_][\w.]*)=("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s]+)/g;let match:RegExpExecArray|null;while((match=expression.exec(line))){const raw=match[2]!;values[match[1]!]=(raw.startsWith('"')||raw.startsWith("'"))?raw.slice(1,-1).replace(/\\([\\"'])/g,"$1"):raw;}if(!Object.keys(values).length)throw new Error("no logfmt fields");return values;}
  private namedRegex(value:string):RegExp{try{return new RegExp(value.replace(/\(\?P</g,"(?<"));}catch{throw new QueryFailure("execution",`invalid regexp parser expression ${JSON.stringify(value)}`);}}
  private patternRegex(value:string,capture:boolean):RegExp{let source="";let cursor=0;const placeholder=/<([^>]+)>/g;let match:RegExpExecArray|null;while((match=placeholder.exec(value))){source+=escapeRegex(value.slice(cursor,match.index));const name=match[1]!;source+=name==="_"?".*?":capture?`(?<${name}>.*?)`:".*?";cursor=placeholder.lastIndex;}source+=escapeRegex(value.slice(cursor));return new RegExp(capture?`^${source}$`:source);}
}

function escapeRegex(value:string):string{return value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function parseDurationFlexible(value:string):number{if(/^\d+(?:\.\d+)?(?:ms|[smhdwy])/.test(value))return parseDuration(value);const clock=/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(value);if(!clock)throw new QueryFailure("execution",`invalid duration ${JSON.stringify(value)}`);return Number(clock[1]??0)*3600+Number(clock[2]??0)*60+Number(clock[3]??0);}

function recordsResult(value:Extract<EvalValue,{kind:"logs"}>,context:QueryContext,facts:QueryFacts):RecordsResult{
  const direction=context.direction??"backward";const ordered=value.streams.flatMap((stream)=>stream.records.map((record)=>({stream,record}))).sort((a,b)=>direction==="forward"?a.record.timestamp-b.record.timestamp:b.record.timestamp-a.record.timestamp);
  const selected=new Set(ordered.slice(0,context.limit??ordered.length).map(({record})=>record.id));
  const streams=value.streams.map((stream)=>({streamId:stream.id,labels:stream.labels,records:stream.records.filter((record)=>selected.has(record.id)).sort((a,b)=>direction==="forward"?a.timestamp-b.timestamp:b.timestamp-a.timestamp).map(({source,sample:_sample,sampleUnit:_sampleUnit,...record})=>({...record,...(source?{sourceId:source}:{})}))})).filter((stream)=>stream.records.length);
  for(const stream of value.streams)for(const record of stream.records)if(selected.has(record.id)){uniquePush(facts.lineage.records,record.id);uniquePush(facts.lineage.events,...record.eventIds);}
  facts.cost.returned=streams.reduce((sum,stream)=>sum+stream.records.length,0);return{type:"records",direction,streams};
}

function metricResult(value:Exclude<EvalValue,{kind:"logs"}>,facts:QueryFacts):QueryValue{
  if(value.kind==="scalar")return{type:"scalar",timestamp:value.timestamp,value:value.value};facts.cost.returned=value.samples.length;
  for(const sample of value.samples){uniquePush(facts.lineage.records,...sample.ids);uniquePush(facts.lineage.events,...sample.events);}
  return{type:"instant-vector",series:value.samples.map(({labels,timestamp,value,unit})=>({labels,timestamp,value,...(unit?{unit}:{})}))};
}

export function executeLogql(query:string,context:QueryContext,facts:QueryFacts):QueryValue{
  const parser=new Parser(new Lexer(query).scan());const expression=parser.parse();facts.semantic.push(...parser.semantic);const evaluator=new Evaluator(context,facts);
  if(context.step!==undefined){
    if(context.start===undefined||context.end===undefined||context.step<=0)throw new QueryFailure("execution","metric range evaluation requires start, end, and a positive step");
    const groups=new Map<string,{labels:Labels;values:Array<{timestamp:number;value:number}>;unit?:string}>();
    for(let timestamp=context.start;timestamp<=context.end+1e-9;timestamp+=context.step){const value=evaluator.run(expression,timestamp);if(value.kind!=="vector"&&value.kind!=="scalar")throw new QueryFailure("execution","record queries do not support a metric step");
      if(value.kind==="scalar"){const group=groups.get("")??{labels:{},values:[]};group.values.push({timestamp,value:value.value});groups.set("",group);}else for(const sample of value.samples){const key=labelsKey(sample.labels);const group=groups.get(key)??{labels:sample.labels,values:[],...(sample.unit?{unit:sample.unit}:{})};group.values.push({timestamp,value:sample.value});groups.set(key,group);uniquePush(facts.lineage.records,...sample.ids);uniquePush(facts.lineage.events,...sample.events);}}
    facts.cost.returned=groups.size;return{type:"range-vector",series:[...groups.values()]};
  }
  const value=evaluator.run(expression);return value.kind==="logs"?recordsResult(value,context,facts):metricResult(value,facts);
}
