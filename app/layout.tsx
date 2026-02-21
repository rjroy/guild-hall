import type { Metadata } from "next";
import DaemonStatus from "@/components/ui/DaemonStatus";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guild Hall",
  description: "Multi-agent workspace for delegating work to AI specialists",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div style={{ minHeight: "100vh" }}>{children}</div>
        <DaemonStatus />
      </body>
    </html>
  );
}
