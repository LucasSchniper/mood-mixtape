import type { Metadata } from "next";
import { Montserrat, Geist_Mono } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mood Mixtape 🎧",
  description: "Describí tu mood y una IA te arma una playlist al toque.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`dark ${montserrat.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col relative overflow-x-hidden">
        <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-background">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,oklch(0.4_0.16_300_/_0.35),transparent)]" />
          <div className="absolute -left-40 top-1/4 h-[30rem] w-[30rem] rounded-full bg-primary/25 blur-[120px] animate-glow-pulse" />
          <div
            className="absolute -right-32 bottom-0 h-[26rem] w-[26rem] rounded-full bg-accent/20 blur-[120px] animate-glow-pulse"
            style={{ animationDelay: "2s" }}
          />
          <div className="absolute inset-0 bg-grid opacity-[0.12] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
        </div>
        {children}
      </body>
    </html>
  );
}
