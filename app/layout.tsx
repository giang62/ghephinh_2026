import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Trò chơi mini",
  description: "Trò chơi theo phòng"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
