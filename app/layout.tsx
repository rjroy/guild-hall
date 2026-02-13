import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guild Hall",
  description: "Multi-agent orchestration interface",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
