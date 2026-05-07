import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
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

  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="bg-[#0a0a0f] text-[#f1f1f3] min-h-screen antialiased">
        {hasSession ? (
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 ml-56 p-8 min-h-screen">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
