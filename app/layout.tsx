import type { Metadata } from "next";
import { Barlow_Semi_Condensed, IBM_Plex_Sans_KR } from "next/font/google";
import StoreProvider from "@/components/Store";
import "./globals.css";

const body = IBM_Plex_Sans_KR({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-body", display: "swap" });
const readout = Barlow_Semi_Condensed({ weight: ["500", "600"], subsets: ["latin"], variable: "--font-readout", display: "swap" });

export const metadata: Metadata = {
  title: "다셀 — 오창 공장 지붕 재사용 ESS 지도",
  description: "오창 산단 공장 건물별 지붕 태양광과 재사용 배터리 ESS 설치 규모 1차 검토",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${body.variable} ${readout.variable}`}>
      <body className="bg-[#e9edf1] text-ink antialiased">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
