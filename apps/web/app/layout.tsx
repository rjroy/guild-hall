import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import DaemonStatus from "@/apps/web/components/ui/DaemonStatus";
import "./globals.css";
import "./guild.css";

const fontDisplay = localFont({
  src: "./fonts/IM_Fell_English_SC/IMFellEnglishSC-Regular.ttf",
  variable: "--font-display-local",
  display: "swap",
  weight: "400",
});

const fontVollkorn = localFont({
  src: [
    {
      path: "./fonts/Vollkorn/Vollkorn-VariableFont_wght.ttf",
      style: "normal",
    },
    {
      path: "./fonts/Vollkorn/Vollkorn-Italic-VariableFont_wght.ttf",
      style: "italic",
    },
  ],
  variable: "--font-vollkorn-local",
  display: "swap",
});

const fontMono = localFont({
  src: [
    {
      path: "./fonts/JetBrains_Mono/JetBrainsMono-VariableFont_wght.ttf",
      style: "normal",
    },
    {
      path: "./fonts/JetBrains_Mono/JetBrainsMono-Italic-VariableFont_wght.ttf",
      style: "italic",
    },
  ],
  variable: "--font-mono-local",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Guild Hall",
  description: "Multi-agent workspace for delegating work to AI specialists",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${fontDisplay.variable} ${fontVollkorn.variable} ${fontMono.variable}`}
    >
      <body>
        <DaemonStatus>
          <div style={{ minHeight: "100vh" }}>{children}</div>
        </DaemonStatus>
      </body>
    </html>
  );
}
