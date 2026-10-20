import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/toast";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "myshowroom — Peverelli Design", template: "%s · myshowroom" },
  description: "myshowroom by Peverelli Design. Your showroom. Everywhere.",
  applicationName: "myshowroom",
  appleWebApp: { capable: true, title: "myshowroom", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/favicon-32.png", sizes: "32x32" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#FAFAF8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="min-h-dvh font-sans">
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
