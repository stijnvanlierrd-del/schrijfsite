import type { Metadata, Viewport } from "next";
import { Archivo, Caveat, Instrument_Serif, UnifrakturMaguntia } from "next/font/google";
import localFont from "next/font/local";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { getSessionUserSafe } from "@/lib/auth";
import "./globals.css";

const display = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const blackletter = UnifrakturMaguntia({ subsets: ["latin"], weight: "400", variable: "--font-blackletter", display: "swap" });
const sans = Archivo({ subsets: ["latin", "latin-ext"], weight: ["600", "800"], variable: "--font-sans", display: "swap" });
const hand = Caveat({ subsets: ["latin", "latin-ext"], weight: ["400", "600"], variable: "--font-hand", display: "swap" });
const termes = localFont({
  src: [
    { path: "./fonts/texgyretermes-regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/texgyretermes-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/texgyretermes-bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/texgyretermes-bolditalic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-body",
  display: "swap",
  fallback: ["Times New Roman", "Times", "serif"],
});

export const metadata: Metadata = {
  title: { default: "Schrijfsite — uw eigen handschrift als lettertype", template: "%s · Schrijfsite" },
  description:
    "Upload of teken je handschrift, laat het analyseren en zet elke tekst om in jouw eigen handschrift — op gelinieerd, blanco, geruit of ander papier. Download als PNG of PDF.",
  applicationName: "Schrijfsite",
};

export const viewport: Viewport = {
  themeColor: "#e8e6e0",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUserSafe();
  return (
    <html lang="nl" className={`${display.variable} ${blackletter.variable} ${sans.variable} ${hand.variable} ${termes.variable}`}>
      <body>
        <Masthead user={user ? { name: user.name || user.email.split("@")[0] } : null} />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
