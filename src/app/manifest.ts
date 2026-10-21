import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "myshowroom by Peverelli Design",
    short_name: "myshowroom",
    description: "Your showroom. Everywhere. Prodotti, disponibilità e persone in un unico spazio.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#FFFFFF",
    theme_color: "#FFFFFF",
    lang: "it",
    categories: ["business", "productivity", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Prodotti", url: "/prodotti", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Showroom & Stock", url: "/stock", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Agenda", url: "/agenda", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Nuovo preventivo", url: "/preventivi/nuovo", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
