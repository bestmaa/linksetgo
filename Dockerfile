FROM node:26.8.1-alpine AS base

ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs relay

FROM base AS prod-deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS migrator
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps --chown=relay:nodejs /app/node_modules ./node_modules
COPY --chown=relay:nodejs package.json package-lock.json tsconfig.json ./
COPY --chown=relay:nodejs scripts ./scripts
COPY --chown=relay:nodejs src ./src

USER relay
CMD ["npm", "run", "migrate"]

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
ARG NEXT_PUBLIC_APP_ENV=Production
ARG NEXT_PUBLIC_DATABASE_LABEL=linksetgo

# Payload evaluates its config during `next build`. These deliberately unusable,
# non-secret values only satisfy build validation and never enter the runner.
ENV DATABASE_URL=postgresql://relay_build:relay_build@127.0.0.1:5432/relay_build
ENV PAYLOAD_SECRET=relay-build-placeholder-never-use-at-runtime
ENV EVENT_HASH_SECRET=relay-event-placeholder-never-use-runtime
ENV PUBLIC_LINK_BASE_URL=http://127.0.0.1:3000
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV
ENV NEXT_PUBLIC_DATABASE_LABEL=$NEXT_PUBLIC_DATABASE_LABEL

RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/public ./public
RUN mkdir .next && chown relay:nodejs .next
COPY --from=builder --chown=relay:nodejs /app/.next/standalone ./
COPY --from=builder --chown=relay:nodejs /app/.next/static ./.next/static

USER relay

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/ready').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
