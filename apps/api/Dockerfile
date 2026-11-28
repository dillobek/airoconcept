# Ko'p bosqichli build: yakuniy image'da faqat ishlash uchun keraklilar, root bo'lmagan foydalanuvchi.
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @ip/core build \
 && pnpm --filter @ip/api prisma:generate \
 && pnpm --filter @ip/api build

FROM node:22-alpine
WORKDIR /repo/apps/api
ENV NODE_ENV=production
# pnpm workspace symlinks resolve through the repository-level store.  Copy the
# built workspace intact so Nest's runtime dependencies remain available.
COPY --from=build --chown=node:node /repo /repo
USER node
EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main.js"]
