/**
 * One-off repair after the 2026-06-08 ICP pivot: prospects that the OLD
 * scorer rejected with pre-pivot reasoning ("doesn't match B2B/SaaS
 * profile", "wrong niche", "Wrong country"…) get their score reset so the
 * EXISTING redrive pass re-scores them with the current brief-driven prompt.
 *
 * Safety rails:
 *  - DRY RUN by default; only `--apply` mutates.
 *  - JSON backup of every affected row is written before any mutation.
 *  - Touches ONLY prospects that are status "New", brief-discovered, with
 *    ZERO generated emails — sent/scheduled emails can never be affected.
 *  - Never touches briefs. Never scores anything itself (redrive does, at
 *    its existing 5-per-run LLM cost cap).
 *  - Idempotent: rows already tagged `rescore-icp-pivot` (or already
 *    score-less) no longer match the selection.
 *
 * Run:  npx tsx scripts/repair-rescore-icp-pivot.ts          (dry run)
 *       npx tsx scripts/repair-rescore-icp-pivot.ts --apply  (mutate)
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const TAG = "rescore-icp-pivot";

// Old-ICP rejection language (observed in production qualityNote values).
const OLD_ICP_PATTERNS: RegExp[] = [
  /B2B\/SaaS/i,
  /wrong\s+(niche|country|geograph|market|model|fit)/i,
  /no\s+Group\s+A\/B\s+fit/i,
  /doesn'?t\s+match/i,
  /\bB2C\b/i,
  /not\s+(a\s+)?(B2B|professional\s+services|tech|SaaS|consultanc)/i,
  /(consultanc|law\s+firm|accountant|tech\s+startup|agency)\s+(profile|target|focus)/i,
];

// Legitimate rejection reasons — if the note ALSO matches one of these, the
// row is ambiguous and must not be auto-applied.
const EXCLUSION_PATTERNS: RegExp[] = [
  /bounce/i,
  /duplicate/i,
  /no\s+contact/i,
  /invalid\s+email/i,
  /unsubscrib/i,
  /manual/i,
  /dead\s+business/i,
  /\bclosed\b/i,
  /no\s+website/i,
];

async function main() {
  const apply = process.argv.includes("--apply");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
  const prisma = new PrismaClient({ adapter });

  // Candidates: brief-discovered, still "New", scored below their brief's
  // threshold, zero emails generated, not already repaired.
  const candidates = await prisma.prospect.findMany({
    where: {
      status: "New",
      briefId: { not: null },
      qualityScore: { not: null },
      emails: { none: {} },
      NOT: { napomena: { contains: TAG } },
    },
    include: { brief: { select: { name: true, qualityThreshold: true } } },
    orderBy: { createdAt: "asc" },
  });

  const matched: typeof candidates = [];
  const ambiguous: typeof candidates = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const p of candidates) {
    const threshold = p.brief?.qualityThreshold ?? 6;
    if ((p.qualityScore ?? 0) >= threshold) {
      skipped.push({ name: p.firmaNaziv, reason: `score ${p.qualityScore} ≥ threshold ${threshold} (not a rejection)` });
      continue;
    }
    const note = p.qualityNote ?? "";
    const oldIcp = OLD_ICP_PATTERNS.some((re) => re.test(note));
    const excluded = EXCLUSION_PATTERNS.some((re) => re.test(note));
    if (oldIcp && !excluded) matched.push(p);
    else if (oldIcp && excluded) ambiguous.push(p);
    else skipped.push({ name: p.firmaNaziv, reason: `note not old-ICP: "${note.slice(0, 70)}"` });
  }

  console.log(`Candidates (New, brief-discovered, scored<threshold, 0 emails): ${candidates.length}`);
  console.log(`Matched old-ICP rejections: ${matched.length} | Ambiguous: ${ambiguous.length} | Skipped: ${skipped.length}\n`);

  for (const p of matched) {
    console.log(`MATCH  ${p.firmaNaziv.slice(0, 38).padEnd(38)} | score:${p.qualityScore} | ${(p.qualityNote ?? "").slice(0, 90)}`);
  }
  for (const p of ambiguous) {
    console.log(`AMBIG  ${p.firmaNaziv.slice(0, 38).padEnd(38)} | score:${p.qualityScore} | ${(p.qualityNote ?? "").slice(0, 90)}`);
  }
  for (const s of skipped) {
    console.log(`SKIP   ${s.name.slice(0, 38).padEnd(38)} | ${s.reason}`);
  }

  if (ambiguous.length > 0) {
    console.log(`\n⚠ ${ambiguous.length} ambiguous row(s) — NOT touched. Resolve manually.`);
  }

  if (!apply) {
    console.log(`\nDRY RUN — no changes. Re-run with --apply to reset ${matched.length} prospects.`);
    await prisma.$disconnect();
    return;
  }

  if (matched.length === 0) {
    console.log("\nNothing to apply.");
    await prisma.$disconnect();
    return;
  }

  // Backup BEFORE mutating (scripts/ is gitignored, so prospect data stays local).
  const backupDir = path.join(__dirname, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `repair-rescore-icp-pivot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(matched, null, 2));
  console.log(`\nBackup of ${matched.length} rows → ${backupPath}`);

  let applied = 0;
  for (const p of matched) {
    await prisma.prospect.update({
      where: { id: p.id },
      data: {
        qualityScore: null,
        qualityNote: null,
        attemptCount: 0,
        lastAttemptAt: null,
        lastError: null,
        status: "New",
        napomena: p.napomena ? `${p.napomena} · ${TAG}` : TAG,
      },
    });
    applied++;
  }
  console.log(`Applied: ${applied}/${matched.length} prospects reset — redrive will re-score them over the coming cron ticks.`);
  await prisma.$disconnect();
}

main();
