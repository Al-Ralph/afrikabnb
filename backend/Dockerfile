FROM node:20-alpine

# Moteurs Prisma sur Alpine
RUN apk add --no-cache openssl

ENV NODE_ENV=production
WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
# prisma (CLI) est en dependencies : nécessaire à `migrate deploy` au démarrage.
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node prisma ./prisma/
RUN npx prisma generate

COPY --chown=node:node src ./src/

EXPOSE 4000

# Applique uniquement les migrations versionnées (via DIRECT_URL, obligatoire) ; `exec` transmet
# SIGTERM à Node (arrêt propre).
CMD ["sh", "-c", "npx prisma migrate deploy && exec node src/index.js"]
