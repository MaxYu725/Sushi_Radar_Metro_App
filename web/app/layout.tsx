import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "候位 Metro｜香港壽司郎排隊",
  description: "經管理員授權後查閱香港壽司郎分店輪候組數及最新叫號。",
  applicationName: "候位 Metro",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "候位 Metro",
    description: "香港壽司郎輪候資料查詢",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-HK">
      <body>{children}</body>
    </html>
  );
}
