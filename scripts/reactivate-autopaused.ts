/**
 * One-time recovery after the pagination/cooldown fix: re-activate every
 * brief that the OLD permanent auto-pause killed (fingerprint: active=false
 * AND its 3 most recent runs all created 0), and reset its cursor/cooldown
 * state so the next cron fire starts fresh. Manually-paused briefs that
 * don't match the fingerprint are left alone.
 *
 * Run: npx tsx scripts/reactivate-autopaused.ts
 */
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
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
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
  const prisma = new PrismaClient({ adapter });

  const paused = await prisma.searchBrief.findMany({
    where: { active: false },
    select: { id: true, name: true },
  });

  // Staggered reintroduction: groups of GROUP_SIZE come off cooldown 2h
  // apart (one cron tick each), so ~46 revived briefs don't all land in the
  // same autopilot fire. Groups whose slot falls on the weekend simply
  // become eligible Monday — the wave/budget rotation absorbs that.
  const GROUP_SIZE = 8;
  const STAGGER_MS = 2 * 3600_000;
  const now = Date.now();

  let reactivated = 0;
  for (const b of paused) {
    const recent = await prisma.discoveryRun.findMany({
      where: { briefId: b.id, status: { in: ["done", "failed"] } },
      orderBy: { startedAt: "desc" },
      take: 3,
      select: { created: true },
    });
    const autoPaused = recent.length >= 3 && recent.every((r) => r.created === 0);
    if (!autoPaused) {
      console.log(`skip (looks manually paused): ${b.name}`);
      continue;
    }
    const group = Math.floor(reactivated / GROUP_SIZE);
    const cooldownUntil = group === 0 ? null : new Date(now + group * STAGGER_MS);
    await prisma.searchBrief.update({
      where: { id: b.id },
      data: {
        active: true,
        emptyRunStreak: 0,
        cooldownUntil,
        exhaustedAt: null,
        discoveryCursor: Prisma.DbNull,
      },
    });
    reactivated++;
    console.log(
      `reactivated [group ${group}${cooldownUntil ? `, eligible ${cooldownUntil.toISOString().slice(0, 16)}Z` : ", eligible now"}]: ${b.name}`
    );
  }
  console.log(`\nDone — ${reactivated}/${paused.length} paused briefs reactivated in ${Math.ceil(reactivated / GROUP_SIZE)} staggered groups.`);
  await prisma.$disconnect();
}

main();
