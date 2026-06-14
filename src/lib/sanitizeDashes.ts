/**
 * Deterministic dash filter for outbound copy.
 *
 * Replaces every em-dash (—), en-dash (–) and the other non-hyphen dash
 * variants (figure dash, horizontal bar, minus sign) with a comma, so a
 * generated email never carries the classic "an AI wrote this" long dash.
 * The ordinary hyphen-minus (-, U+002D) is deliberately left untouched, so
 * "rendez-vous" and Dutch compounds ("Google-score") survive intact.
 *
 * This is the belt to the prompt's suspenders: the system prompt already tells
 * the model never to use long dashes, and this runs at every persist/send
 * boundary (generate, autopilot, bulk, reengage, upsell, auditEmail) as a
 * guarantee. It only substitutes characters — it never truncates, so it can
 * never chop a sentence mid-thought.
 */

// The dash family WITHOUT the hyphen-minus:
//   U+2012 figure dash, U+2013 en dash, U+2014 em dash,
//   U+2015 horizontal bar, U+2212 minus sign.
const LONG_DASH_RE = /\s*[‒–—―−]\s*/g;

/**
 * Returns `input` with every long dash swapped for a comma and the small
 * artifacts that produces tidied up. Null/undefined pass through unchanged so
 * callers can apply it to optional fields (e.g. `subjectB`) without guards.
 */
export function sanitizeDashes<T extends string | null | undefined>(input: T): T {
  if (input == null) return input;
  const out = (input as string)
    // Any long dash, with its surrounding spaces, becomes a single comma+space.
    .replace(LONG_DASH_RE, ", ")
    // Tidy the artifacts the blunt swap can create.
    .replace(/\s+,/g, ",") //            " ,"      -> ","
    .replace(/,(?:\s*,)+/g, ",") //      ",,"/", ," -> ","
    .replace(/,(\s*[.!?;:])/g, "$1") //  ", ."      -> "."
    .replace(/([(>])\s*,\s*/g, "$1") //  "(, " / ">, " drop the leading comma
    .replace(/,\s*(<\/(?:p|li|h[1-6]|strong|em|b|i)>)/gi, "$1") // trailing comma before a closing tag
    .replace(/,\s*$/g, ""); //           trailing comma at the very end
  return out as T;
}

// The greeting paragraph the prompt asks for: a salutation word optionally
// followed by up to 3 name/title words, alone in the first <p>. The model
// reliably drops the trailing comma after a bare greeting ("<p>Bonjour</p>")
// no matter how the prompt insists, so we add it deterministically — same
// philosophy as the dash filter. Only the first <p> is touched, and only when
// it is just the greeting (it must close right after), so real sentences are
// never altered. A greeting that already ends in a comma won't match (the
// comma sits between the name and </p>), so it is left as-is.
const GREETING_RE = /^(\s*<p>\s*)(Bonjour|Bonsoir|Hallo|Hoi|Goedendag|Beste|Hey|Salut)((?:\s+[\p{L}'’.-]+){0,3})(\s*)(<\/p>)/u;

export function ensureGreetingComma<T extends string | null | undefined>(body: T): T {
  if (body == null) return body;
  const out = (body as string).replace(
    GREETING_RE,
    (_m, open, word, name, _sp, close) => `${open}${(word + name).trimEnd()},${close}`,
  );
  return out as T;
}

/**
 * Full normalization for a generated email BODY (HTML): strips long dashes and
 * guarantees the greeting comma. Use for body fields; use sanitizeDashes alone
 * for subjects (which have no greeting).
 */
export function cleanEmailBody<T extends string | null | undefined>(body: T): T {
  return ensureGreetingComma(sanitizeDashes(body));
}
