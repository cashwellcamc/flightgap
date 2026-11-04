import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "flightgap",
  description: "Airline reliability from the passenger's side",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} h-full`}>
      <body className="min-h-full bg-zinc-950 text-zinc-100 font-mono antialiased flex flex-col">
        <header className="border-b border-zinc-800 px-6 py-3 flex items-center gap-6 text-sm">
          <Link href="/" className="text-white font-semibold tracking-tight">flightgap</Link>
          <nav className="flex gap-4 text-zinc-400">
            <Link href="/" className="hover:text-white transition-colors">lookup</Link>
            <Link href="/padding" className="hover:text-white transition-colors">padding</Link>
          </nav>
        </header>
        <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
          {children}
        </main>
      </body>
    </html>
  );
}
