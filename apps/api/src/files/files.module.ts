import { Body, Controller, ForbiddenException, Get, Inject, Injectable, Module, NotFoundException, Param, Post } from "@nestjs/common";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { ENV, type Env } from "../config/env";
import { AuthUser, CurrentUser, Public, ZodPipe } from "../common/http";

/**
 * Fayl yuklash: klient faylni to'g'ridan-to'g'ri S3/MinIO ga yuklaydi (server orqali emas),
 * lekin kalit (yo'l), turi va hajmi SERVERDA belgilanadi va imzolanadi.
 * Mijoz fayl nomi yo'lda ishlatilmaydi (path traversal yo'q).
 */
const PURPOSES = {
  product_image: { mimes: ["image/jpeg", "image/png", "image/webp"], maxMb: 10, staff: true, public: true },
  product_model_glb: { mimes: ["model/gltf-binary"], maxMb: 30, staff: true, public: true },
  product_model_usdz: { mimes: ["model/vnd.usdz+zip"], maxMb: 40, staff: true, public: true },
  home_plan: { mimes: ["application/pdf", "image/jpeg", "image/png", "application/dxf", "image/vnd.dwg"], maxMb: 50, staff: false, public: false },
  receipt: { mimes: ["image/jpeg", "image/png", "application/pdf"], maxMb: 10, staff: true, public: false },
  render: { mimes: ["image/jpeg", "image/png", "image/webp"], maxMb: 20, staff: true, public: false },
} as const;
type Purpose = keyof typeof PURPOSES;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "model/gltf-binary": "glb", "model/vnd.usdz+zip": "usdz",
  "application/pdf": "pdf", "application/dxf": "dxf", "image/vnd.dwg": "dwg",
};

const UploadDto = z.object({
  purpose: z.enum(Object.keys(PURPOSES) as [Purpose, ...Purpose[]]),
  mime: z.string().max(60),
  sizeBytes: z.number().int().min(1).max(60 * 1024 * 1024),
});

@Injectable()
export class FilesService {
  private readonly s3: S3Client;
  constructor(private readonly prisma: PrismaService, @Inject(ENV) private readonly env: Env) {
    this.s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }

  async createUpload(user: AuthUser, dto: z.infer<typeof UploadDto>) {
    const rule = PURPOSES[dto.purpose];
    if (rule.staff && user.role === "CLIENT") throw new ForbiddenException();
    if (!(rule.mimes as readonly string[]).includes(dto.mime)) throw new ForbiddenException("Fayl turi ruxsat etilmagan");
    if (dto.sizeBytes > rule.maxMb * 1024 * 1024) throw new ForbiddenException(`Fayl ${rule.maxMb} MB dan katta`);
    const visibility = rule.public ? "public" : "private";
    const key = `${visibility}/${dto.purpose}/${user.id}/${randomUUID()}.${EXT[dto.mime]}`;
    const cmd = new PutObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key, ContentType: dto.mime, ContentLength: dto.sizeBytes });
    // Imzo ContentType va ContentLength ni ham qamrab oladi — boshqa turdagi/hajmdagi fayl yuklab bo'lmaydi
    const url = await getSignedUrl(this.s3, cmd, { expiresIn: 300, signableHeaders: new Set(["content-type", "content-length"]) });
    await this.prisma.fileObject.create({ data: { key, ownerId: user.id, mime: dto.mime, sizeBytes: dto.sizeBytes, purpose: dto.purpose } });
    return { key, uploadUrl: url, method: "PUT", headers: { "Content-Type": dto.mime }, expiresIn: 300 };
  }

  /** Yopiq fayl (reja, chek) faqat egasi yoki rahbar/menejer/buxgalterga, 5 daqiqalik havola bilan */
  async downloadUrl(user: AuthUser, id: string) {
    const f = await this.prisma.fileObject.findUnique({ where: { id } });
    if (!f) throw new NotFoundException();
    const privileged = ["OWNER", "MANAGER", "ACCOUNTANT", "DESIGNER"].includes(user.role);
    if (f.ownerId !== user.id && !privileged) throw new NotFoundException();
    const url = await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: f.key }), { expiresIn: 300 });
    return { url, expiresIn: 300 };
  }
}

@Controller("files")
export class FilesController {
  constructor(private readonly svc: FilesService) {}
  @Post("uploads")
  upload(@CurrentUser() u: AuthUser, @Body(new ZodPipe(UploadDto)) dto: z.infer<typeof UploadDto>) {
    return this.svc.createUpload(u, dto);
  }
  @Get(":id/url")
  url(@CurrentUser() u: AuthUser, @Param("id", new ZodPipe(z.string().cuid())) id: string) {
    return this.svc.downloadUrl(u, id);
  }
}

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  }
}

@Module({ controllers: [FilesController, HealthController], providers: [FilesService] })
export class FilesModule {}
