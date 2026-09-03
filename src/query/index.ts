import { executeLogql } from "./logql";
import { executePromql } from "./promql";
import { emptyFacts, QueryFailure } from "./shared";
import type { QueryContext, QueryExecution, QueryLanguage } from "./types";

export * from "./types";

export function executeQuery(language: QueryLanguage, query: string, context: QueryContext): QueryExecution {
  const facts = emptyFacts();
  try {
    const result = language === "promql" ? executePromql(query, context, facts) : executeLogql(query, context, facts);
    return { ok: true, language, result, facts };
  } catch (error) {
    if (error instanceof QueryFailure) {
      return { ok: false, language, error: { kind: error.kind, message: error.message, ...(error.position === undefined ? {} : { position: error.position }) }, facts };
    }
    return { ok: false, language, error: { kind: "execution", message: error instanceof Error ? error.message : String(error) }, facts };
  }
}
