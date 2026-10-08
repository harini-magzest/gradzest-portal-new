# Production image for the API. The frontend has its own image (../Dockerfile); this one is built from the server/ folder:
#
#   docker build -t gradzest-api server
#   docker run -p 5000:5000 --env-file server/.env gradzest-api      # settings: see .env.example and docs/DEPLOYMENT.md
#
# Not in the image: .env files (pass settings as environment variables from the host's secret store), the tests, and
# the uploads/quarantine folders' contents. Keep UPLOADS ON S3 (AWS_S3_BUCKET) or mount a volume at /app/uploads:
# a container's own disk is lost on every redeploy.

# ---- dependencies --------------------------------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- run -----------------------------------------------------------------------------------------------------------
FROM node:24-alpine
ENV NODE_ENV=production
# clamdscan: middleware/scanUpload.js shells out to it for every upload, and refuses the upload (503) if it is missing.
# It is only the client; the clamd daemon runs elsewhere (a ClamAV container or the host) and is reached over TCP via
# CLAMD_HOST / CLAMD_PORT (see docker-entrypoint.sh). tini reaps the clamdscan child processes.
RUN apk add --no-cache clamav-clamdscan tini
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
RUN mkdir -p uploads quarantine && chown node:node uploads quarantine
USER node
EXPOSE 5000

# /api/health answers 503 while the database is down, so this also reports "not ready". It is a Node call, not wget or
# curl: Skyload scores those user agents as scripted tools.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# Run through sh so it does not depend on the script's executable bit (a Windows checkout does not keep it).
ENTRYPOINT ["/sbin/tini", "--", "sh", "/app/docker-entrypoint.sh"]
CMD ["node", "index.js"]
