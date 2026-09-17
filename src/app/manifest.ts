import type { MetadataRoute } from "next";

/** 홈 화면 설치용 웹 앱 매니페스트. 네이티브 앱은 따로 만들 예정이라 오프라인·푸시는 넣지 않는다. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "아이로 AIRO",
    short_name: "아이로",
    description: "AI와 함께 만드는 나만의 여행. 지도, 일정, 맛집과 예산을 한 번에.",
    id: "/app",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
    lang: "ko",
    categories: ["travel", "navigation", "productivity"],
    icons: [
      { src: "/icons/airo-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/airo-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/airo-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
