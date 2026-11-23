import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Maxfiylik siyosati — AiroConcept" };

// DIQQAT: bu namunaviy matn. E'lon qilishdan oldin MChJ yuristi bilan tekshiring va
// kompaniya rekvizitlarini kiriting. Meta App uchun Privacy Policy URL sifatida shu sahifa beriladi.
export default function Privacy() {
  return (
    <LegalPage title="Maxfiylik siyosati">
      <p>
        AiroConcept (keyingi o'rinlarda — «Kompaniya») mijozlar bilan Instagram, Facebook, Telegram va sayt orqali
        yozishishda olinadigan shaxsiy ma'lumotlarni qanday ishlatishini ushbu siyosat tushuntiradi.
      </p>
      <h2 className="pt-4 text-xl font-semibold">Qanday ma'lumotlar olinadi</h2>
      <p>Ism, telefon raqami, ijtimoiy tarmoqdagi foydalanuvchi identifikatori, yozishmalar matni, zamer manzili.</p>
      <h2 className="pt-4 text-xl font-semibold">Nima uchun ishlatiladi</h2>
      <p>
        Faqat buyurtmani qabul qilish, zamer va o'rnatishni tashkil etish hamda mijoz bilan bog'lanish uchun.
        Ma'lumotlar uchinchi shaxslarga sotilmaydi.
      </p>
      <h2 className="pt-4 text-xl font-semibold">Avtomatlashtirilgan javoblar</h2>
      <p>
        Xabarlarga dastlab sun'iy intellekt yordamchisi javob berishi mumkin. Istalgan payt menejer bilan
        gaplashishni so'rashingiz mumkin.
      </p>
      <h2 className="pt-4 text-xl font-semibold">Saqlash va himoya</h2>
      <p>
        Ma'lumotlar himoyalangan serverlarda, O'zbekiston Respublikasining «Shaxsga doir ma'lumotlar to'g'risida»gi
        qonuni talablariga muvofiq saqlanadi.
      </p>
      <h2 className="pt-4 text-xl font-semibold">Ma'lumotlarni o'chirish</h2>
      <p>
        Ma'lumotlaringizni o'chirish uchun <a className="underline" href="/data-deletion">ushbu sahifadagi</a> yo'riqnomadan
        foydalaning.
      </p>
      <p className="pt-4 text-sm text-stone-500">Aloqa: [EMAIL VA TELEFONNI KIRITING] · [MChJ NOMI VA STIR]</p>
    </LegalPage>
  );
}
