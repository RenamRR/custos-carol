# Build da imagem que o Dokploy roda. Next.js em modo standalone.
# Migração e seed vão compilados em .cjs (sem tsx na imagem final) e rodam na subida.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build \
 && npm run build:scripts

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs \
 && mkdir -p /app/backups && chown nextjs:nodejs /app/backups
# /app/backups recebe o volume do Dokploy (BACKUP_DIR). Criada aqui com dono nextjs para
# o volume novo herdar a permissão de escrita.

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/dist-scripts ./dist-scripts
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

USER nextjs
EXPOSE 3000

# Migra (pula o que já rodou) e semeia só se o banco estiver vazio; se falhar, não sobe.
CMD ["sh", "-c", "node dist-scripts/migrate.cjs && node dist-scripts/seed.cjs && exec node server.js"]
