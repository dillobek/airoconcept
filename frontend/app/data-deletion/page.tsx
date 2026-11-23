import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Ma'lumotlarni o'chirish — AiroConcept" };

// Meta App sozlamalarida "User Data Deletion" → "Data deletion instructions URL" sifatida shu sahifa beriladi.
export default function DataDeletion() {
  return (
    <LegalPage title="Ma'lumotlarni o'chirish">
      <p>Biz bilan yozishmalaringiz va kontakt ma'lumotlaringizni o'chirishni so'rashingiz mumkin:</p>
      <ol className="list-decimal space-y-2 pl-6">
        <li>Instagram, Facebook yoki Telegram orqali bizga «Ma'lumotlarimni o'chiring» deb yozing, yoki</li>
        <li>[EMAIL] manziliga ismingiz va telefon raqamingizni ko'rsatib xat yuboring.</li>
      </ol>
      <p>So'rov 30 kun ichida bajariladi va natijasi haqida sizga xabar beriladi.</p>
      <p>
        Amaldagi shartnoma bo'yicha qonun talab qiladigan hujjatlar (masalan, to'lov hujjatlari) qonunda belgilangan
        muddat davomida saqlanadi.
      </p>
    </LegalPage>
  );
}
