# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -r /var/lib/apt/lists

FROM base AS dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -r /var/lib/apt/lists
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY next.config.ts postcss.config.mjs tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY public ./public
RUN JEFFVENTORY_STANDALONE=1 npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM base AS runtime
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_URL=file:/data/inventory.db \
    UPLOAD_DIR=/data/uploads
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Prisma's migration CLI is not part of Next's application dependency tracing.
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build /app/prisma/migrations ./prisma/migrations
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY docker/entrypoint.sh docker/healthcheck.mjs ./docker/
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["node", "docker/healthcheck.mjs"]
ENTRYPOINT ["sh", "docker/entrypoint.sh"]
CMD ["node", "server.js"]
