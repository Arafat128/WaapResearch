import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mehidy's Waap Research Lab",
  description: "A secure Web3 dashboard for WaaP-powered send, receive, swap, bridge, and repeat actions."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
