# Ko'p bosqichli build: yakuniy image'da faqat ishlash uchun keraklilar, root bo'lmagan foydalanuvchi.
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @ip/core build \
 && pnpm --filter @ip/api prisma:generate \
 && pnpm --filter @ip/api build \
 && pnpm deploy --filter @ip/api --prod /out \
 && cp -r apps/api/dist /out/dist \
 && cp -r apps/api/prisma /out/prisma

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 4000
CMD ["sh", "-c", "npx prisma generate && npx prisma db push --skip-generate && node dist/main.js"]
