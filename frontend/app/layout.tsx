import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lucina",
  description: "Lucina — your life agent for memory and action.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
