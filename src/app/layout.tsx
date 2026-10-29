import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: { default: "TFOMS Time", template: "%s · TFOMS Time" },
  description: "Учёт внеурочного времени и планирование отпусков ТФОМС",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
