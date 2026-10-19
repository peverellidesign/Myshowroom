import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "myshowroom by Peverelli Design",
    short_name: "myshowroom",
    description: "Your showroom. Everywhere.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAFAF8",
    theme_color: "#FAFAF8",
    lang: "it",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
