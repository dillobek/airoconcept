import Link from "next/link";
import { LeadForm } from "@/components/LeadForm";

const SERVICES = [
  { title: "Oshxona", text: "O'lchamingizga mos, har bir santimetr ishlatilgan oshxona garniturasi." },
  { title: "Shkaf-kupe", text: "Ko'zgu, LDSP yoki akril fasad, ichki to'ldirish sizning narsalaringizga moslab." },
  { title: "Garderob", text: "Kiyimlar tartibda: tortmalar, polkalar, shtangalar — hammasi rejalashtirilgan." },
  { title: "Yotoqxona", text: "Krovat, tumbalar va shkaf bitta uslubda." },
  { title: "Bolalar xonasi", text: "Xavfsiz materiallar, o'sib boruvchi mebel." },
  { title: "Ofis mebeli", text: "Ish o'rinlari, qabulxona va rahbar kabineti." },
];

const WHY = [
  { n: "0 so'm", t: "Zamer bepul", d: "Usta uyingizga keladi, o'lchaydi va maslahat beradi." },
  { n: "3D", t: "Dizayn", d: "Ishlab chiqarishdan oldin mebelni 3D ko'rinishda ko'rasiz." },
  { n: "Shartnoma", t: "Muddat va narx", d: "Narx, material va muddat shartnomada yoziladi." },
  { n: "Kafolat", t: "Sifat", d: "Mebel va furnituraga rasmiy kafolat." },
];

export default function Home() {
  return (
    <main>
      <section className="bg-sand">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2 md:py-28">
          <div>
            <p className="mb-3 text-sm font-medium uppercase tracking-wider text-wood">Buyurtma asosida mebel</p>
            <h1 className="text-4xl font-semibold leading-tight text-walnut md:text-5xl">
              Uyingizga aynan mos mebel — o'lchab, chizib, o'z vaqtida o'rnatamiz
            </h1>
            <p className="mt-5 text-lg text-stone-600">
              Oshxona, shkaf va garderoblar. Bepul zamer, 3D dizayn va narxi shartnomada qat'iy belgilanadi.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/studio" className="inline-block rounded-full bg-walnut px-7 py-3.5 font-semibold text-white hover:bg-brand-ink">
                Xonamni jihozlash
              </Link>
              <a href="#zamer" className="inline-block rounded-full border border-brand px-7 py-3.5 font-semibold text-brand-deep hover:bg-brand-soft">
                Bepul zamer
              </a>
            </div>
          </div>
          <div className="flex items-center">
            <div className="grid w-full grid-cols-2 gap-4">
              {WHY.map((w) => (
                <div key={w.t} className="rounded-2xl bg-white p-5 shadow-sm">
                  <div className="text-2xl font-semibold text-wood">{w.n}</div>
                  <div className="mt-1 font-medium">{w.t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="xizmatlar" className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-3xl font-semibold text-walnut">Nimalar yasaymiz</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => (
            <div key={s.title} className="rounded-2xl border border-stone-200 p-6">
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-stone-600">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="nega-biz" className="bg-walnut text-white">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-3xl font-semibold">Nega aynan biz</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-4">
            {WHY.map((w) => (
              <div key={w.t}>
                <div className="text-wood">{w.t}</div>
                <p className="mt-2 text-stone-300">{w.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="zamer" className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold text-walnut">Bepul zamerga yoziling</h2>
            <p className="mt-4 text-stone-600">
              Raqamingizni qoldiring — menejerimiz qo'ng'iroq qilib, sizga qulay vaqtni kelishib oladi. Zamer hech
              narsaga majburlamaydi.
            </p>
          </div>
          <LeadForm />
        </div>
      </section>
    </main>
  );
}
