const express = require('express');
const { fetchPublicImage } = require('../lib/safeHttp');

const router = express.Router();

// 1×1 transparent GIF — returned when no favicon found
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// In-memory 1-hour negative cache to avoid hammering missing domains
const notFoundCache = new Map();
const NOT_FOUND_TTL = 60 * 60 * 1000;

router.get('/:domain', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');

  const domain = req.params.domain.toLowerCase().replace(/[^a-z0-9.-]/g, '');
  if (!domain) return res.type('image/gif').send(TRANSPARENT_GIF);

  // Serve transparent GIF immediately for recently-confirmed-missing domains
  const cached = notFoundCache.get(domain);
  if (cached && Date.now() < cached) {
    return res.type('image/gif').send(TRANSPARENT_GIF);
  }

  const sources = [
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
    `https://favicon.yandex.net/favicon/${domain}`,
  ];

  for (const url of sources) {
    try {
      // Reject non-images (an upstream error page must never be served from our origin) and tiny 1x1 placeholders
      const { buf, ct } = await fetchPublicImage(url, { timeout: 4000, minBytes: 50, maxBytes: 512 * 1024 });
      res.set('Content-Type', ct);
      return res.send(buf);
    } catch {}
  }

  // All sources failed — cache negative result and return transparent GIF
  notFoundCache.set(domain, Date.now() + NOT_FOUND_TTL);
  return res.type('image/gif').send(TRANSPARENT_GIF);
});

module.exports = router;
