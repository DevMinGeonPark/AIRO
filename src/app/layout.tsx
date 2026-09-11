import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./mobile.css";
import "./trip-workspace.css";
import "lenis/dist/lenis.css";
import { LandingMotionProvider } from "@/components/landing/motion-system";
import { MobileViewport } from "@/components/mobile-viewport";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-visual",
  themeColor: "#0A0A0A",
};

// Geist — aside 계열 UI 의 기본 얼굴. create-next-app 이 깔아준 걸 그대로 쓴다.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "아이로 AIRO — 어디로든, AI와 함께.",
  applicationName: "아이로 AIRO",
  metadataBase: new URL("https://airo.dev-heptivision.com"),
  openGraph: { type: "website", locale: "ko_KR", siteName: "아이로 AIRO", images: [{ url: "/gen/og-image.jpg", width: 1200, height: 630, alt: "교토의 아침, 나만의 여행을 준비하는 책상" }] },
  twitter: { card: "summary_large_image", images: ["/gen/og-image.jpg"] },
  description: "AI와 함께 만드는 나만의 여행. 지도, 일정, 맛집과 예산을 아이로에서 한 번에 준비하세요.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: 아래 인라인 스크립트가 하이드레이션 전에 html
    // 클래스를 바꾼다. 그 불일치는 의도된 것이다.
    <html
      lang="ko"
      suppressHydrationWarning
      className={`dark ${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        {/* 저장된 테마를 첫 페인트 전에 적용해 깜빡임을 없앤다. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              // Dark by default, including SSR and blocked storage. An explicit light choice wins.
              `try{var d=localStorage.theme!=="light";document.documentElement.classList.toggle("dark",d);document.documentElement.classList.toggle("light",!d)}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-background text-foreground antialiased"><MobileViewport /><LandingMotionProvider>{children}</LandingMotionProvider></body>
    </html>
  );
}
