# Security deployment checklist

Settings that live outside the code: the server, the load balancer, MongoDB Atlas, GitHub. Work through it once when
deploying the security changes (the `nithin-security-audit` branch and the four that build on it), then again whenever a
server is rebuilt.

Each item has the steps and a command that proves it is done. Commands marked **PowerShell** run on your own machine;
commands marked **server** run on the API host and assume Linux (systemd, ufw). Replace `api.example.com` and
`app.example.com` with the real API and website hosts.

Already handled in the repository (no action): the frontend image runs nginx as a non-root user and sends HSTS and the
other security headers (`Dockerfile`, `deploy/nginx.conf`, `public/_headers`); `npm start` in `server/` sets
`NODE_ENV=production`; CI and the Docker build use Node 24 from `.nvmrc`.

## 1. Secrets: JWT_SECRET and FILE_URL_SECRET

`JWT_SECRET` signs sign-in tokens. `FILE_URL_SECRET` signs the five-minute links the app uses to open uploaded files.
Both must be at least 32 random characters, must not be the placeholder text from `.env.example`, and must be different
from each other. In production the API refuses to start otherwise.

1. Generate two values, one per secret:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
2. Put them in the API host's secret store or environment (never in git, never in a `VITE_*` variable).
3. Restart the API.

**Rotate** when a value may have leaked (it was pasted in chat, committed, or on a laptop that was lost), when someone who
had access to it leaves, and otherwise once a year.
- Rotating `JWT_SECRET` invalidates current access tokens. Browsers silently get a new one with their refresh cookie
  (refresh tokens are random values stored hashed in the database, not signed with this secret), so nobody is logged out.
  To sign everyone out as well, clear the sessions: `db.users.updateMany({}, { $set: { sessions: [], sessionsRevokedAt: new Date() } })`.
- Rotating `FILE_URL_SECRET` breaks file links opened in the last five minutes; opening the file again works.

**Verify** (server, in the API's environment):
```bash
cd server && node scripts/checkEnv.js     # must end with "All required environment variables are set."
```
and the API log after a restart shows no `FILE_URL_SECRET ...` or `JWT_SECRET ...` error.

## 2. NODE_ENV=production on the API

Start the API with `npm start` (in `server/`), which sets `NODE_ENV=production`. If a process manager starts
`node index.js` directly, set `NODE_ENV=production` in its environment. Production mode is what enables the start-up secret
checks, the `Secure` flag on the sign-in cookie, the refusal to load demo data and the legacy-link switch-off.

**Verify:**
- The API log at start-up ends with `Server running on port 5000 [production]`.
- **PowerShell**, signing in with a real account; the cookie must say `Secure`:
  ```powershell
  $body = @{ email = 'you@magzest.in'; password = (Read-Host 'Password') } | ConvertTo-Json
  (Invoke-WebRequest -Uri https://api.example.com/api/auth/login -Method Post -ContentType 'application/json' -Body $body).Headers['Set-Cookie']
  ```

## 3. HTTPS: TLS at the load balancer, HSTS, redirect, no TLS 1.0/1.1

TLS ends at the load balancer or reverse proxy in front of the API and the website (nothing in this repository terminates
TLS: `deploy/nginx.conf` listens on plain 8080 behind it).

1. Serve both hosts over HTTPS with a valid certificate.
2. Redirect every `http://` request to `https://` with a 301, at the load balancer.
3. Allow TLS 1.2 and 1.3 only. AWS ALB: security policy `ELBSecurityPolicy-TLS13-1-2-2021-06`. Cloudflare: SSL/TLS →
   Edge Certificates → Minimum TLS Version 1.2. nginx: `ssl_protocols TLSv1.2 TLSv1.3;`.
4. HSTS is already sent by both apps (`max-age=31536000; includeSubDomains`). Do not strip it at the proxy.
5. Set `TRUST_PROXY` on the API to the number of proxies in front of it (default `1`) so rate limits and the SOC see real
   client IPs.

**Verify (PowerShell):**
```powershell
curl.exe -sI http://app.example.com | findstr /i "HTTP/ Location"          # 301 and Location: https://...
curl.exe -sI https://api.example.com/api/health | findstr /i strict-transport
curl.exe -sI https://app.example.com | findstr /i strict-transport
curl.exe -sS -o NUL --tls-max 1.1 https://api.example.com/api/health      # must FAIL with an SSL/TLS error
```
For a full report, run both hosts through https://www.ssllabs.com/ssltest/ (target grade A).

## 4. MongoDB Atlas

1. **Network Access**: delete `0.0.0.0/0` if present. Allow only the API server's outbound IP addresses.
2. **Database Access**: the app connects as its own user with only the built-in role `readWrite` on `magzest`. No
   `atlasAdmin`, `dbAdminAnyDatabase` or `readWriteAnyDatabase`. People use separate accounts with MFA, never the app's.
3. `MONGODB_URI` on the API uses that app user.
4. Scripts that touch production (`createAdmin.js`, `rotateDemoAccounts.js`) run on the API server, which is on the
   allow-list. If one must run from a laptop, add that IP temporarily and remove it straight after.

**Verify:**
```bash
# server: only readWrite on magzest
mongosh "$MONGODB_URI" --quiet --eval 'printjson(db.runCommand({ connectionStatus: 1 }).authInfo.authenticatedUserRoles)'
```
```powershell
# PowerShell, from a machine that is NOT on the allow-list: must time out, not connect
mongosh "<the app's connection string>" --quiet --eval "db.runCommand({ ping: 1 })"
```

## 5. Server firewall

Inbound: 80 and 443 to the load balancer only. The API port (5000) only from the load balancer or localhost. SSH (22) only
from your admin IP addresses or VPN, key-based, with `PermitRootLogin no` and `PasswordAuthentication no` in
`/etc/ssh/sshd_config`. If the host is a cloud VM, set the same rules in its security group as well.

**Verify:**
```powershell
Test-NetConnection api.example.com -Port 5000     # TcpTestSucceeded : False
Test-NetConnection api.example.com -Port 22       # False from any network that is not an admin network
```
```bash
sudo ufw status verbose                            # server: only the rules above
sudo ss -tlnp                                      # server: what is listening, and on which address
```

## 6. ClamAV (virus scanning of uploads)

Uploads are scanned before they are saved and **fail closed**: if ClamAV is not running, every upload answers "File
scanning is temporarily unavailable". So it must run, and keep its signatures current.

1. Install and enable `clamav-daemon` and `clamav-freshclam` (Debian/Ubuntu package names).
2. If `clamdscan` or the clamd config are not in the default places, set `CLAMDSCAN_BIN` and `CLAMD_CONFIG` for the API.

**Verify (server):**
```bash
systemctl is-active clamav-daemon clamav-freshclam    # active, active
clamdscan --version                                   # the date at the end is the signature date: today or yesterday
printf '%s' 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/eicar.txt
clamdscan --no-summary /tmp/eicar.txt                 # /tmp/eicar.txt: <signature name> FOUND
```
Then through the app: as a test student, upload that EICAR file as a document. Expected: "This file was flagged as
malicious and was not uploaded", and an incident in the SOC. (Do this from the server or a machine whose own antivirus
will not delete the test file first.)

