FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @ip/core build \
 && pnpm --filter @ip/bot build \
 && pnpm deploy --filter @ip/bot --prod /out \
 && cp -r apps/bot/dist /out/dist

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /out /app
USER node
CMD ["node", "dist/index.js"]
