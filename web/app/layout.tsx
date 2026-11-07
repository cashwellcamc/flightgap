import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "flightgap — flight reliability from the passenger's side",
  description: "Was your flight really on time? Was your cancellation really weather? Check the federal data, see what you were owed, and compare it to what you got.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} h-full`}>
      <body className="min-h-full bg-zinc-950 text-zinc-100 font-mono antialiased flex flex-col">
        <header className="border-b border-zinc-800 px-6 py-3 flex items-center gap-6 text-sm">
          <Link href="/" className="text-white font-semibold tracking-tight">flightgap</Link>
          <nav className="flex gap-4 text-zinc-400">
            <Link href="/lookup" className="hover:text-white transition-colors">flight check</Link>
            <Link href="/padding" className="hover:text-white transition-colors">padding</Link>
            <Link href="/reports" className="hover:text-white transition-colors">reports</Link>
          </nav>
        </header>
        <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
          {children}
        </main>
      </body>
    </html>
  );
}
