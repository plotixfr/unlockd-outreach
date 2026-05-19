import { NextRequest, NextResponse } from "next/server";

const COOKIE = "unlockd_session";

function isPublic(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/track/open/") ||
    pathname.startsWith("/api/track/calendly/") ||
    pathname.startsWith("/api/unsubscribe/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/autopilot/run" ||
    pathname === "/audit" ||
    pathname.startsWith("/audit/") ||
    pathname.startsWith("/api/audit/") ||
    pathname.startsWith("/preview/")
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

function passthrough(req: NextRequest, pathname: string): NextResponse {
  // Expose the current pathname to server components via headers() so the
  // root layout can decide whether to wrap with the sidebar.
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return passthrough(req, pathname);

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

  return passthrough(req, pathname);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
