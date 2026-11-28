/**
 * Boshlang'ich ma'lumotlar: rahbar hisobi, kategoriyalar, materiallar.
 * Ishlatish: OWNER_NAME="Sohibjon" OWNER_USERNAME=admin OWNER_PASSWORD="..." pnpm db:seed
 * Mahsulotlar va 3D modellar CRM orqali qo'shiladi.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth/password";

const prisma = new PrismaClient();

async function main() {
  const name = (process.env.OWNER_NAME ?? "Rahbar").slice(0, 80);
  const username = (process.env.OWNER_USERNAME ?? "admin").trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD ?? "";
  if (!/^[a-z0-9_.-]{3,40}$/.test(username)) throw new Error("OWNER_USERNAME noto'g'ri");
  if (password.length < 12) throw new Error("OWNER_PASSWORD kamida 12 belgidan iborat bo'lishi kerak");
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { username },
    create: { username, passwordHash, name, role: "OWNER" },
    update: { name, role: "OWNER", passwordHash, isActive: true },
  });

  const cats = [
    ["divanlar", "Divanlar"], ["kreslolar", "Kreslolar"], ["stollar", "Stollar"], ["kravatlar", "Kravatlar"],
    ["shkaflar", "Shkaflar"], ["yoritish", "Yoritish"], ["gilamlar", "Gilamlar"], ["dekor", "Dekor"], ["oshxona", "Oshxona"],
  ] as const;
  for (const [i, [slug, n]] of cats.entries()) {
    await prisma.category.upsert({ where: { slug }, create: { slug, name: n, sort: i }, update: {} });
  }

  const count = await prisma.material.count();
  if (count === 0) {
    // Narxlar namunaviy — CRM'da haqiqiy narxlarga almashtiring
    await prisma.material.createMany({
      data: [
        { kind: "WALL_PAINT", name: "Oq marvarid", colorHex: "#EEEBE5", pricePerM2Tiyin: 4_500_000n },
        { kind: "WALL_PAINT", name: "Qum", colorHex: "#E3D5C0", pricePerM2Tiyin: 4_500_000n },
        { kind: "WALL_PAINT", name: "Zaytun", colorHex: "#B9C2A8", pricePerM2Tiyin: 4_800_000n },
        { kind: "FLOOR", name: "Eman laminat", colorHex: "#B98552", pricePerM2Tiyin: 10_500_000n },
        { kind: "FLOOR", name: "Yong'oq parket", colorHex: "#7A5539", pricePerM2Tiyin: 13_000_000n },
      ],
    });
  }
  // eslint-disable-next-line no-console
  console.log("Seed tayyor. Rahbar username:", username);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
