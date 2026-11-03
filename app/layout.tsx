import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Matchie", template: "%s · Matchie" },
  description: "AI job search agent: scores jobs against your resume and tracks every application.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Matchie", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

// Runs before first paint so the page never flashes the wrong theme. A saved
// choice ("light" / "dark" in localStorage) wins; otherwise follow the OS,
// including live OS changes. Kept tiny and dependency-free on purpose.
const themeScript = `(function(){try{var k="theme",r=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");function a(d){r.classList.toggle("dark",d)}var s=localStorage.getItem(k);a(s?s==="dark":m.matches);m.addEventListener("change",function(e){if(!localStorage.getItem(k))a(e.matches)})}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the theme script adds "dark" to <html> before
    // React hydrates, so its class differs from the server HTML by design.
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
