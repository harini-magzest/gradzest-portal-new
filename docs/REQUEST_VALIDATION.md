# Request validation

API requests are checked with [Zod](https://zod.dev) before a route's handler runs (`server/middleware/validate.js`):

```js
const { validate } = require('../middleware/validate');
const { z, objectId, email, text } = require('../lib/schemas');

const inviteBody = z.object({ email, role: z.enum(['counselor', 'admin']), note: text(500).optional() }).strict();

router.post('/invites', authMiddleware, adminOnly, validate({ body: inviteBody }), async (req, res) => { ... });
```

- A failure answers `400 { message: 'Invalid request', errors: [{ field, message }] }`: field names and what is wrong,
  never the schema, the values sent or a stack trace.
- `.strict()` refuses unknown fields. Use it on every body: several admin routes used to copy the whole body into the
  database, so any field could be set.
- `req.body` is replaced by the parsed value. Params and query are checked but left as Express parsed them.
- MongoDB ids in the path: `router.param('id', idParam)` once per router turns a malformed id into a 400 for every
  route using `:id`. Only for parameters that are always ObjectIds (not universities' or countries' string ids).
- Put `validate()` after authentication and permission checks, so an anonymous caller gets 401/403, not field errors.
  For multipart uploads put it right after multer (`upload.single(...)`): a refused upload is deleted from disk.
- Shared pieces (`objectId`, `email`, `password`, `text(max)`, `textList`, `ids(...)`, `noBody`, `modelFields(schema)`)
  are in `server/lib/schemas.js`.
- `express-mongo-sanitize` still runs first, as a second layer.

## Covered so far

Auth (login, register, verification, password reset, refresh, logout, sessions), all of `/api/admin`, all of
`/api/chat`, every file upload form (student and counselor documents, chat files and recordings, Zest documents and
questions with a file), `/api/files`, and the id parameters of the student, notification, task, counselor-document
and Zest routes.

## Not covered yet

Routes that read a body, a query string or an id parameter without a schema. "id checked in handler" means a malformed
id is already refused (with a 404) by the route itself; only the body or query still needs a schema.

### activity (/api/activity) (1)
- `GET /` — query

### applications (/api/applications) (5)
- `POST /` — body
- `POST /:appId/comments` — body, id checked in handler, no schema
- `PUT /:appId` — body, id checked in handler, no schema
- `POST /check-eligibility-bulk` — body
- `POST /check-eligibility` — body

### automation (/api/automation) (7)
- `POST /templates` — body
- `PUT /templates/:id` — body, id checked in handler, no schema
- `POST /rules` — body
- `PUT /rules/:id` — body, id checked in handler, no schema
- `PUT /rules/:id/active` — body, id checked in handler, no schema
- `POST /rules/:id/run` — body, id checked in handler, no schema
- `GET /logs` — query

### counselors (/api/counselors) (2)
- `PUT /me` — body
- `GET /me/performance` — query

### countries (/api/countries) (1)
- `GET /autofill` — query

### dashboards (/api/dashboards) (2)
- `GET /admin/conversion` — query
- `GET /search` — query

### events (/api/events) (3)
- `POST /` — body
- `PUT /:id` — body, id checked in handler, no schema
- `GET /:id/registrations` — query, id checked in handler, no schema

### favicon (/api/favicon) (1)
- `GET /:domain` — id: domain

### forms (/api/forms) (3)
- `POST /` — body
- `PUT /:id` — body, id checked in handler, no schema
- `POST /public/:slug/submit` — body, id checked in handler, no schema

### meetings (/api/meetings) (5)
- `GET /` — query
- `GET /availability` — query
- `POST /book` — body
- `POST /` — body
- `PUT /:id` — body, id checked in handler, no schema

### notifications (/api/notifications) (2)
- `POST /` — body
- `PUT /preferences` — body

### onboarding (/api/onboarding) (1)
- `PUT /:step` — id: step

### privacy (/api/privacy) (3)
- `POST /deletion-request` — body
- `POST /deletion-requests/:id/complete` — body, id checked in handler, no schema
- `POST /deletion-requests/:id/decline` — body, id checked in handler, no schema

### referrals (/api/referrals) (1)
- `PUT /:id/paid` — body, id checked in handler, no schema

### roles (/api/roles) (3)
- `POST /` — body
- `PUT /assign/:userId` — body, id checked in handler, no schema
- `PUT /:id` — body, id checked in handler, no schema

### soc (/api/soc) (31)
- `GET /stats` — query
- `GET /stats/geo` — query
- `GET /events/export.csv` — query
- `GET /events` — query
- `GET /incidents` — query
- `GET /incidents/export.csv` — query
- `GET /incidents/:id` — id: id
- `GET /incidents/:id/report.pdf` — id: id
- `PATCH /incidents/bulk` — body
- `PATCH /incidents/:id` — body, id: id
- `POST /incidents/:id/notes` — body, id: id
- `GET /investigate/search-users` — query
- `GET /investigate/user/:id` — id: id
- `POST /investigate/user/:id/logout-everywhere` — id: id
- `DELETE /investigate/user/:id/sessions/:sessionId` — id: id, sessionId
- `POST /investigate/user/:id/force-password-reset` — id: id
- `POST /investigate/user/:id/lock` — body, id: id
- `GET /investigate/ip/:ip` — id: ip
- `GET /uploads` — query
- `POST /uploads/:id/quarantine` — body, id: id
- `POST /uploads/:id/review` — body, id: id
- `GET /feature-usage` — query
- `GET /ui-activity/export.csv` — query
- `GET /ui-activity` — query
- `POST /blocked-ips` — body
- `POST /blocked-ips/bulk` — body
- `DELETE /blocked-ips/:ip` — id: ip
- `POST /suppressions` — body
- `DELETE /suppressions/:id` — id: id
- `GET /audit-trail` — query
- `GET /posture` — query

### socExtras (/api/soc) (2)
- `GET /incidents/:id/detail` — id: id
- `GET /search` — query

### students (/api/students) (11)
- `PUT /me` — body
- `POST /bulk` — body
- `POST /` — body
- `PUT /:id` — body
- `POST /:id/documents` — body
- `PUT /:id/documents/:docId` — body
- `POST /:id/emails` — body
- `PUT /:id/lead-stage` — body
- `PUT /:id/meta` — body
- `POST /:id/notes` — body
- `PUT /:id/notes/:noteId` — body

### tasks (/api/tasks) (3)
- `POST /` — body
- `PUT /:id` — body
- `POST /:id/comments` — body

### uiTrail (/api/ui-trail) (1)
- `POST /` — body

### universities (/api/universities) (3)
- `GET /autofill` — query
- `GET /compare` — query
- `PUT /:id/courses/:courseId/custom` — body, id checked in handler, no schema

### users (/api/users) (4)
- `POST /profiles` — body
- `PUT /profiles/:id` — body, id checked in handler, no schema
- `POST /` — body
- `PUT /:id` — body, id checked in handler, no schema

### zest (/api/zest) (9)
- `PUT /documents/:id` — body
- `POST /ask` — body
- `POST /public/lead` — body
- `POST /followup-draft` — body
- `POST /feedback` — body
- `POST /documents/from-answer` — body
- `POST /draft-reply` — body
- `GET /analytics` — query
- `GET /query-logs` — query
