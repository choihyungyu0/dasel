import type { Metadata } from "next";
import StoreProvider from "@/components/Store";
import "./globals.css";

export const metadata: Metadata = {
  title: "다셀 — 오창 공장 지붕 재사용 ESS 지도",
  description: "오창 산단 공장 건물별 지붕 태양광과 재사용 배터리 ESS 설치 규모 1차 검토",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
