import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amazon Product + Seller Scraper",
  description: "Search products, fetch seller details, export to Excel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body>{children}</body></html>
  );
}
