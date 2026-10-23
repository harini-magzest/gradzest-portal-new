// The SOC API, mounted at /api/soc in app.js. One file per area of the dashboard; every route in them is behind
// authMiddleware + adminOnly (the SOC owner gate in shared.js), which test/socOwnerOnly.test.js checks route by route.
// Mounted in this order on purpose: it is the order the routes had when they were one file, so a fixed path such as
// /incidents/export.csv is still tried before /incidents/:id.
const express = require('express');
const { adminOnly } = require('./shared');
const { summariseAudit } = require('./posture');

const router = express.Router();

router.use(require('./stats'));
router.use(require('./events'));
router.use(require('./incidents'));
router.use(require('./investigate'));
router.use(require('./uploads'));
router.use(require('./activity'));
router.use(require('./blocking'));
router.use(require('./audit'));
router.use(require('./posture'));
router.use(require('./extras'));

module.exports = router;
module.exports.adminOnly = adminOnly;
module.exports.summariseAudit = summariseAudit; // exported for its test
