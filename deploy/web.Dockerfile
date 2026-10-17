# syntax=docker/dockerfile:1
# The web app and the front door: Caddy serves the app's static build, proxies /api to the API
# servers, and gets HTTPS certificates. Build from the repository root:
#   docker build -f deploy/web.Dockerfile --build-arg PUBLIC_URL=https://play.example.com -t baghchal-web .

FROM node:22-alpine AS build
ARG PUBLIC_URL
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app ./
# The app and the API share one origin, so the API's address is the site's address. A release
# build refuses plain http (see app/src/apiUrl.js).
ENV EXPO_PUBLIC_API_URL=${PUBLIC_URL} EXPO_NO_TELEMETRY=1
RUN test -n "$PUBLIC_URL" && npm run export:web

FROM caddy:2.10-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv/app
