FROM node:22.15.1-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=32400 REPLAYLAB_DATA_DIR=/data
WORKDIR /app
COPY --chown=node:node packages/replaylab/foundation/release-dist/ /app/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 32400
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:32400/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server-dist/server-entry.js"]
