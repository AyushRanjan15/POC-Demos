import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Speech Assessment | RL Intelligence",
  description: "Speech-based neurodisorder assessment tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-slate-50">{children}</body>
    </html>
  );
}
