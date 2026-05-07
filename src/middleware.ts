import { NextRequest, NextResponse } from "next/server";

const COOKIE = "unlockd_session";

function isPublic(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/track/open/") ||
    pathname.startsWith("/api/unsubscribe/") ||
    pathname.startsWith("/api/webhooks/")
  );
}

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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE)?.value;
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  const username = process.env.ADMIN_USERNAME || "admin";

  if (!secret || !cookie) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const expected = await computeToken(secret, username);
  if (cookie !== expected) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set({ name: COOKIE, value: "", maxAge: 0, path: "/" });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
