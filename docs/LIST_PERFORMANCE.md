# How the big lists are kept fast

Several screens (the dashboards, pickers, board and app-team pages) load every student or every application at once.
This is what keeps that cheap, and what stops it silently going wrong.

Numbers are from a throwaway database with 3,000 students, old path and new path alternating in one process on the same
data (`GET /api/admin/students`, unpaged):

| | Before | After |
|---|---|---|
| Whole student records | 3.4 s | 0.48 s |
| `?fields=name,email` | 0.75 s | 0.06 s |
| Applications, flattened | 1.9 s | 0.23 s |

## 1. Responses are gzipped
`server/app.js` mounts `compression`. JSON shrinks by about 95% (a 391 kB university list is 13 kB). The Zest event
stream (`text/event-stream`) is excluded on purpose: the encoder buffers, and the answer would arrive in one lump.
Covered by `server/test/compression.test.js`.

## 2. `?fields=` asks for only what a screen reads
`GET /api/admin/students` and `GET /api/students` (unpaged) accept `?fields=name,email`. The server then loads and
returns only those fields (`server/lib/fieldSelect.js`). Secrets (`password`, `sessions`, tokens, `twoFactor`,
`counselorNotes`) can never be selected, whatever is asked.

From the client: `api.admin.students({ fields: ['name', 'email'] })`. Before narrowing a page, find every field it reads.
`src/utils/eligibility.ts` exports `ELIGIBILITY_STUDENT_FIELDS` for pages that only run the eligibility checks, and
`src/utils/eligibility.test.ts` fails if a check starts reading a field that is not in it.

### Pages that ask for fields, and how that is kept honest
Six pages ask for exactly the fields they read: `BoardOverview`, `BoardDocuments`, `BoardCounselors`,
`AppTeamDashboard`, `CounselorDashboard` and `CounselorStudents`. Each was cleared by reading its code with the
TypeScript compiler (a record that is handed to code the analysis cannot see counts as "not provable" and the page is
left alone) and cross-checked by rendering it with every student wrapped in a recording proxy.

`src/pages/studentFieldReads.test.tsx` keeps that true: it renders each page and fails if it reads a student field it
did not request. If a page starts using another field, add it to that page's `fields` list in the same change.

The other dashboards (`AdminDashboard`, `AdminCounselors`, `AdminChat`, `AdminMeetings`, `AppTeamStudents`,
`AppTeamCounselors`, `AppTeamApplications`, `BoardStudents`, `MeetingPanel`, `CounselorMeetings`,
`AdminCounselorPerformance`) hand whole records to child components, spread them (`{ ...student }`) or pass them to code
in other files, so what they read cannot be proven from the page. They still load whole records, now read quickly.

## 3. Lists are read as plain objects
Loading thousands of Mongoose documents and calling `toJSON()` on each is most of what a list costs.
`server/lib/studentList.js` reads them with `.lean()` and `server/lib/leanDoc.js` rebuilds the same JSON from the
schema: defaults, `minimize`, the `id` virtual, and the model's own `toJSON` transform (so secrets are stripped by the one
place that already strips them).

It does **not** cast values to the schema type. A value stored with the wrong type is returned as stored.

### What keeps it honest
- `server/test/leanDoc.test.js` builds hundreds of randomly shaped student records straight from the schema (fields
  missing, nested objects empty, arrays absent, encrypted values, secrets stored) and requires the fast path to equal
  Mongoose's own `toJSON()` for every one. If the User model changes in a way the fast path does not follow, this fails.
  A bigger or different sweep: `LEANDOC_SEED=42 LEANDOC_COUNT=2000 npx vitest run server/test/leanDoc.test.js`.
- `server/test/studentListRoutes.test.js` calls the real routes and compares them with what loading whole documents gives,
  including the PII audit trail.
- A dotted selection (`?fields=englishScore.score`) narrows inside a subdocument, which the plain-object path does not
  model; it is read as documents.

### If you add a field to the User model
Usually nothing: defaults come from the schema. If `leanDoc.test.js` fails, the message names the first field that
differs. The two things the fast path cannot infer are casts and getters; avoid relying on them for fields that appear
in these lists.

## 4. The audit trail is written in one batch
Listing students as a counselor records who looked at whose personal data. `logPiiAccessBatch`
(`server/lib/logPiiAccess.js`) writes those entries in chunks and runs the bulk-access rule once afterwards (the rule
counts distinct applicants, so it reaches the same verdict). A list narrowed with `?fields=` is audited only for the
sensitive fields it actually selected.

## 5. Encryption results are remembered
`server/lib/fieldCrypto.js` keeps a bounded cache of recent encrypt/decrypt results. The cipher is deterministic by
design, so a repeat is a map lookup instead of about 75 µs of HMAC and AES-GCM. Failures are never cached.

## 6. The student page's counts and countries are cached against a write counter
`adminLists.studentPage` needs the tab counts and the country list, each of which reads every student. They are
remembered while no user has been written (`server/lib/userVersion.js` counts every Mongoose write). The TTL is only a
backstop for writes this process cannot see (another instance, a script). The one raw write in the app, erasing a
student, bumps the counter itself. Off under `NODE_ENV=test` unless a test turns it on.

## Measuring
The benchmark used for the numbers above seeds a throwaway in-memory database and times the real endpoints. Compare
**alternating** old and new in one process: this repository lives in a synced folder and shares a machine with other
work, so absolute timings drift by several times between runs.
