# Gradzest Portal

Study-abroad consultancy platform: student, counselor and admin portals, a Security Operations Center (SOC), and Zest, the in-app AI assistant.

- **Web app:** React + Vite + TypeScript (`src/`), served on port 5173
- **API:** Node + Express + MongoDB (`server/`), served on port 5000

## Setting up your own machine

**Do not ask for someone else's `server/.env`.** That file holds the live database login, the secret that signs logins, and the key that decrypts student data. Everyone develops against their *own* database with their *own* keys, so a mistake on one machine can never expose real student data.

### 1. Install

You need a current Node.js (the project is developed on Node 24) and either a free MongoDB Atlas cluster or MongoDB installed locally.

```bash
git clone https://github.com/harini-magzest/Gradzest-Portol.git
cd Gradzest-Portol
npm install
cd server && npm install && cd ..
```

### 2. Create your `.env`

```bash
cp server/.env.example server/.env        # Windows PowerShell: copy server\.env.example server\.env
```

`server/.env` is git-ignored. Never commit it, and never paste its contents into chat, email, a doc or a screenshot.

Fill in these values yourself:

| Setting | What to put |
|---|---|
| `MONGODB_URI` | **Your own** database: a free Atlas cluster (atlas.mongodb.com → create a free cluster → Connect → Drivers) or `mongodb://127.0.0.1:27017/gradzest-dev`. **Never** the live `magzest` database. |
| `JWT_SECRET` | Any long random string (see below). |
| `DATA_ENCRYPTION_KEY` | Exactly 64 hex characters (see below). |
| `FRONTEND_URL` | `http://localhost:5173` |
| `SOC_OWNER_EMAILS` | Your own email, if you want to open the SOC. |
| `GEMINI_API_KEY` | **Your own** free key from Google AI Studio (aistudio.google.com → Get API key). Optional: Zest simply says it isn't configured without it. |

Generate the two secrets with Node (works on Windows, Mac and Linux). Run it twice, once for each:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Email (`SMTP_*`) and Google sign-in (`GOOGLE_*`) can stay blank for local work. Email won't send and Google login won't work. That also means a brand-new sign-up can't verify its email address, so log in with the seeded demo accounts (step 3) instead of registering new ones.

### 3. Run it

```bash
npm run dev
```

The API starts on http://localhost:5000 and the web app on http://localhost:5173.

To create demo accounts in **your own** dev database:

```bash
cd server && npm run seed
```

The seed script creates accounts with well-known demo passwords. Run it only against a database that holds nothing real, and never against a shared or live one.

### 4. Check your work

```bash
npm test         # backend tests, with an in-memory database (nothing real is touched)
npm run test:ui  # front-end component tests
npm run build    # type-check and production build

npm run verify:quick  # type-check + lint (about half a minute)
npm run verify        # type-check, lint, front-end tests and backend tests, stopping at the first failure
```

`npm run verify` is the gate CI applies, minus the production build and the API Docker image (run `npm run build` too if you touched build config, `vite.config.ts` or `scripts/`).

The tests never use your real `.env` model keys, and they use their own throwaway database.

## Zest (the AI assistant)

Zest answers from the uploaded knowledge base, the university catalogue and role-scoped live data. It needs one model key: `ANTHROPIC_API_KEY` (preferred) or `GEMINI_API_KEY` (free tier).

- The free Gemini tier is limited (about 20 requests a day per Google project for the main model) and Google may use free-tier prompts to improve its products. Use only invented test data with it, never real student records.
- `node server/scripts/zestEval.js` runs a set of realistic questions against the real model on a throwaway database. It uses a lot of requests. Do not run it repeatedly on the free tier.

## Handling secrets

- Keys live in `server/.env` on your own machine, nowhere else.
- If a key is ever pasted somewhere it shouldn't be, rotate it at the provider straight away (delete the old key, make a new one). Cleaning up afterwards does not make an exposed key safe again.
- If you need a shared secret for a specific task (for example the SMTP password to test email), get it through a password manager's secure share, never over chat.
- Tell the repository owner if you suspect a leak. Nobody will be blamed, and the faster it's reported, the cheaper it is to fix.

## Checks and merging

Every pull request into `main` runs automatic checks (`.github/workflows/ci.yml`): **lint**, **typecheck-build**, **backend-tests**, **ui-tests** and **api-image**. They are the same commands as step 4 above (plus `npm run lint`), so run those locally before you open the pull request (`npm run verify` does them in one go). If CI cannot start (the GitHub Actions spending limit or a failed payment makes every job fail instantly, before any step runs), `npm run verify` on the merged result is the substitute: do not merge on a red or missing check without it. `npm run lint` fails on errors and on any warning at all (the ceiling in `package.json` is `--max-warnings 0`). Fix the warning; when a React effect is deliberately run-once or run-on-change, say why with an `// eslint-disable-next-line react-hooks/exhaustive-deps` comment above it, and ESLint will flag that comment if the effect is ever fixed and it is no longer needed.

- **Update your branch before merging.** `git fetch origin && git merge origin/main`, then fix conflicts by reading *both* sides. A branch built from an old snapshot can silently overwrite newer work on `main` when it is merged, and the checks only catch it if you run them on the merged result.
- **Don't share one working folder.** Two people (or two tools) committing in the same checkout can reset each other's branch and wipe uncommitted work. Use separate clones, or `git worktree add ../my-work -b my-branch origin/main`.
- **For a repository admin, once:** Settings → Branches → add a rule for `main` → *Require a pull request before merging* and *Require status checks to pass before merging* (select the checks above) → *Require branches to be up to date before merging*. Without this rule the checks only warn; they don't block.
