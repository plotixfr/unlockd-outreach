/**
 * Pre-send linter that flags common spam triggers in subject + body. Designed
 * to catch the obvious own-goals (ALL CAPS subjects, "free money", "click
 * here", money emoji) before Resend ships them and Gmail filters them.
 *
 * Returns a score 0–100 (higher = riskier) plus the matched terms. Use
 * `shouldBlock` to decide whether to refuse the send entirely.
 *
 * Not a deliverability silver bullet — Gmail's classifier is opaque. But the
 * top-of-the-funnel rules (no "free", no "$$$", no all-caps subject) are
 * well-known and worth enforcing programmatically so Claude can't drift into
 * marketing-speak on a bad generation.
 */

export interface SpamCheckResult {
  score: number;
  matched: string[];
  reasons: string[];
}

// Triggers in French + English. Each term is matched as a word boundary so
// "free" doesn't fire on "freelancer" but does fire on "100% free".
const TRIGGER_WORDS: { pattern: RegExp; label: string; weight: number }[] = [
  // Money / urgency
  { pattern: /\bfree\b/i, label: "free", weight: 8 },
  { pattern: /\bgratuit\b/i, label: "gratuit", weight: 5 },
  { pattern: /\b100%?\s*(free|gratuit)\b/i, label: "100% free/gratuit", weight: 12 },
  { pattern: /\bguarantee[d]?\b/i, label: "guarantee", weight: 8 },
  { pattern: /\bgaranti(e|es|ed)?\b/i, label: "garanti", weight: 5 },
  { pattern: /\bclick here\b/i, label: "click here", weight: 10 },
  { pattern: /\bcliquez ici\b/i, label: "cliquez ici", weight: 8 },
  { pattern: /\$\$\$/, label: "$$$", weight: 15 },
  { pattern: /€€€/, label: "€€€", weight: 15 },
  { pattern: /\bact now\b/i, label: "act now", weight: 8 },
  { pattern: /\bagissez maintenant\b/i, label: "agissez maintenant", weight: 6 },
  { pattern: /\blimited time\b/i, label: "limited time", weight: 6 },
  { pattern: /\btemps limit[éeè]\b/i, label: "temps limité", weight: 5 },
  { pattern: /\bonce in a lifetime\b/i, label: "once in a lifetime", weight: 10 },
  { pattern: /\bexclusive offer\b/i, label: "exclusive offer", weight: 6 },
  { pattern: /\boffre exclusive\b/i, label: "offre exclusive", weight: 5 },
  { pattern: /\b(no obligation|sans engagement)\b/i, label: "no obligation", weight: 5 },
  { pattern: /\b(risk[\- ]?free|sans risque)\b/i, label: "risk-free", weight: 6 },
  { pattern: /\bcash bonus\b/i, label: "cash bonus", weight: 8 },
  { pattern: /\bbest price\b/i, label: "best price", weight: 4 },
  { pattern: /\bmeilleur prix\b/i, label: "meilleur prix", weight: 4 },
  { pattern: /\bsave\s+\$?\d/i, label: "save $N", weight: 6 },
  { pattern: /\béconomisez\s+\d/i, label: "économisez", weight: 4 },
  { pattern: /\bdouble your\b/i, label: "double your", weight: 6 },
  { pattern: /\bcredit card\b/i, label: "credit card", weight: 4 },
  { pattern: /\bcarte de cr[ée]dit\b/i, label: "carte de crédit", weight: 4 },
  // Hard-sell verbs
  { pattern: /\bbuy now\b/i, label: "buy now", weight: 8 },
  { pattern: /\bachetez maintenant\b/i, label: "achetez maintenant", weight: 6 },
  { pattern: /\border now\b/i, label: "order now", weight: 6 },
  { pattern: /\bcommandez maintenant\b/i, label: "commandez maintenant", weight: 5 },
  // Common scam vocab
  { pattern: /\bcongratulations\b/i, label: "congratulations", weight: 5 },
  { pattern: /\bf[ée]licitations\b/i, label: "félicitations", weight: 3 },
  { pattern: /\bwinner\b/i, label: "winner", weight: 6 },
  { pattern: /\bgagnant\b/i, label: "gagnant", weight: 4 },
  { pattern: /\bclaim\s+(your|now)\b/i, label: "claim", weight: 6 },
];

const EXCLAMATION_THRESHOLD = 3; // more than this in subject+body combined → fire

export function lintForSpam(subject: string, htmlBody: string): SpamCheckResult {
  const plainBody = htmlBody
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const matched: string[] = [];
  const reasons: string[] = [];
  let score = 0;

  for (const { pattern, label, weight } of TRIGGER_WORDS) {
    if (pattern.test(subject) || pattern.test(plainBody)) {
      matched.push(label);
      score += weight;
    }
  }

  // Subject in ALL CAPS (>=8 chars, >70% uppercase letters) — strong spam
  // signal even without trigger words. "Quick Note" is fine; "URGENT NOTICE"
  // is not.
  const subjectLetters = subject.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (subjectLetters.length >= 8) {
    const upperRatio =
      subjectLetters.replace(/[^A-ZÀ-Þ]/g, "").length / subjectLetters.length;
    if (upperRatio > 0.7) {
      score += 12;
      reasons.push("subject is mostly uppercase");
    }
  }

  // Excessive exclamation marks (combined across subject + body)
  const exclaims = (subject.match(/!/g)?.length ?? 0) + (plainBody.match(/!/g)?.length ?? 0);
  if (exclaims > EXCLAMATION_THRESHOLD) {
    score += Math.min(15, exclaims * 2);
    reasons.push(`${exclaims} exclamation marks`);
  }

  // Subject longer than 70 chars also dings inbox placement, though Gmail is
  // forgiving here vs. Yahoo. Soft penalty.
  if (subject.length > 70) {
    score += 3;
    reasons.push(`subject is ${subject.length} chars (>70)`);
  }

  return { score, matched, reasons };
}

/**
 * Hard threshold above which we refuse to send. Tuned conservative — most
 * Claude-generated email scores 0–5; a single trigger word brings it to 8–15;
 * a real spam template clears 30+. 25 catches the worst without false-flagging
 * normal copy.
 */
export const SPAM_BLOCK_THRESHOLD = 25;

export function shouldBlock(result: SpamCheckResult): boolean {
  return result.score >= SPAM_BLOCK_THRESHOLD;
}
