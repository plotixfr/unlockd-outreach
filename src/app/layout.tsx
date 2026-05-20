import type { Metadata } from "next";
import { Geist, Geist_Mono, Cormorant_Garamond } from "next/font/google";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { BRAND } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display serif used for hero typography on dashboard + public preview pages.
const cormorant = Cormorant_Garamond({
  variable: "--font-display-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.description,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const hasSession = cookieStore.has("unlockd_session");
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") || "";
  // Pages that render edge-to-edge without the operator sidebar even when
  // logged in: the public audit widget, printable brief/proposal documents,
  // and the concept preview gallery.
  const standalone =
    pathname.startsWith("/audit") ||
    pathname.startsWith("/preview/") ||
    /^\/prospects\/[^/]+\/(brief|proposal)/.test(pathname);

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} h-full`}>
      <body className="bg-[#07070a] text-[#f5f5f7] min-h-screen antialiased">
        {hasSession && !standalone ? (
          <div className="flex min-h-screen print:block">
            <div className="print:hidden">
              <Sidebar />
            </div>
            <main className="flex-1 ml-60 px-10 py-10 min-h-screen print:ml-0 print:p-0">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
