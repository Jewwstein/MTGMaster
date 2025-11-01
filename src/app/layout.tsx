import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SessionProviderClient from "../components/session-provider";
import PreviewProvider from "../components/tabletop/PreviewProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MTGMasters",
  description: "Online Commander tabletop with decks and realtime play",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SessionProviderClient>
          <PreviewProvider>{children}</PreviewProvider>
        </SessionProviderClient>
      </body>
    </html>
  );
}
