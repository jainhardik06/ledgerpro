import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LedgerPro",
    short_name: "LedgerPro",
    description: "Secure, encrypted, and designed-for-purpose financial command center.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/icons/icon-192.jpg",
        sizes: "192x192",
        type: "image/jpeg",
      },
      {
        src: "/icons/icon-512.jpg",
        sizes: "512x512",
        type: "image/jpeg",
      },
    ],
  };
}
