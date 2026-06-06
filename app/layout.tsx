import type { Metadata } from "next";
import { SpeedInsights } from '@vercel/speed-insights/next';
import "./globals.css";

export const metadata: Metadata = {
  title: "Mehidy's Waap Research Lab",
  description: "A secure Web3 dashboard for WaaP-powered send, receive, swap, bridge, and repeat actions."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>
        {/* Four independent sparkle layers so each color drifts at its own
            speed and direction. See globals.css `.waap-sparkles`. */}
        <div className="waap-sparkles" aria-hidden="true">
          <div className="waap-sparkle-layer waap-sparkle-cyan" />
          <div className="waap-sparkle-layer waap-sparkle-gold" />
          <div className="waap-sparkle-layer waap-sparkle-pink" />
          <div className="waap-sparkle-layer waap-sparkle-white" />
        </div>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
