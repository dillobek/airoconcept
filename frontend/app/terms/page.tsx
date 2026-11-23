import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Foydalanish shartlari — AiroConcept" };

// Namunaviy matn — yurist bilan tekshiring.
export default function Terms() {
  return (
    <LegalPage title="Foydalanish shartlari">
      <p>
        Sayt va chat orqali berilgan narxlar taxminiy hisoblanadi. Yakuniy narx, material va muddat zamerdan keyin
        tuziladigan shartnomada belgilanadi.
      </p>
      <p>Bepul zamer mijozni buyurtma berishga majburlamaydi.</p>
      <p>Avtomatlashtirilgan yordamchi javoblari ma'lumot uchun; rasmiy majburiyatlar faqat shartnomada.</p>
      <p className="pt-4 text-sm text-stone-500">[MChJ NOMI, MANZIL, STIR]</p>
    </LegalPage>
  );
}
