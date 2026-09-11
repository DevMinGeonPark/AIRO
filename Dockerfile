# AIRO Community Edition image. Build args are baked into the client bundle;
# everything else (secrets, PostgREST URL, site URL) is read at runtime.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3002
ENV NEXT_PUBLIC_AIRO_EDITION=community \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_OUTPUT_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_PUBLIC_AIRO_EDITION=community \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3002 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3002
CMD ["node", "server.js"]
