import { Geist, Geist_Mono } from "next/font/google"
import type { Metadata } from "next"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import Script from "next/script"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "oct-daemon",
  description: "Headless host and sync daemon for Open Collaboration Tools.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        geist.variable
      )}
    >
      <body>
        <Script
          async
          defer
          src="https://umami.skxv.dev/script.js"
          data-website-id="df724323-e07c-49b5-a1f6-859d212783bb"
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
