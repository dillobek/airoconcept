export type Category = "oshxona" | "shkaf" | "mehmonxona" | "stol";
export type FurnitureShape = "cabinet" | "tall" | "table" | "tv" | "sofa";

export type CatalogItem = {
  id: string;
  category: Category;
  name: string;
  description: string;
  width: number;
  depth: number;
  height: number;
  price: number;
  shape: FurnitureShape;
  image: string;
};

export type PlacedItem = CatalogItem & {
  placementId: string;
  x: number;
  z: number;
  rotation: number;
  color: string;
};

export const CATALOG: CatalogItem[] = [
  { id: "base-cabinet", category: "oshxona", name: "Pastki shkaf", description: "60 sm, stol usti bilan", width: 0.9, depth: 0.55, height: 0.9, price: 1850000, shape: "cabinet", image: "/studio/base-cabinet.png" },
  { id: "wall-cabinet", category: "oshxona", name: "Yuqori shkaf", description: "Devorga osiladigan modul", width: 0.9, depth: 0.36, height: 0.75, price: 1450000, shape: "cabinet", image: "/studio/wall-cabinet.png" },
  { id: "column-cabinet", category: "oshxona", name: "Ustun shkaf", description: "Pech yoki sovutgich uchun", width: 0.65, depth: 0.6, height: 2.2, price: 3200000, shape: "tall", image: "/studio/tall-cabinet.png" },
  { id: "corner-cabinet", category: "oshxona", name: "Burchak moduli", description: "Oshxona burchagi uchun", width: 1.05, depth: 0.65, height: 0.9, price: 2650000, shape: "cabinet", image: "/studio/base-cabinet.png" },
  { id: "wardrobe", category: "shkaf", name: "Shkaf-kupe", description: "2 eshikli, baland modul", width: 1.45, depth: 0.62, height: 2.35, price: 4900000, shape: "tall", image: "/studio/tall-cabinet.png" },
  { id: "tv-unit", category: "mehmonxona", name: "TV tumba", description: "Past, yopiq saqlash joyi", width: 1.6, depth: 0.42, height: 0.48, price: 2450000, shape: "tv", image: "/studio/base-cabinet.png" },
  { id: "sofa", category: "mehmonxona", name: "To‘g‘ri divan", description: "3 o‘rinli yumshoq divan", width: 2.1, depth: 0.88, height: 0.82, price: 6400000, shape: "sofa", image: "/studio/sofa.png" },
  { id: "dining-table", category: "stol", name: "Ovqatlanish stoli", description: "4–6 kishilik stol", width: 1.5, depth: 0.85, height: 0.76, price: 2800000, shape: "table", image: "/studio/dining-table.png" },
];

export const CATEGORY_LABELS: Record<Category, string> = {
  oshxona: "Oshxona",
  shkaf: "Shkaflar",
  mehmonxona: "Mehmonxona",
  stol: "Stol va stullar",
};

export const MATERIALS = [
  { name: "Oq", color: "#f7f7f2" },
  { name: "Teak", color: "#af7f57" },
  { name: "Yong‘oq", color: "#75513d" },
  { name: "Grafit", color: "#38434a" },
  { name: "AIRO yashil", color: "#159b8c" },
];

export const formatMoney = (value: number) =>
  new Intl.NumberFormat("uz-UZ").format(value) + " so‘m";
