import { Body, Controller, Get, Inject, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ENV, type Env } from "../config/env";
import { Public, Roles, ZodPipe, tiyin } from "../common/http";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug: kichik lotin harflari, raqam va '-'").max(80);
const fileKey = z.string().regex(/^[a-zA-Z0-9/_.-]{1,200}$/).refine((k) => !k.includes(".."), "yo'l noto'g'ri");

const ListQuery = z.object({
  category: slug.optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

const ProductDto = z.object({
  slug,
  name: z.string().trim().min(2).max(120),
  description: z.string().max(4000).default(""),
  categoryId: z.string().cuid(),
  priceTiyin: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  widthCm: z.number().int().min(1).max(2000),
  depthCm: z.number().int().min(1).max(2000),
  heightCm: z.number().int().min(1).max(1000),
  productionType: z.enum(["READY_MADE", "CUSTOM"]).default("READY_MADE"),
  modelGlbKey: fileKey.nullable().optional(),
  modelUsdzKey: fileKey.nullable().optional(),
  imageKeys: z.array(fileKey).max(12).default([]),
  isPublished: z.boolean().default(false),
  variants: z
    .array(z.object({ name: z.string().trim().min(1).max(60), colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(), priceDeltaTiyin: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).default(0), modelGlbKey: fileKey.nullable().optional() }))
    .max(30)
    .default([]),
});
const ProductPatch = ProductDto.partial().omit({ variants: true });

const CategoryDto = z.object({ slug, name: z.string().trim().min(2).max(60), parentId: z.string().cuid().nullable().optional(), sort: z.number().int().min(0).max(9999).default(0) });

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService, @Inject(ENV) private readonly env: Env) {}

  private url(key: string | null | undefined) {
    return key ? `${this.env.S3_PUBLIC_URL}/${key}` : null;
  }

  private present(p: Prisma.ProductGetPayload<{ include: { variants: true; category: true } }>) {
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      category: { slug: p.category.slug, name: p.category.name },
      priceTiyin: tiyin(p.priceTiyin),
      dimensionsCm: { width: p.widthCm, depth: p.depthCm, height: p.heightCm },
      productionType: p.productionType,
      modelGlbUrl: this.url(p.modelGlbKey),
      modelUsdzUrl: this.url(p.modelUsdzKey),
      images: p.imageKeys.map((k) => this.url(k)),
      variants: p.variants.map((v) => ({ id: v.id, name: v.name, colorHex: v.colorHex, priceTiyin: tiyin(p.priceTiyin + v.priceDeltaTiyin), modelGlbUrl: this.url(v.modelGlbKey) })),
      isPublished: p.isPublished,
    };
  }

  async list(q: z.infer<typeof ListQuery>, includeUnpublished = false) {
    const where: Prisma.ProductWhereInput = {
      ...(includeUnpublished ? {} : { isPublished: true }),
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.q ? { name: { contains: q.q, mode: "insensitive" } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({ where, include: { variants: true, category: true }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, items: rows.map((r) => this.present(r)) };
  }

  async bySlug(slugValue: string, includeUnpublished = false) {
    const p = await this.prisma.product.findUnique({ where: { slug: slugValue }, include: { variants: true, category: true } });
    if (!p || (!p.isPublished && !includeUnpublished)) throw new NotFoundException("Mahsulot topilmadi");
    return this.present(p);
  }

  categories() {
    return this.prisma.category.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }], select: { id: true, slug: true, name: true, parentId: true } });
  }

  materials() {
    return this.prisma.material
      .findMany({ where: { isPublished: true }, orderBy: { name: "asc" } })
      .then((rows) => rows.map((m) => ({ id: m.id, kind: m.kind, name: m.name, colorHex: m.colorHex, pricePerM2Tiyin: tiyin(m.pricePerM2Tiyin) })));
  }

  async create(dto: z.infer<typeof ProductDto>) {
    const { variants, priceTiyin, ...rest } = dto;
    const p = await this.prisma.product.create({
      data: {
        ...rest,
        priceTiyin: BigInt(priceTiyin),
        variants: { create: variants.map((v) => ({ name: v.name, colorHex: v.colorHex ?? null, priceDeltaTiyin: BigInt(v.priceDeltaTiyin), modelGlbKey: v.modelGlbKey ?? null })) },
      },
      include: { variants: true, category: true },
    });
    return this.present(p);
  }

  async update(id: string, dto: z.infer<typeof ProductPatch>) {
    const { priceTiyin, ...rest } = dto;
    const p = await this.prisma.product.update({
      where: { id },
      data: { ...rest, ...(priceTiyin !== undefined ? { priceTiyin: BigInt(priceTiyin) } : {}) },
      include: { variants: true, category: true },
    });
    return this.present(p);
  }

  createCategory(dto: z.infer<typeof CategoryDto>) {
    return this.prisma.category.create({ data: { ...dto, parentId: dto.parentId ?? null } });
  }
}

@Controller("catalog")
export class CatalogController {
  constructor(private readonly svc: CatalogService) {}

  @Public() @Get("products")
  list(@Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.svc.list(q);
  }

  @Public() @Get("products/:slug")
  get(@Param("slug", new ZodPipe(slug)) s: string) {
    return this.svc.bySlug(s);
  }

  @Public() @Get("categories")
  categories() {
    return this.svc.categories();
  }

  @Public() @Get("materials")
  materials() {
    return this.svc.materials();
  }

  // --- Boshqaruv (CRM) ---
  @Roles("OWNER", "MANAGER", "SUPPLY") @Get("admin/products")
  adminList(@Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.svc.list(q, true);
  }

  @Roles("OWNER", "MANAGER", "SUPPLY") @Post("admin/products")
  create(@Body(new ZodPipe(ProductDto)) dto: z.infer<typeof ProductDto>) {
    return this.svc.create(dto);
  }

  @Roles("OWNER", "MANAGER", "SUPPLY") @Patch("admin/products/:id")
  update(@Param("id", new ZodPipe(z.string().cuid())) id: string, @Body(new ZodPipe(ProductPatch)) dto: z.infer<typeof ProductPatch>) {
    return this.svc.update(id, dto);
  }

  @Roles("OWNER", "MANAGER") @Post("admin/categories")
  createCategory(@Body(new ZodPipe(CategoryDto)) dto: z.infer<typeof CategoryDto>) {
    return this.svc.createCategory(dto);
  }
}

@Module({ controllers: [CatalogController], providers: [CatalogService], exports: [CatalogService] })
export class CatalogModule {}
