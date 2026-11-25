import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import "./globals.css";

export const metadata: Metadata = {
  title: "AiroConcept — buyurtma asosida mebel Toshkentda",
  description:
    "Oshxona, shkaf-kupe, garderob, yotoqxona va ofis mebellari buyurtma asosida. Bepul zamer, 3D dizayn, kafolat.",
  openGraph: { title: "AiroConcept — buyurtma mebel", locale: "uz_UZ", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body className="bg-white text-stone-900 antialiased">
        <header className="sticky top-0 z-10 border-b border-brand/15 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
            <Link href="/" aria-label="AiroConcept bosh sahifa"><BrandLogo /></Link>
            <nav className="flex items-center gap-6 text-sm">
              <Link href="/studio" className="font-semibold text-brand-deep hover:text-wood">AIRO Studio</Link>
              <a href="/#xizmatlar" className="hover:text-wood">Xizmatlar</a>
              <a href="/#nega-biz" className="hover:text-wood">Nega biz</a>
              <a href="/#zamer" className="rounded-full bg-walnut px-4 py-2 text-white hover:bg-brand-ink">Bepul zamer</a>
            </nav>
          </div>
        </header>
        {children}
        <footer className="mt-24 bg-walnut text-stone-300">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-6 px-5 py-10 text-sm">
            <div>
              <BrandLogo light />
              <div>Buyurtma asosida mebel · Toshkent</div>
            </div>
            <div className="flex gap-5">
              <Link href="/privacy" className="hover:text-white">Maxfiylik siyosati</Link>
              <Link href="/terms" className="hover:text-white">Foydalanish shartlari</Link>
              <Link href="/data-deletion" className="hover:text-white">Ma'lumotlarni o'chirish</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
