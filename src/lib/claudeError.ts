/**
 * Distinct signature for Anthropic credit / auth / quota failures.
 *
 * Every Claude call in this app is wrapped in a swallow-and-continue pattern
 * (scoring returns null, generation returns count:0 / "timeout"), which means a
 * billing or auth problem used to masquerade as an ordinary generation bug
 * ("scoring: returned null", "timeout after 90000ms"). This classifier lets the
 * pipeline tag those failures with one unmistakable marker so a dead API key or
 * an empty credit balance is never again mistaken for flaky generation.
 *
 * Matches: 401 (bad/missing key), 402 (payment required), 403 (permission),
 * 429 (rate-limit / quota), and 400s whose message names a credit/billing
 * problem. Everything else returns null (treat as ordinary/transient).
 */
export const API_CREDIT_OR_AUTH_ERROR = "API_CREDIT_OR_AUTH_ERROR";

const FATAL_TYPES = new Set([
  "authentication_error",
  "permission_error",
  "rate_limit_error",
  "billing_error",
]);

export function classifyClaudeError(err: unknown): typeof API_CREDIT_OR_AUTH_ERROR | null {
  const e = err as {
    status?: number;
    error?: { error?: { type?: string; message?: string } };
    message?: string;
  };
  const status = e?.status;
  if (status === 401 || status === 402 || status === 403 || status === 429) {
    return API_CREDIT_OR_AUTH_ERROR;
  }
  const type = e?.error?.error?.type;
  if (type && FATAL_TYPES.has(type)) return API_CREDIT_OR_AUTH_ERROR;
  const msg = (e?.error?.error?.message ?? e?.message ?? "").toLowerCase();
  if (/credit balance|billing|insufficient|quota|payment required|out of credit/.test(msg)) {
    return API_CREDIT_OR_AUTH_ERROR;
  }
  return null;
}
