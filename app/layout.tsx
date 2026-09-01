import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { StuckRecovery } from "@/components/pwa/StuckRecovery";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PRUMAC Connect",
  description: "PRUMAC Connect — fleet management for Ensign Holdings",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "PRUMAC" },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1220",
};


/**
 * Boot watchdog — inline on purpose.
 *
 * A wedged service worker is self-sealing: the fix lives inside the worker, but
 * a driver stuck on the launch splash can never load the page that would
 * replace it. Drivers reported waiting 45 minutes and giving up.
 *
 * This runs from the HTML itself, so it still fires when no JavaScript chunk
 * ever arrives. If the app has not booted in time it removes the worker, drops
 * its caches and reloads from the network. Offline support is rebuilt on the
 * next visit; a phone that never opens the app is worth far less.
 */
const BOOT_WATCHDOG = `
(function(){try{
  var KEY='prumac:unstick', WAIT=25000, COOLDOWN=120000;
  var t=setTimeout(function(){
    if(window.__prumacBooted) return;
    var last=0; try{ last=+(sessionStorage.getItem(KEY)||0); }catch(e){}
    if(Date.now()-last<COOLDOWN) return;      // never loop
    try{ sessionStorage.setItem(KEY,String(Date.now())); }catch(e){}
    var go=function(){ location.reload(); };
    if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){
      navigator.serviceWorker.getRegistrations()
        .then(function(rs){ return Promise.all(rs.map(function(r){return r.unregister();})); })
        .then(function(){ return caches&&caches.keys?caches.keys().then(function(ks){
          return Promise.all(ks.map(function(k){return caches.delete(k);})); }):null; })
        .then(go,go);
    } else { go(); }
  }, WAIT);
  window.__prumacBooted=false;
  window.__prumacCancelWatchdog=function(){ window.__prumacBooted=true; clearTimeout(t); };
}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_WATCHDOG }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors position="top-right" />
        <ServiceWorkerRegister />
        <StuckRecovery />
        <InstallPrompt />
      </body>
    </html>
  );
}
