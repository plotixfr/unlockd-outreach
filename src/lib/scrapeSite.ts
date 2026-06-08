/**
 * Lightweight server-side scraper used to turn a prospect's website URL into a
 * small set of verified facts. Those facts are fed into the email prompt so
 * Claude stops hallucinating "observations" about a site it has never seen.
 *
 * We deliberately keep this dependency-free (no cheerio / puppeteer): the goal
 * is a 3–5s budget with strict timeout, not full DOM access. Regex extraction
 * is good enough for the handful of signals we need.
 */

export interface SiteSnapshot {
  url: string;
  fetchedAt: string;
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  title: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  lang: string | null;
  h1: string | null;
  h2s: string[];
  bodyText: string | null;
  signals: SiteSignals;
  error?: string;
}

export interface SiteSignals {
  hasReservation: boolean;
  hasContactForm: boolean;
  hasInstagramLink: boolean;
  hasFacebookLink: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  responsiveViewport: boolean;
  language: string | null;
  approxImageCount: number;
  techHints: string[];
}

const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 350_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; UnlockdOutreach/1.0; +https://unlockd.art)";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function clean(s: string | null | undefined, max = 500): string | null {
  if (!s) return null;
  const t = decodeEntities(s).replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max).trim() + "…" : t;
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1] : null;
}

function allMatches(html: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(re)) out.push(m[1]);
  return out;
}

function normalizeUrl(input: string): string | null {
  let u = input.trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    return new URL(u).toString();
  } catch {
    return null;
  }
}

function extractSignals(html: string): SiteSignals {
  const lower = html.toLowerCase();
  const reservationKeywords = [
    "réserver",
    "reserver",
    "réservation",
    "reservation",
    "book now",
    "book a table",
    "booking",
    "thefork",
    "the fork",
    "opentable",
    "lafourchette",
    "sevenrooms",
    "guestonline",
    "réserver une table",
  ];
  const contactKeywords = [
    "contactez-nous",
    "contact us",
    'name="message"',
    "<form",
    'type="email"',
  ];
  const phoneRe = /(\+33|0\d)[\s().-]?\d[\s().-]?\d[\s().-]?\d[\s().-]?\d[\s().-]?\d[\s().-]?\d[\s().-]?\d[\s().-]?\d[\s().-]?\d/;
  const emailRe = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
  const lang = firstMatch(html, /<html[^>]*lang=["']([^"']+)["']/i);

  const techHints: string[] = [];
  if (/wix\.com|wixstatic/i.test(html)) techHints.push("Wix");
  if (/squarespace/i.test(html)) techHints.push("Squarespace");
  if (/wp-content|wordpress/i.test(html)) techHints.push("WordPress");
  if (/shopify/i.test(html)) techHints.push("Shopify");
  if (/webflow/i.test(html)) techHints.push("Webflow");
  if (/cdn\.shopify/i.test(html)) techHints.push("Shopify");

  return {
    hasReservation: reservationKeywords.some((k) => lower.includes(k)),
    hasContactForm: contactKeywords.some((k) => lower.includes(k)),
    hasInstagramLink: /instagram\.com\//i.test(html),
    hasFacebookLink: /facebook\.com\//i.test(html),
    hasPhone: phoneRe.test(html),
    hasEmail: emailRe.test(html),
    responsiveViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    language: lang ? lang.toLowerCase().split("-")[0] : null,
    approxImageCount: (html.match(/<img\b/gi) || []).length,
    techHints,
  };
}

function extractBodyText(html: string): string | null {
  const noScripts = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ");
  const stripped = noScripts.replace(/<[^>]+>/g, " ");
  return clean(stripped, 1200);
}

/**
 * Translates Node's opaque fetch errors into actionable messages. The native
 * fetch wraps the actual cause in error.cause; without unwrapping it, every
 * problem (DNS, TLS, connection refused, abort) just reads "fetch failed".
 */
