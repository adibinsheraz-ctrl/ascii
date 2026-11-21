import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "ASCII — live camera to print-sharp type";
const description =
  "Turn your camera or a photo into print-sharp ASCII art. 100% private, fully on-device. Studio-grade conversion, HD to 8K export.";

export const metadata: Metadata = {
  metadataBase: new URL("https://ascii.art"),
  title,
  description,
  applicationName: "ASCII",
  authors: [{ name: "Adi Binsheraz" }],
  keywords: ["ASCII art", "camera", "photo converter", "typography", "on-device"],
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "ASCII",
    description,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ASCII",
    description,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ASCII",
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon-192.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-foreground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-accent focus:px-3 focus:py-2 focus:text-black"
        >
          Skip to content
        </a>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
