FROM node:22-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/content-model/package.json packages/content-model/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile

COPY apps/server apps/server
COPY packages/content-model packages/content-model
COPY packages/contracts packages/contracts
RUN pnpm --filter @obsidian-feed/server build

FROM node:22-slim AS runtime

ENV NODE_ENV=production
ENV PORT=43110
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/data/feed.sqlite
ENV DATA_DIR=/data
WORKDIR /app

RUN mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/apps/server/dist ./dist
COPY --from=build --chown=node:node /app/apps/server/drizzle ./drizzle

USER node
EXPOSE 43110
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:43110/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
