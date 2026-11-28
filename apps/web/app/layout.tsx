import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "[Brend nomi] — uyingizni 3D'da jihozlang",
  description: "Bo'sh uyingizni real mebellar bilan 3D'da jihozlang, taxminiy narxni darhol ko'ring va buyurtma bering.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body>
        <header className="header">
          <div className="container">
            <Link href="/" className="brand">[Brend nomi]</Link>
            <nav className="nav" aria-label="Asosiy menyu">
              <Link href="/">Bosh sahifa</Link>
              <Link href="/katalog">Katalog</Link>
              <Link href="/studiya">3D Studiya</Link>
              <Link href="/loyihalarim">Loyihalarim</Link>
            </nav>
            <Link href="/kirish" className="btn btn-dark">Kirish</Link>
          </div>
        </header>
        <main>{children}</main>
        <footer style={{ background: "#1d1c1a", color: "#c9c5bc", marginTop: 72 }}>
          <div className="container" style={{ padding: "40px 24px", fontSize: 14 }}>
            <strong style={{ color: "#fff" }}>[Brend nomi]</strong> — interyer dizayn va uylarni mebel bilan to'liq jihozlash. [Telefon raqam] · [Manzil]
          </div>
        </footer>
      </body>
    </html>
  );
}
