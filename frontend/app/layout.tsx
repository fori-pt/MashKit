import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MashKit — BPM & Key Analyzer",
  description: "Analyze tracks, find matches, and create mashups",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-coal text-foam antialiased">
        {children}
      </body>
    </html>
  );
}
