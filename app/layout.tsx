import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Orbitron } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import Head from "next/head";
import "./globals.css";
import FirebaseProvider from "@/components/FirebaseProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
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
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/cpu_4772073.png", type: "image/png" },
    ],
    apple: [{ url: "/icon.png" }],
    shortcut: ["/icon.png"],
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
      className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} h-full antialiased`}
    >
      <Head>
        <script async src="https://www.googletagmanager.com/gtm.js?id=GTM-PLSPTMJW"></script>
        <script dangerouslySetInnerHTML={{ __html: "window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date());" }} />
      </Head>
      <body className="min-h-full flex flex-col bg-bg text-foreground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-accent focus:px-3 focus:py-2 focus:text-black"
        >
          Skip to content
        </a>
        <FirebaseProvider>{children}</FirebaseProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
