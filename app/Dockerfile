# Build from the repository root: docker build -f app/Dockerfile -t fabrique .
FROM node:24-bookworm-slim AS build
WORKDIR /build/app

COPY app/package.json app/package-lock.json ./
RUN npm ci

COPY app/ ./
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
ENV NITRO_PRESET=node-server
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /srv/app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    EXPLORER_DIR=/srv/explorer \
    PDF_DIR=/srv/data/pdf

COPY --from=build /build/app/.output/ ./.output/
COPY explorer/ /srv/explorer/
COPY data/pdf/ /srv/data/pdf/

USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
