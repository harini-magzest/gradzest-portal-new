const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');

const router = express.Router();

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// In-memory 24h cache: uniId -> { buf, ct, expires }
const cache = new Map();

async function fetchImage(url, extraHeaders = {}) {
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 8000,
    validateStatus: s => s === 200,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      ...extraHeaders,
    },
  });
  if (!resp.data || resp.data.byteLength < 200) return null;
  // Reject HTML responses (error pages masquerading as images)
  const ct = resp.headers['content-type'] || '';
  if (ct.includes('text/html')) return null;
  return { buf: Buffer.from(resp.data), ct: ct || 'image/png' };
}

router.get('/:id', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');

  const { id } = req.params;
  const now = Date.now();

  const cached = cache.get(id);
  if (cached && now < cached.expires) {
    res.set('Content-Type', cached.ct);
    return res.send(cached.buf);
  }

  try {
    const University = require('../models/University');
    let uni = await University.findOne({ id });
    if (!uni && mongoose.Types.ObjectId.isValid(id)) uni = await University.findById(id);
    if (!uni) return res.type('image/gif').send(TRANSPARENT_GIF);

    const domain = uni.website
      ? uni.website.replace(/^https?:\/\/(?:www\.)?/, '').split('/')[0]
      : null;

    // 1. Try stored logo URL (with own domain as referer to bypass hotlink protection)
    if (uni.logo && !uni.logo.includes('clearbit.com')) {
      const logoReferer = domain ? `https://www.${domain}/` : 'https://www.google.com/';
      const result = await fetchImage(uni.logo, { Referer: logoReferer }).catch(() => null);
      if (result) {
        cache.set(id, { ...result, expires: now + 24 * 60 * 60 * 1000 });
        res.set('Content-Type', result.ct);
        return res.send(result.buf);
      }
    }

    // 2. Fall back to favicon sources
    if (domain) {
      const faviconSources = [
        `https://icons.duckduckgo.com/ip3/${domain}.ico`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      ];
      for (const url of faviconSources) {
        const result = await fetchImage(url).catch(() => null);
        if (result) {
          cache.set(id, { ...result, expires: now + 24 * 60 * 60 * 1000 });
          res.set('Content-Type', result.ct);
          return res.send(result.buf);
        }
      }
    }
  } catch {}

  return res.type('image/gif').send(TRANSPARENT_GIF);
});

module.exports = router;
