# Build from the repository root.
FROM node:24-bookworm-slim AS build
WORKDIR /build/app/workers/fake-generation

COPY app/workers/fake-generation/package.json app/workers/fake-generation/package-lock.json ./
RUN npm ci

COPY app/workers/fake-generation/tsconfig.json ./
COPY app/workers/fake-generation/src/ ./src/
COPY app/workers/fake-generation/fixtures/ ./fixtures/
COPY app/src/lib/docs.schema.ts app/src/lib/reasoning.schema.ts app/src/lib/document-log.ts /build/app/src/lib/
# Let the shared schema use the worker dependencies.
RUN ln -s workers/fake-generation/node_modules /build/app/node_modules \
    && npm run build

FROM node:24-bookworm-slim AS dependencies
WORKDIR /srv/worker
COPY app/workers/fake-generation/package.json app/workers/fake-generation/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-bookworm-slim AS runtime
WORKDIR /srv/worker
ENV NODE_ENV=production

COPY --from=dependencies /srv/worker/package.json ./package.json
COPY --from=dependencies /srv/worker/node_modules/ ./node_modules/
COPY --from=build /build/app/workers/fake-generation/dist/ ./dist/
COPY --from=build /build/app/workers/fake-generation/fixtures/ ./fixtures/

USER node
CMD ["node", "dist/index.js"]
