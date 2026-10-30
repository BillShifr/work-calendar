# syntax=docker/dockerfile:1.7
FROM node:26.13.0-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:26.13.0-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM dependencies AS migrator
ARG VCS_REF=development
LABEL org.opencontainers.image.revision=$VCS_REF
COPY db ./db
COPY scripts ./scripts
COPY tsconfig.json ./
CMD ["npm", "run", "db:migrate"]

FROM node:26.13.0-alpine AS runtime
ARG VCS_REF=development
LABEL org.opencontainers.image.revision=$VCS_REF
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