## 7. Health monitors

`GET /api/health` no longer includes `env` or `uptime`. It answers `200 {"status":"ok","db":"connected",...}`, or `503` with
`"status":"degraded"` when the database is unreachable. Update any uptime monitor that matched on `env`: check for HTTP 200
and the text `"status":"ok"`.

**Verify (PowerShell):**
```powershell
curl.exe -s https://api.example.com/api/health      # {"status":"ok","db":"connected","timestamp":"..."}
```

## 8. The first admin, and the old demo accounts

A fresh production database no longer gets demo accounts. Create the first real admin on the API server:
```bash
cd server
ADMIN_EMAIL=you@magzest.in ADMIN_NAME="Your Name" node scripts/createAdmin.js
```
It prints a generated password once; store it in your password manager. Set `ADMIN_PASSWORD` instead to choose one (at
least 12 characters with upper case, lower case and a digit). It refuses an email that already exists.

The four demo accounts whose passwords were in the source code (and so are still in git history) must be rotated or
removed on every database that has them:
```bash
cd server
node scripts/rotateDemoAccounts.js            # dry run: shows the accounts and what would change
node scripts/rotateDemoAccounts.js --apply    # new random passwords (printed once), every session signed out
# or: node scripts/rotateDemoAccounts.js --delete --apply
```

**Verify:** sign in with the new admin; signing in as `admin@eduabroad.com` with its old password fails.

## 9. Switching file links over

1. Deploy with `FILE_URL_SECRET` set (section 1) and `ALLOW_LEGACY_UPLOAD_TOKENS=true`, so tabs still running the
   previous frontend (which sends a download-only file token in `?token=`) can open files.
2. After a day, remove `ALLOW_LEGACY_UPLOAD_TOKENS` (off is the production default) and restart.

**Verify (PowerShell):** an old-style link is refused once the flag is gone.
```powershell
curl.exe -s -o NUL -w "%{http_code}`n" "https://api.example.com/uploads/any-file.pdf?token=anything"    # 401
```

## 10. Node 24 on the API host

CI and the frontend build use Node 24 (`.nvmrc`). Run the API on the same major.

**Verify (server):** `node -v` prints `v24.x`.

## 11. GitHub: require the checks before merging

`main` broke in October 2026 because Dependabot pull requests were merged while CI was failing. Turn on branch protection
for `main` (Settings → Branches → Add rule): "Require a pull request before merging" and "Require status checks to pass",
selecting `typecheck-build`, `backend-tests`, `ui-tests`, `secret-scan`, `dep-audit (.)`, `dep-audit (server)`, `sast` and
`actionlint`.

**Verify:** open a pull request with a failing test; the merge button stays disabled.

## 12. Optional: tokens already in logs

Two kinds of log hold credentials from before these changes:
- The app's request log (the `requestlogs` collection, shown in the SOC) stored email-verification links with their token.
  A verification token stops working once used or after it expires.
- Load balancer and reverse proxy access logs stored `/uploads/...?token=` URLs, which contained sign-in tokens. Those
  expired 15 minutes after they were issued.

Neither is usable now, but neither needs keeping. Shorten the proxy log retention to what you need, and in `mongosh`, on the
production database:
```js
db.requestlogs.countDocuments({ path: /[?&]token=/ })   // how many
db.requestlogs.deleteMany({ path: /[?&]token=/ })       // remove them
```
