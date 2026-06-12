/**
 * Attempt amnesty after the GEN_TIMEOUT_MS infra bug (22s aborted ~half of
 * email generations → "generate: returned 0 emails" lastError, burning
 * redrive attempts). Prospects must not reach terminal Failed because of an
 * infra bug, so for every prospect whose lastError carries a generation
 * failure signature:
 *   - attemptCount → 0, lastAttemptAt → null, lastError → null
 *   - status "Failed" with that signature → back to "New"
 * The redrive then re-runs them naturally at its 5-per-tick cap.
 *
 * DRY RUN by default; --apply mutates. JSON backup written first
 * (scripts/backups/ — local only, never committed). Idempotent: cleared
 * rows no longer match.
 *
 * Run: npx tsx scripts/amnesty-gen-failures.ts [--apply]
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

async function main() {
  const apply = process.argv.includes("--apply");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
  });

  // Generation-failure signatures: the old combined one and the new distinct
  // ones from commit "fix(pipeline): raise generation timeout".
  const matched = await prisma.prospect.findMany({
    where: {
      OR: [
        { lastError: { startsWith: "generate:" } },
        { lastError: { contains: "returned 0 emails" } },
      ],
    },
    select: {
      id: true,
      firmaNaziv: true,
      status: true,
      attemptCount: true,
      lastError: true,
      qualityScore: true,
    },
  });

  console.log(`Matched generation-failure signatures: ${matched.length}\n`);
  for (const p of matched) {
    console.log(
      `${p.status.padEnd(7)} attempts:${p.attemptCount} score:${p.qualityScore ?? "-"} | ${p.firmaNaziv.slice(0, 40).padEnd(40)} | ${(p.lastError ?? "").slice(0, 60)}`
    );
  }

  if (!apply) {
    console.log(`\nDRY RUN — re-run with --apply to amnesty ${matched.length} prospects.`);
    await prisma.$disconnect();
    return;
  }
  if (matched.length === 0) {
    console.log("Nothing to apply.");
    await prisma.$disconnect();
    return;
  }

  const backupDir = path.join(__dirname, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `amnesty-gen-failures-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(backupPath, JSON.stringify(matched, null, 2));
  console.log(`\nBackup → ${backupPath}`);

  let applied = 0;
  for (const p of matched) {
    await prisma.prospect.update({
      where: { id: p.id },
      data: {
        attemptCount: 0,
        lastAttemptAt: null,
        lastError: null,
        ...(p.status === "Failed" ? { status: "New" } : {}),
      },
    });
    applied++;
  }
  console.log(`Applied: ${applied}/${matched.length} — redrive picks them up next tick.`);
  await prisma.$disconnect();
}

main();
