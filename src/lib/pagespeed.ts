/**
 * Google PageSpeed Insights API — free, no key needed for low volume (~25/day
 * per IP comfortably). Gives us an objective Lighthouse mobile score and the
 * core Web Vitals. Fed into the email prompt as a verified fact: "votre site
 * charge en 7.2s sur mobile" is impossible for a prospect to dismiss as
 * marketing fluff.
 *
 * Failure is silent — if PSI rate-limits or the URL is unreachable, we return
 * null and the email pipeline continues without this signal.
 */

export interface PageSpeedSnapshot {
  url: string;
  fetchedAt: string;
  strategy: "mobile";
  ok: boolean;
  performanceScore: number | null; // 0–100
  lcpMs: number | null; // Largest Contentful Paint
  fcpMs: number | null; // First Contentful Paint
  cls: number | null; // Cumulative Layout Shift
  tbtMs: number | null; // Total Blocking Time
  speedIndexMs: number | null;
  loadingExperience: "FAST" | "AVERAGE" | "SLOW" | "NONE" | null;
  error?: string;
}

const TIMEOUT_MS = 25_000; // PSI is slow — 25s is realistic
const API_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

interface PSIResponse {
  lighthouseResult?: {
    categories?: { performance?: { score?: number } };
    audits?: Record<
      string,
      { numericValue?: number; displayValue?: string; score?: number }
    >;
  };
  loadingExperience?: { overall_category?: string };
}

export async function fetchPageSpeed(url: string): Promise<PageSpeedSnapshot> {
  const fetchedAt = new Date().toISOString();
  const base: PageSpeedSnapshot = {
    url,
    fetchedAt,
    strategy: "mobile",
    ok: false,
    performanceScore: null,
    lcpMs: null,
    fcpMs: null,
    cls: null,
    tbtMs: null,
    speedIndexMs: null,
    loadingExperience: null,
  };

  const params = new URLSearchParams({
    url,
    strategy: "mobile",
    category: "performance",
  });
  // Optional API key — supports higher quota if user configured one.
  const key = process.env.PAGESPEED_API_KEY;
  if (key) params.set("key", key);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}?${params.toString()}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { ...base, error: `PSI HTTP ${res.status}` };
    }
    const json = (await res.json()) as PSIResponse;
    const lh = json.lighthouseResult;
    const score = lh?.categories?.performance?.score;
    const a = lh?.audits ?? {};
    return {
      ...base,
      ok: true,
      performanceScore: typeof score === "number" ? Math.round(score * 100) : null,
      lcpMs: roundOrNull(a["largest-contentful-paint"]?.numericValue),
      fcpMs: roundOrNull(a["first-contentful-paint"]?.numericValue),
      cls: numOrNull(a["cumulative-layout-shift"]?.numericValue),
      tbtMs: roundOrNull(a["total-blocking-time"]?.numericValue),
      speedIndexMs: roundOrNull(a["speed-index"]?.numericValue),
      loadingExperience:
        (json.loadingExperience?.overall_category as PageSpeedSnapshot["loadingExperience"]) ?? null,
    };
  } catch (e) {
    return {
      ...base,
      error: e instanceof Error ? e.message : "PSI fetch error",
    };
  } finally {
    clearTimeout(timer);
  }
}

function roundOrNull(v: number | undefined): number | null {
  return typeof v === "number" && isFinite(v) ? Math.round(v) : null;
}

function numOrNull(v: number | undefined): number | null {
  return typeof v === "number" && isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/**
 * Renders PSI metrics into a short, French bullet block for the AI prompt.
 * Returns null when the snapshot didn't yield usable data.
 */
export function pagespeedToPromptFacts(snap: PageSpeedSnapshot | null | undefined): string | null {
  if (!snap || !snap.ok) return null;
  const lines: string[] = [];
  if (snap.performanceScore !== null) {
    const tier = snap.performanceScore >= 90 ? "excellent" : snap.performanceScore >= 50 ? "moyen" : "MAUVAIS";
    lines.push(`- Score Lighthouse mobile : ${snap.performanceScore}/100 (${tier})`);
  }
  if (snap.lcpMs !== null) {
    const sec = (snap.lcpMs / 1000).toFixed(1);
    const tier = snap.lcpMs > 4000 ? " — LENT" : snap.lcpMs > 2500 ? " — acceptable" : "";
    lines.push(`- LCP (chargement principal) : ${sec}s${tier}`);
  }
  if (snap.cls !== null) {
    const tier = snap.cls > 0.25 ? " — décalage visuel important" : "";
    lines.push(`- CLS (stabilité visuelle) : ${snap.cls}${tier}`);
  }
  if (snap.loadingExperience && snap.loadingExperience !== "NONE") {
    lines.push(`- Expérience réelle utilisateurs : ${snap.loadingExperience}`);
  }
  if (lines.length === 0) return null;
  return `Performances mobiles mesurées par Google Lighthouse :\n${lines.join("\n")}`;
}

/**
 * Short, human-readable label for the UI ("38/100 mobile" or "Échec").
 */
export function pagespeedSummary(snap: PageSpeedSnapshot | null | undefined): string {
  if (!snap) return "—";
  if (!snap.ok) return "Échec";
  if (snap.performanceScore === null) return "—";
  return `${snap.performanceScore}/100`;
}
