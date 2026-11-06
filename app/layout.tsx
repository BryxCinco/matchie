import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Outfit } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Headings.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

// One italic accent word per heading ("Disc<em>o</em>ver"). Single weight and
// style: it is decoration, so keep the download small.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: "italic",
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
  // Dark is the default theme, so the browser chrome matches it.
  themeColor: "#15131f",
  // Draw under the notch and home indicator; bars pad with env(safe-area-inset-*).
  viewportFit: "cover",
};

// Runs before first paint so the page never flashes the wrong theme. Dark is
// the default; a saved "light" (from the toggle) switches to cream. If storage
// is blocked, the class set on <html> below keeps it dark.
const themeScript = `(function(){try{document.documentElement.classList.toggle("dark",localStorage.getItem("theme")!=="light")}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the theme script may remove "dark" from <html>
    // before React hydrates, so its class can differ from the server HTML.
    <html lang="en" suppressHydrationWarning className={`dark ${geistSans.variable} ${geistMono.variable} ${outfit.variable} ${instrumentSerif.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
