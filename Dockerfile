FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173

COPY server.mjs index.html styles.css ./
COPY server/ ./server/
COPY src/ ./src/
COPY assets/ ./assets/

USER node

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD ["node", "--input-type=module", "-e", "try { const response = await fetch('http://127.0.0.1:' + (process.env.PORT || 4173) + '/', { signal: AbortSignal.timeout(4000) }); process.exit(response.ok ? 0 : 1); } catch { process.exit(1); }"]

CMD ["node", "server.mjs"]
