// Short-lived links to uploaded files (see lib/fileLinks.js).
const express = require('express');
const fs = require('fs');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const { canAccessUpload } = require('../lib/fileAccess');
const { signedUploadPath, isStoredName } = require('../lib/fileLinks');
const { sendServerError } = require('../lib/httpError');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// POST /api/files/:name/link — a link to one stored file (/uploads/<name>) that works for five minutes, for the caller
// only. The same per-file rule as a download decides who may have one. "No such file" and "not yours" get the same 404,
// so the endpoint cannot be used to find out which file names exist.
router.post('/:name/link', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    if (!isStoredName(name) || !(await canAccessUpload(req.user, name)) || !fs.existsSync(path.join(UPLOAD_DIR, name))) {
      return res.status(404).json({ message: 'File not found' });
    }
    res.json(signedUploadPath(name, req.user.id));
  } catch (err) {
    sendServerError(res, err);
  }
});

module.exports = router;
