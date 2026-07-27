# syntax=docker/dockerfile:1

# ---- build ----------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- runtime --------------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The server serves `dist/` with express.static, so only browser assets belong
# there. The server bundle lives outside it and the sourcemap is dropped, to
# avoid publishing the original TypeScript source at /server.cjs.map.
COPY --from=build /app/dist/index.html ./dist/index.html
COPY --from=build /app/dist/assets ./dist/assets
COPY --from=build /app/dist/server.cjs ./server/server.cjs

EXPOSE 3000
CMD ["node", "server/server.cjs"]
