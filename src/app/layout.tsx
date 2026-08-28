import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import { Providers } from "@/app/components/Providers";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

const display = IBM_Plex_Serif({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ScholarReach — Research outreach for students",
  applicationName: "ScholarReach",
  description:
    "ScholarReach helps students discover faculty, draft personalized research emails from their own Gmail, schedule academic-window sends, and track professor replies in a private workspace.",
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/scholarreach-mark.png", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
  verification: {
    google:
      process.env.GOOGLE_SITE_VERIFICATION ||
      "U2zmStviN-onNwcuImdTdo-Lt1iflXPkxbUOwHAt0NU",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(display.variable, sans.variable)}>
      <body className="font-sans antialiased">
        <Providers>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
