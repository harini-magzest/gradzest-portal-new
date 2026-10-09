# Production image for the web app: build once, serve the generated dist/ with nginx. No Node, no Vite and no source in the
# final image, so the dev server cannot be reached and /src or /@vite/client simply do not exist.
#
#   docker build --build-arg VITE_API_URL=https://api.example.com -t gradzest-web .
#   docker run -p 8080:8080 gradzest-web
#
# (The API in server/ is deployed separately; this image is the frontend only.)

# ---- build ---------------------------------------------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The API address is baked into the bundle and into the Content-Security-Policy (connect-src) by `npm run build`.
# Leave it empty only if the API is served from the same host.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
# `npm run build` = tsc + vite build + scripts/finalize-dist.mjs, which FAILS the build if dist/ is not safe to publish.
RUN npm run build && node scripts/headers-to-nginx.mjs dist /tmp/security-headers.conf

# ---- serve ---------------------------------------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine
USER root
RUN mkdir -p /etc/nginx/snippets
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /tmp/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
