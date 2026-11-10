import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ForenSys Review Hub",
  description: "The ForenSys digital employee review cycle.",
  icons: {
    icon: "/forensys-logo.png",
    shortcut: "/forensys-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
