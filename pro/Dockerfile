# Oddshot Pro: one bundled file on Node 24 (its built-in SQLite holds the watch and the scorecard).
# Build the bundle first: pnpm -C pro build  →  pro/dist/server.mjs   (`pnpm -C pro deploy` builds and ships it to Railway)
# Mount a persistent volume at /data, or every restart forgets the calls and the scorecard. The host mounts it (Railway, Fly), so
# there is no VOLUME line (Railway refuses one) and the process runs as root, because hosted volumes are mounted root-owned.
FROM node:24-slim
WORKDIR /app
COPY dist/server.mjs ./server.mjs
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 PRO_DB=/data/pro.db
EXPOSE 8080
CMD ["node", "server.mjs"]
