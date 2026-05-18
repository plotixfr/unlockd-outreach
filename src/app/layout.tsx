import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Unlockd Outreach",
  description: "Cold email outreach tool by Unlockd Studio",
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
  // Pages that should render edge-to-edge without the operator sidebar even
  // when Temim is logged in: the public audit widget and the printable
  // brief/proposal documents.
  const standalone =
    pathname.startsWith("/audit") ||
    /^\/prospects\/[^/]+\/(brief|proposal)/.test(pathname);

  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="bg-[#07070b] text-[#f4f4f6] min-h-screen antialiased">
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
