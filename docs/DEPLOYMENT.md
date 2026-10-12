# Deploying Gradzest to production

The production website is the **built** `dist/` folder: static files, no Node process, no Vite. If `https://your-domain/@vite/client`
or `https://your-domain/src/main.tsx` ever returns JavaScript or source code, the domain is pointing at the **development server**
(`npm run dev` / `vite`) and must be switched immediately: the dev server serves your unbuilt source, does not enforce the
security headers, and is not meant to face the internet.

## 1. Build

```bash
VITE_API_URL=https://api.your-domain.com npm run build
```

`npm run build` runs `tsc`, `vite build`, then `scripts/finalize-dist.mjs` (npm runs it automatically as `postbuild`). The last
step **fails the build** if `dist/` contains any of: source maps, `/src` or `@vite` references, React Fast Refresh code, inline
`<script>`, `eval`/`new Function`, Google Fonts links, hidden or config files, or a weakened header policy. It also writes your API
address into the Content-Security-Policy. If `VITE_API_URL` is empty the CSP allows `'self'` only (API on the same host).

Never put a secret in a `VITE_*` variable: everything with that prefix is copied into the public JavaScript.

## 2. Serve `dist/` (pick one)

### A. Static host: Cloudflare Pages, Netlify
* Build command `npm run build`, output directory `dist`, environment variable `VITE_API_URL`.
* `dist/_headers` (built from `public/_headers`) sets the security headers; `dist/_redirects` makes React Router routes work.
* Do **not** set a start command and do not deploy the repository root.

### B. Your own server: nginx in Docker
```bash
docker build --build-arg VITE_API_URL=https://api.your-domain.com -t gradzest-web .
docker run -p 8080:8080 gradzest-web          # put TLS (Caddy, a load balancer, Cloudflare) in front
```
The image holds only nginx and `dist/`. `deploy/nginx.conf` returns **404** for `/src`, `/node_modules`, `/server`, hidden files,
`*.map`, config files and `/@vite`, `/@react-refresh`, `/@fs`, `/@id`; unknown paths fall back to `index.html`. Its security headers
are generated from `public/_headers` by `scripts/headers-to-nginx.mjs`, so there is one policy, not two copies.

### C. Without Docker
Copy `dist/` to the web root, use `deploy/nginx.conf` as the server block, and generate the header include once per build:
`node scripts/headers-to-nginx.mjs dist /etc/nginx/snippets/security-headers.conf`.

`npm run preview` serves the built `dist/` too, but it is a local check, not a production server.

## 3. The API (`server/`)
Run it with `npm start` (sets `NODE_ENV=production`) behind HTTPS. Required settings (see `server/.env.example`): `MONGODB_URI`,
`JWT_SECRET`, `FILE_URL_SECRET`, `DATA_ENCRYPTION_KEY`, `FRONTEND_URL` (exactly the website origin: CORS and cookies depend on it)
and `TRUST_PROXY` for your proxy setup. Keep these in the host's secret store; the `.env` file is git-ignored and must never be in an
image or repo.

Before the first production deploy, and whenever a server is rebuilt, work through
[SECURITY_DEPLOY_CHECKLIST.md](SECURITY_DEPLOY_CHECKLIST.md): secrets, HTTPS, MongoDB Atlas, firewall, ClamAV, monitors and the
first admin account, each with a command that verifies it.

### As a container
```bash
docker build -t gradzest-api server
docker run -p 5000:5000 --env-file server/.env gradzest-api
```
`server/Dockerfile` installs production dependencies only, runs as the unprivileged `node` user and has a health check on
`/api/health` (503 while the database is down). CI builds it on every pull request (`api-image`).

* **Uploads:** a container's disk is lost on redeploy. Set `AWS_S3_BUCKET`, or mount a volume at `/app/uploads`.
* **Virus scanning:** the upload scanner calls `clamdscan` and **refuses every upload (503) if it cannot scan**. The image contains
  the client only; run the `clamd` daemon elsewhere (a ClamAV container or the host) and set `CLAMD_HOST` (and `CLAMD_PORT`,
  default 3310). The entrypoint writes the client config from those two. Without `CLAMD_HOST` it uses `/etc/clamav/clamd.conf`.

### Running more than one API instance
Not yet fully supported. What is covered:

* **Scheduled jobs:** every instance runs all of them, so reminders and digests would go out once per instance. Set `RUN_JOBS=false`
  on every instance except one.
* **Request log:** ordinary requests are written to Mongo in batches every `REQUEST_LOG_FLUSH_MS` (default 2000; `0` writes each
  at once). 401/403/429 rows are always written immediately because the suspicious-IP rule counts them.

What is still per instance: live notifications and chat (Socket.io has no shared adapter, so a message only reaches users connected
to the same instance), Skyload's per-IP scoring, and local uploads. Until those move to Redis and S3, run one instance, or keep
users on one instance with sticky sessions and store uploads in S3.

## 4. Verify a deployment
```bash
# 1. The dev server must not be there. Each of these must NOT return JavaScript or source (a static host's single-page
#    fallback answers with the HTML app shell, starting with <!doctype html>; nginx answers 404):
curl -s https://your-domain/@vite/client | head -c 80
curl -s https://your-domain/src/main.tsx | head -c 80
curl -s -o /dev/null -w "%{http_code}\n" https://your-domain/.env           # 404 (or the HTML shell on a static host)
curl -s -o /dev/null -w "%{http_code}\n" https://your-domain/package.json   # 404 (or the HTML shell on a static host)

# 2. No source maps
curl -s -o /dev/null -w "%{http_code}\n" https://your-domain/assets/<any-built-file>.js.map

# 3. Headers
curl -sI https://your-domain/ | grep -iE "content-security-policy|strict-transport|x-content-type|referrer-policy|permissions-policy|x-frame"
```
In a browser's DevTools console on the live site there must be no "Content Security Policy" violations, and the Network tab must
show no request to `fonts.googleapis.com` or `fonts.gstatic.com`.

## 5. Content-Security-Policy notes
`script-src 'self'` and `style-src 'self'`: no `'unsafe-inline'`, no `'unsafe-eval'`. The build needs neither, and
`scripts/finalize-dist.mjs` fails the build if either appears, if `index.html` has an inline `<script>`/`<style>`/`style=`, or if a
bundle contains a real `eval()` / `new Function()` call. (Bundled libraries keep a `Function("return this")()` fallback for finding the
global object; it is never reached in a browser and is the one pattern the check allows.) React's inline `style={{...}}` props are
applied through the DOM and are not blocked by `style-src`.

Documented wide settings: `img-src https:` (university logos, flags and uploaded images come from several HTTPS hosts; an image
cannot run code), and `frame-src` for the Google document viewer, the API origin and `*.amazonaws.com` (document previews).
`connect-src` is `'self'` plus the API origin from `VITE_API_URL`. Add a host only when a feature needs it.

If you add a component that renders a `<style>` element or uses `dangerouslySetInnerHTML` with style attributes, put the CSS in a
`.css` file and import it instead (see `src/components/NamasteIntro.css`).