function explainFetchError(e: unknown): string {
  if (!(e instanceof Error)) return "fetch error";
  const cause = (e as Error & { cause?: { code?: string; message?: string } }).cause;
  const code = cause?.code;
  if (e.name === "AbortError") return `Timeout (>${FETCH_TIMEOUT_MS}ms)`;
  if (code === "ENOTFOUND") return "Domena ne postoji (DNS fail)";
  if (code === "ECONNREFUSED") return "Konekcija odbijena";
  if (code === "ECONNRESET") return "Konekcija prekinuta";
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") return "Konekcija timeout";
  if (code === "DEPTH_ZERO_SELF_SIGNED_CERT" || code === "CERT_HAS_EXPIRED") return "TLS/cert problem";
  if (code?.startsWith("ERR_TLS") || cause?.message?.includes("TLS")) return "TLS handshake fail";
  if (cause?.message) return cause.message;
  return e.message || "fetch error";
}

async function fetchOnce(
  url: string,
  userAgent: string
): Promise<{ html: string; status: number; finalUrl: string } | { error: string; status: number | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate",
        "Cache-Control": "no-cache",
      },
    });
    if (!res.ok) {
      return { error: `HTTP ${res.status} ${res.statusText}`.trim(), status: res.status };
    }
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return { html: text.slice(0, MAX_BYTES), status: res.status, finalUrl: res.url };
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
    }
    try {
      await reader.cancel();
    } catch {
      // ignore — already drained
    }
    const buf = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) {
      buf.set(c.subarray(0, Math.min(c.length, received - off)), off);
      off += c.length;
      if (off >= received) break;
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    return { html, status: res.status, finalUrl: res.url };
  } catch (e) {
    return { error: explainFetchError(e), status: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Multi-attempt fetch: tries the requested URL, then falls back to a desktop
 * Chrome UA (some hosts block our identifying UA), then http:// if the original
 * was https:// (a surprising number of small business sites still don't have
 * working TLS on the apex domain). Returns the first successful response.
 */
async function fetchWithLimits(
  url: string
): Promise<{ html: string; status: number; finalUrl: string } | { error: string; status: number | null; attempts: string[] }> {
  const attempts: string[] = [];
  const chromeUa =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const tries: { url: string; ua: string; label: string }[] = [
    { url, ua: USER_AGENT, label: "primary UA" },
    { url, ua: chromeUa, label: "desktop Chrome UA" },
  ];
  // If https failed entirely, try plain http as a last resort.
  if (url.startsWith("https://")) {
    tries.push({ url: url.replace(/^https:/, "http:"), ua: chromeUa, label: "http fallback" });
  }
  // And try the apex (www <-> non-www) in case one is broken
  try {
    const u = new URL(url);
    if (u.hostname.startsWith("www.")) {
      const apex = `${u.protocol}//${u.hostname.slice(4)}${u.pathname}${u.search}`;
      tries.push({ url: apex, ua: chromeUa, label: "non-www" });
    } else {
      const www = `${u.protocol}//www.${u.hostname}${u.pathname}${u.search}`;
      tries.push({ url: www, ua: chromeUa, label: "www variant" });
    }
  } catch {
    // ignore
  }

  let lastErr: { error: string; status: number | null } = { error: "Unknown error", status: null };
  for (const t of tries) {
    const out = await fetchOnce(t.url, t.ua);
    if ("html" in out) {
      attempts.push(`OK ${t.label}: ${t.url}`);
      return out;
    }
    attempts.push(`${t.label} (${t.url}): ${out.error}`);
    lastErr = out;
  }
  return { ...lastErr, attempts };
}

/**
 * Snapshots the prospect's website with a hard timeout. Never throws — always
 * returns a SiteSnapshot, with ok=false + error when the fetch fails. This way
 * email generation never blocks on a broken/slow site.
 */
export async function scrapeSite(rawUrl: string): Promise<SiteSnapshot> {
  const url = normalizeUrl(rawUrl);
  const fetchedAt = new Date().toISOString();
  if (!url) {
    return {
      url: rawUrl,
      fetchedAt,
      ok: false,
      status: null,
      finalUrl: null,
      title: null,
      metaDescription: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      lang: null,
      h1: null,
      h2s: [],
      bodyText: null,
      signals: emptySignals(),
      error: "URL invalide",
    };
  }

  const result = await fetchWithLimits(url);
  if ("error" in result) {
    const attemptsLog = result.attempts?.length
      ? ` [pokušaji: ${result.attempts.join(" | ")}]`
      : "";
    return {
      url,
      fetchedAt,
      ok: false,
      status: result.status,
      finalUrl: null,
      title: null,
      metaDescription: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      lang: null,
      h1: null,
      h2s: [],
      bodyText: null,
      signals: emptySignals(),
      error: `${result.error}${attemptsLog}`,
    };
  }

  const { html, status, finalUrl } = result;
  const title = clean(firstMatch(html, /<title[^>]*>([^<]+)<\/title>/i), 200);
  const metaDescription = clean(
    firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      firstMatch(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i),
    400
  );
  const ogTitle = clean(
    firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i),
    200
  );
  const ogDescription = clean(
    firstMatch(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i),
    400
  );
  const ogImage = clean(
    firstMatch(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i),
    400
  );
  const lang = firstMatch(html, /<html[^>]*lang=["']([^"']+)["']/i);
  const h1 = clean(firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)?.replace(/<[^>]+>/g, " "), 200);
  const h2s = allMatches(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi)
    .map((s) => clean(s.replace(/<[^>]+>/g, " "), 150))
    .filter((s): s is string => !!s)
    .slice(0, 6);
  const bodyText = extractBodyText(html);
  const signals = extractSignals(html);

  return {
    url,
    fetchedAt,
    ok: true,
    status,
    finalUrl,
    title,
    metaDescription,
    ogTitle,
    ogDescription,
    ogImage,
    lang: lang ? lang.toLowerCase() : null,
    h1,
    h2s,
    bodyText,
    signals,
  };
}

