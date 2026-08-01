import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata } from "next";
import { Playfair_Display, Manrope } from "next/font/google";
import "./globals.css";
import localFont from "next/font/local";

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});


const rcDemo = localFont({
  src: "../../public/fonts/rc.otf",
  variable: "--font-rc",
});

const agathaItalic = localFont({
  src: "../../public/fonts/agathaitalic.ttf",
  variable: "--font-agatha-italic",
});

const agathaRegular = localFont({
  src: "../../public/fonts/agatharegular.ttf",
  variable: "--font-agatha-regular",
});

export const metadata: Metadata = {
  title: "Sl Legacy | Analytics Dashboard",
  description: " ERP Suite for Jewelry Management",
};

import { ConvexClientProvider } from "@/components/ConvexClientProvider";

import { Toaster } from "sonner";

import { AuthProvider } from "@/components/AuthProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  console.log("Next.js Publishable Key:", process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return (
    <html
      lang="en"
      className={`${playfairDisplay.variable} ${manrope.variable} ${rcDemo.variable} ${agathaItalic.variable} ${agathaRegular.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ClerkProvider 
          publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
          appearance={{ elements: { footer: 'hidden' } }}
        >
          <ConvexClientProvider>
          <AuthProvider>
          {children}
          </AuthProvider>
          <Toaster position="top-center" richColors />
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}