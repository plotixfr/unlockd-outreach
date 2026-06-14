/**
 * Feature flags read at request time (not baked at module load).
 *
 * ENABLE_SITE_PREVIEW — master switch for website-preview imagery in outbound
 * emails: the AI redesign mockup (Replicate) AND the inline current-site
 * screenshot (thum.io). Default OFF (any value other than the string "true").
 *
 * When OFF: emails are plain text, never generate or reference a preview, and
 * the call-to-action stays a TEXT offer of a free mockup ("je vous fais une
 * maquette gratuite") that the operator delivers manually on reply. The
 * Replicate mockup module and the /preview concept page stay in the repo but
 * never run in the send pipeline. Set ENABLE_SITE_PREVIEW=true to re-enable.
 */
export function sitePreviewEnabled(): boolean {
  return process.env.ENABLE_SITE_PREVIEW === "true";
}
