# syntax=docker/dockerfile:1

# ---- build ----------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# The build has no .git to ask, so the commit is handed in. `npm run deploy`
# passes it; a bare `fly deploy` stamps the build "unknown" rather than lying.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

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
# From public/: the service worker that shows review reminders when the app is
# closed, plus the icon and manifest index.html references. These were missing
# from the image, so /favicon.svg and /manifest.json were 404s in production.
COPY --from=build /app/dist/sw.js ./dist/sw.js
COPY --from=build /app/dist/favicon.svg ./dist/favicon.svg
COPY --from=build /app/dist/manifest.json ./dist/manifest.json
# Which commit this image was built from; served at /version.json.
COPY --from=build /app/dist/version.json ./dist/version.json
COPY --from=build /app/dist/server.cjs ./server/server.cjs

EXPOSE 3000
CMD ["node", "server/server.cjs"]