function emptySignals(): SiteSignals {
  return {
    hasReservation: false,
    hasContactForm: false,
    hasInstagramLink: false,
    hasFacebookLink: false,
    hasPhone: false,
    hasEmail: false,
    responsiveViewport: false,
    language: null,
    approxImageCount: 0,
    techHints: [],
  };
}

/**
 * Renders the snapshot as a short bullet block in French — fed directly into
 * the Claude prompt as "verified facts about this prospect". Returns null when
 * the snapshot didn't yield anything usable (so the prompt can stay terse).
 */
export function snapshotToPromptFacts(snap: SiteSnapshot | null | undefined): string | null {
  if (!snap || !snap.ok) return null;
  const lines: string[] = [];
  if (snap.title) lines.push(`- Title du site : "${snap.title}"`);
  if (snap.metaDescription) lines.push(`- Meta description : "${snap.metaDescription}"`);
  if (snap.h1 && snap.h1 !== snap.title) lines.push(`- H1 : "${snap.h1}"`);
  if (snap.h2s.length > 0) lines.push(`- H2 visibles : ${snap.h2s.slice(0, 3).map((s) => `"${s}"`).join(", ")}`);
  if (snap.lang) lines.push(`- Langue du site : ${snap.lang}`);
  if (snap.signals.techHints.length > 0)
    lines.push(`- Plateforme détectée : ${snap.signals.techHints.join(", ")}`);
  const flags: string[] = [];
  if (snap.signals.hasReservation) flags.push("système de réservation présent");
  if (snap.signals.hasContactForm) flags.push("formulaire de contact présent");
  if (snap.signals.hasInstagramLink) flags.push("lien Instagram");
  if (!snap.signals.responsiveViewport) flags.push("PAS de viewport responsive (probable mauvais mobile)");
  if (snap.signals.approxImageCount < 4) flags.push(`peu d'images (${snap.signals.approxImageCount})`);
  if (snap.signals.approxImageCount > 40) flags.push(`beaucoup d'images (${snap.signals.approxImageCount}) — risque de lenteur`);
  if (flags.length > 0) lines.push(`- Signaux : ${flags.join(", ")}`);
  if (lines.length === 0) return null;
  return `Faits vérifiés (extraits du site, à utiliser pour personnaliser sans inventer) :\n${lines.join("\n")}`;
}
