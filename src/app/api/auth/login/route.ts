import { NextRequest, NextResponse } from "next/server";

const COOKIE = "unlockd_session";
const MAX_AGE = 60 * 60 * 24; // 24 h

async function computeToken(secret: string, username: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(username));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { username, password } = body;
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET || expectedPass;

  if (
    !username ||
    !password ||
    !expectedUser ||
    !expectedPass ||
    !secret ||
    username !== expectedUser ||
    password !== expectedPass
  ) {
    return NextResponse.json({ error: "Pogrešni kredencijali" }, { status: 401 });
  }

  const token = await computeToken(secret, username);

  const res = NextResponse.json({ success: true });
  res.cookies.set({
    name: COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: MAX_AGE,
    path: "/",
  });
  return res;
}
