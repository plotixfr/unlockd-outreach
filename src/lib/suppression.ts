/**
 * Domain-level suppression. When a prospect replies, unsubscribes, complains,
 * or hard-bounces, we add their email's domain to SuppressedDomain so we
 * never cold-mail another contact at the same company. Spamming a colleague
 * of someone who already said no is the fastest way to nuke a domain's
 * reputation with the prospect's mail admin.
 *
 * Per-prospect "Replied" / "Unsubscribed" status already stops further sends
 * to that one address; this catches the cross-prospect case.
 */

import { prisma } from "@/lib/prisma";

const PUBLIC_PROVIDER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.fr",
  "outlook.com",
  "outlook.fr",
  "hotmail.com",
  "hotmail.fr",
  "icloud.com",
  "me.com",
  "mac.com",
  "live.com",
  "live.fr",
  "msn.com",
  "free.fr",
  "orange.fr",
  "wanadoo.fr",
  "laposte.net",
  "proton.me",
  "protonmail.com",
  "tutanota.com",
]);

export function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase().trim();
}

/**
 * Adds a domain to the suppression list. Skips public providers (gmail.com,
 * yahoo.fr, etc.) where "company colleagues" doesn't apply — a Gmail user
 * unsubscribing doesn't mean every Gmail user opted out.
 */
export async function suppressDomain(
  email: string,
  reason: "replied" | "unsubscribed" | "bounced" | "complained" | "negative",
  prospectId: string | null = null
): Promise<{ suppressed: boolean; domain: string | null }> {
  const domain = domainOf(email);
  if (!domain) return { suppressed: false, domain: null };
  if (PUBLIC_PROVIDER_DOMAINS.has(domain)) {
    return { suppressed: false, domain };
  }
  try {
    await prisma.suppressedDomain.upsert({
      where: { domain },
      create: { domain, reason, prospectId },
      update: {}, // first reason wins — don't overwrite
    });
    return { suppressed: true, domain };
  } catch (e) {
    console.warn("[suppression] upsert failed for", domain, e);
    return { suppressed: false, domain };
  }
}

/**
 * Returns true if the prospect's email domain has been suppressed by another
 * prospect's reply/unsubscribe. Public providers are never blocked.
 */
export async function isDomainSuppressed(email: string): Promise<boolean> {
  const domain = domainOf(email);
  if (!domain) return false;
  if (PUBLIC_PROVIDER_DOMAINS.has(domain)) return false;
  const hit = await prisma.suppressedDomain.findUnique({ where: { domain } });
  return !!hit;
}
