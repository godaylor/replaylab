FROM node:22.15.1-bookworm-slim AS build
WORKDIR /source
COPY .yarn/ .yarn/
COPY . .
RUN node .yarn/releases/yarn-4.18.0.cjs install --immutable --mode=skip-build
RUN node .yarn/releases/yarn-4.18.0.cjs workspace @replaylab/foundation-proof build \
  && node .yarn/releases/yarn-4.18.0.cjs workspace @replaylab/foundation-proof build:server

FROM node:22.15.1-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=32400 REPLAYLAB_DATA_DIR=/data
WORKDIR /app
COPY --from=build --chown=node:node /source/packages/replaylab/foundation/dist/ /app/dist/
COPY --from=build --chown=node:node /source/packages/replaylab/foundation/server-dist/ /app/server-dist/
COPY --from=build --chown=node:node /source/node_modules/yjs/ /app/node_modules/yjs/
COPY --from=build --chown=node:node /source/node_modules/lib0/ /app/node_modules/lib0/
COPY --from=build --chown=node:node /source/node_modules/ws/ /app/node_modules/ws/
COPY --from=build --chown=node:node /source/node_modules/fractional-indexing/ /app/node_modules/fractional-indexing/
COPY --from=build --chown=node:node /source/node_modules/isomorphic.js/ /app/node_modules/isomorphic.js/
COPY --from=build --chown=node:node /source/LICENSE /source/LICENSE-MIT /app/dist/legal/
COPY --from=build --chown=node:node /source/packages/replaylab/foundation/evidence/THIRD_PARTY_NOTICES.md /source/packages/replaylab/foundation/evidence/slice7-license-inventory.json /source/packages/replaylab/foundation/evidence/slice7-sbom.cdx.json /source/packages/replaylab/foundation/evidence/slice7-source-notices.json /app/dist/legal/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 32400
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:32400/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server-dist/server-entry.js"]
