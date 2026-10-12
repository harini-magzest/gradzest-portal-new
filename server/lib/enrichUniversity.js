const axios = require("axios");
const { fetchPublicPage } = require("./safeHttp");

// The two website fetches below used plain axios; this keeps their axios-style `{ data }` shape while routing them
// through the SSRF-safe fetcher (public addresses only, re-checked on every redirect, size-capped).
const fetchPublicPageAsResponse = (url, { timeout, headers } = {}) =>
  fetchPublicPage(url, { timeout, headers }).then((data) => ({ data }));

const WIKI_HEADERS = {
  "User-Agent":
    "EduAbroad/1.0 (university-info-fetcher; contact@eduabroad.com)",
};

const COUNTRY_CURRENCY = {
  "United States": "USD",
  "United Kingdom": "GBP",
  Canada: "CAD",
  Australia: "AUD",
  Germany: "EUR",
  Netherlands: "EUR",
  France: "EUR",
  Singapore: "SGD",
  "New Zealand": "NZD",
  Sweden: "SEK",
  Switzerland: "CHF",
  Japan: "JPY",
  India: "INR",
  "South Korea": "KRW",
  China: "CNY",
  Malaysia: "MYR",
  Ireland: "EUR",
  Italy: "EUR",
  Spain: "EUR",
  Portugal: "EUR",
  Belgium: "EUR",
  Austria: "EUR",
  Denmark: "DKK",
  Norway: "NOK",
  Finland: "EUR",
  Poland: "PLN",
  Brazil: "BRL",
  Mexico: "MXN",
  Argentina: "ARS",
  "South Africa": "ZAR",
  "United Arab Emirates": "AED",
  "Saudi Arabia": "SAR",
  Pakistan: "PKR",
  Bangladesh: "BDT",
  "Sri Lanka": "LKR",
  Nepal: "NPR",
  Indonesia: "IDR",
  Thailand: "THB",
  Philippines: "PHP",
  "Hong Kong": "HKD",
  Taiwan: "TWD",
};

const KNOWN_COUNTRIES = Object.keys(COUNTRY_CURRENCY).concat([
  "Russia",
  "Ukraine",
  "Turkey",
  "Israel",
  "Egypt",
  "Nigeria",
  "Kenya",
  "Ghana",
  "Tanzania",
  "Ethiopia",
  "Morocco",
  "Tunisia",
  "Algeria",
]);

function isSvgUrl(url) {
  return /\.svg(\?|$)/i.test(url) || /\.svg\//i.test(url);
}

function extractSocialLinks(links) {
  const social = {};
  const patterns = {
    facebook:
      /^https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|share|dialog|login|plugins)/i,
    twitter:
      /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!intent|share|home|search)/i,
    linkedin: /^https?:\/\/(?:www\.)?linkedin\.com\/(?:school|company|in)\//i,
    instagram:
      /^https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/|explore\/)/i,
    youtube: /^https?:\/\/(?:www\.)?youtube\.com\/(?:channel\/|user\/|c\/|@)/i,
  };
  for (const link of links) {
    try {
      const url = link.startsWith("//") ? "https:" + link : link;
      for (const [platform, pattern] of Object.entries(patterns)) {
        if (!social[platform] && pattern.test(url)) {
          social[platform] = url;
          break;
        }
      }
    } catch {}
  }
  return social;
}

function extractSocialLinksFromHtml(html) {
  const links = [];
  const hrefRegex = /href=["']([^"'\s]{10,})["']/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    if (
      /(?:facebook|twitter|x\.com|linkedin|instagram|youtube)\.com/i.test(
        match[1],
      )
    ) {
      const url = match[1].startsWith("http")
        ? match[1]
        : "https:" + match[1].replace(/^\/\//, "");
      links.push(url);
    }
  }
  return extractSocialLinks(links);
}

// 24-hour in-memory cache keyed by lowercased university name
const _cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

function getCached(name) {
  const entry = _cache.get(name.toLowerCase());
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(name.toLowerCase());
    return null;
  }
  return entry.data;
}

function setCache(name, data) {
  _cache.set(name.toLowerCase(), { data, expiresAt: Date.now() + CACHE_TTL });
}

function clearCache(name) {
  if (name) _cache.delete(name.toLowerCase());
  else _cache.clear();
}

// ── Wikipedia search — find best matching article title ───────────────────────
async function resolveWikiTitle(name) {
  // 1. Try direct REST API first (fastest path for exact names)
  const direct = await axios
    .get(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, "_"))}`,
      { timeout: 6000, headers: WIKI_HEADERS },
    )
    .catch(() => null);
  if (direct?.data?.type === "standard") return direct.data.title;

  // 2. OpenSearch (autocomplete) fallback
  const search = await axios
    .get("https://en.wikipedia.org/w/api.php", {
      params: {
        action: "opensearch",
        search: name + " university",
        limit: 5,
        format: "json",
      },
      timeout: 8000,
      headers: WIKI_HEADERS,
    })
    .catch(() => null);
  const titles = search?.data?.[1] || [];
  const nameLower = name
    .toLowerCase()
    .replace(/\buniversity\b|\bcollege\b|\binstitute\b|\binstitution\b/gi, "")
    .trim();

  // Score each result
  let best = null,
    bestScore = -1;
  for (const t of titles) {
    const tLower = t.toLowerCase();
    let score = 0;
    if (tLower.includes(nameLower)) score += 3;
    if (/university|college|institute|school of/i.test(t)) score += 2;
    if (tLower.startsWith(nameLower)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best || titles[0] || name.replace(/ /g, "_");
}

// ── Wikidata structured data ──────────────────────────────────────────────────
async function fetchWikidata(wikiTitle) {
  // Get Wikidata item ID from Wikipedia page
  const propRes = await axios
    .get("https://en.wikipedia.org/w/api.php", {
      params: {
        action: "query",
        titles: wikiTitle,
        prop: "pageprops",
        format: "json",
      },
      timeout: 6000,
      headers: WIKI_HEADERS,
    })
    .catch(() => null);
  const page = Object.values(propRes?.data?.query?.pages || {})[0];
  const wikidataId = page?.pageprops?.wikibase_item;
  if (!wikidataId) return {};

  // Fetch Wikidata claims
  const wdRes = await axios
    .get("https://www.wikidata.org/w/api.php", {
      params: {
        action: "wbgetentities",
        ids: wikidataId,
        props: "claims",
        format: "json",
        languages: "en",
      },
      timeout: 10000,
      headers: WIKI_HEADERS,
    })
    .catch(() => null);
  const entity = wdRes?.data?.entities?.[wikidataId];
  if (!entity) return {};

  function claimVal(prop) {
    const c = entity.claims?.[prop];
    return c?.[0]?.mainsnak?.datavalue?.value ?? null;
  }
  function claimQid(prop) {
    const v = claimVal(prop);
    return typeof v === "object" ? v?.id : null;
  }

  const result = {};

  // P571 inception / P1619 date of official opening
  const inception = claimVal("P571") || claimVal("P1619");
  if (inception?.time) {
    const m = inception.time.match(/\+?(\d{4})/);
    if (m) result.founded = m[1];
  }

  // P2196 students enrolled
  const enrollment = claimVal("P2196");
  if (enrollment?.amount)
    result.totalStudents = Math.abs(parseInt(enrollment.amount)).toString();

  // P856 official website
  const website = claimVal("P856");
  if (typeof website === "string") result.website = website.replace(/\/$/, "");

  // P17 country → resolve label
  const countryQid = claimQid("P17");
  if (countryQid) {
    const cRes = await axios
      .get("https://www.wikidata.org/w/api.php", {
        params: {
          action: "wbgetentities",
          ids: countryQid,
          props: "labels",
          languages: "en",
          format: "json",
        },
        timeout: 5000,
        headers: WIKI_HEADERS,
      })
      .catch(() => null);
    const label = cRes?.data?.entities?.[countryQid]?.labels?.en?.value;
    if (label) result.country = label;
  }

  // P131 located in → city (may be city or region; try to pick city-level)
  const cityQid = claimQid("P131");
  if (cityQid) {
    const cityRes = await axios
      .get("https://www.wikidata.org/w/api.php", {
        params: {
          action: "wbgetentities",
          ids: cityQid,
          props: "labels",
          languages: "en",
          format: "json",
        },
        timeout: 5000,
        headers: WIKI_HEADERS,
      })
      .catch(() => null);
    const label = cityRes?.data?.entities?.[cityQid]?.labels?.en?.value;
    if (label) result.city = label;
  }

  // P154 logo image → Wikimedia Commons URL
  const logoFile = claimVal("P154");
  if (typeof logoFile === "string") {
    const fileName = logoFile.replace(/ /g, "_");
    const imgRes = await axios
      .get("https://commons.wikimedia.org/w/api.php", {
        params: {
          action: "query",
          titles: "File:" + fileName,
          prop: "imageinfo",
          iiprop: "url",
          format: "json",
        },
        timeout: 5000,
        headers: WIKI_HEADERS,
      })
      .catch(() => null);
    const url =
      Object.values(imgRes?.data?.query?.pages || {})[0]?.imageinfo?.[0]?.url ||
      "";
    if (url && !isSvgUrl(url)) result.logoFromWikidata = url;
  }

  return result;
}

// ── Campus image from Wikipedia ───────────────────────────────────────────────
async function fetchCampusImage(wikiTitle) {
  const SKIP = [
    "coat",
    "seal",
    "logo",
    "flag",
    "badge",
    "emblem",
    "crest",
    "shield",
    "arms",
    "map",
    "location",
    "portrait",
    "signature",
    "medal",
    "icon",
    "symbol",
    "mascot",
  ];
  const CAMPUS = [
    "campus",
    "building",
    "hall",
    "library",
    "quad",
    "quadrangle",
    "entrance",
    "facade",
    "aerial",
    "gate",
    "tower",
    "chapel",
    "exterior",
    "view",
    "courtyard",
    "grounds",
    "main",
    "front",
    "administration",
    "gymnasium",
    "college",
  ];

  const mediaRes = await axios
    .get(
      `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(wikiTitle)}`,
      { timeout: 8000, headers: WIKI_HEADERS },
    )
    .catch(() => null);

  if (mediaRes?.data?.items) {
    for (const requireCampus of [true, false]) {
      for (const item of mediaRes.data.items) {
        if (item.type !== "image") continue;
        const t = (item.title || "").toLowerCase();
        if (SKIP.some((w) => t.includes(w))) continue;
        if (requireCampus && !CAMPUS.some((w) => t.includes(w))) continue;
        const srcs = item.srcset || [];
        const src = srcs[srcs.length - 1]?.src || srcs[0]?.src || "";
        const url = src.startsWith("//") ? "https:" + src : src;
        if (url && !isSvgUrl(url)) return url;
      }
    }
  }
  return "";
}

// ── Course scraper ────────────────────────────────────────────────────────────
const DEGREE_RE =
  /(?:Bachelor(?:'?s)?(?:\s+of)?|B\.?Sc\.?|B\.?A\.(?:\s|$)|B\.?Eng\.?|B\.?Tech\.?|LLB|BArch|BBA|Master(?:'?s)?(?:\s+of)?|M\.?Sc\.?|M\.?A\.(?:\s|$)|MPhil|M\.?Eng\.?|MBA|LLM|MEd|MRes|PhD|Doctorate|Doctor\s+of|Postgrad(?:uate)?\s+Diploma|Pg\s*Dip|Diploma\s+in|Certificate\s+in|Foundation\s+(?:Year|Course|Degree))\s+(?:of\s+|in\s+)?(?:[A-Z][A-Za-z](?:[A-Za-z ,&()-]{3,55}))/g;

const LEVEL_MAP = [
  [/PhD|Doctorate|Doctor\s+of/i, "PhD"],
  [/MBA|Master\s+of\s+Business/i, "Masters"],
  [/MSc|M\.Sc|MA\b|M\.A\b|MPhil|MEng|MEd|MRes|LLM|Masters?/i, "Masters"],
  [/BSc|B\.Sc|BA\b|B\.A\b|BEng|BArch|BBA|B\.Tech|LLB|Bachelors?/i, "Bachelors"],
  [/Diploma|Pg\s*Dip|Certificate|Foundation/i, "Diploma"],
];

const DURATION_RE = /\b(\d[\d.]*)\s*[-–]?\s*(?:year|yr|semester|month)s?\b/i;

function inferLevel(text) {
  for (const [re, lv] of LEVEL_MAP) if (re.test(text)) return lv;
  return "Bachelors";
}

function inferDuration(text) {
  const m = text.match(DURATION_RE);
  if (!m) return "";
  const n = parseFloat(m[1]);
  const unit = /month/i.test(m[0]) ? "month" : "year";
  return `${n} ${unit}${n !== 1 ? "s" : ""}`;
}

async function fetchCoursesFromWebsite(website, currency) {
  if (!website) return [];
  const base = website.replace(/\/$/, "");
  const PRESET_PATHS = [
    "",
    "/programmes",
    "/programs",
    "/courses",
    "/study",
    "/study/courses",
    "/study/programmes",
    "/study/undergraduate",
    "/study/postgraduate",
    "/academics",
    "/academics/programs",
    "/undergraduate",
    "/postgraduate",
    "/admissions/programs",
    "/faculties",
    "/schools",
    "/departments",
  ];

  // Fetch homepage first to discover course-listing links
  let discoveredPaths = [];
  try {
    // The website comes from an admin or from Wikidata, so it goes through the SSRF-safe fetcher: a website set to an
    // internal address (http://169.254.169.254/, http://localhost:5000, 10.x…) is refused instead of fetched.
    const homeRes = await fetchPublicPageAsResponse(base, {
      timeout: 6000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; EduAbroad/1.0; +https://eduabroad.com)",
      },
      maxRedirects: 3,
      responseType: "text",
    });
    if (typeof homeRes.data === "string") {
      const hrefRe = /href=["']([^"'#?]{4,120})["']/gi;
      let hm;
      const seen = new Set(PRESET_PATHS);
      while (
        (hm = hrefRe.exec(homeRes.data)) !== null &&
        discoveredPaths.length < 6
      ) {
        const href = hm[1];
        if (
          !/course|programme|program|study|faculty|school|department|academic/i.test(
            href,
          )
        )
          continue;
        try {
          const path = href.startsWith("http")
            ? href.startsWith(base)
              ? href.replace(base, "")
              : null
            : href.startsWith("/")
              ? href
              : "/" + href;
          if (path && !seen.has(path)) {
            seen.add(path);
            discoveredPaths.push(path);
          }
        } catch {}
      }
    }
  } catch {}

  const allPaths = [...PRESET_PATHS.slice(0, 6), ...discoveredPaths].slice(
    0,
    12,
  );

  const htmlPages = await Promise.allSettled(
    allPaths.map((p) =>
      fetchPublicPageAsResponse(base + p, {
          timeout: 6000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; EduAbroad/1.0; +https://eduabroad.com)",
          },
          maxRedirects: 3,
          responseType: "text",
        })
        .then((r) =>
          typeof r.data === "string" ? r.data.slice(0, 120000) : "",
        )
        .catch(() => ""),
    ),
  );

  const seen = new Set();
  const courses = [];

  for (const result of htmlPages) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const html = result.value;

    const texts = [];
    let m;
    const linkRe = /<a[^>]+>([^<]{8,150})<\/a>/gi;
    while ((m = linkRe.exec(html)) !== null) texts.push(m[1]);
    const headRe = /<h[1-5][^>]*>([^<]{5,150})<\/h[1-5]>/gi;
    while ((m = headRe.exec(html)) !== null) texts.push(m[1]);
    const liRe = /<li[^>]*>\s*(?:<[^>]+>)*([^<]{8,150})(?:<[^>]+>)*\s*<\/li>/gi;
    while ((m = liRe.exec(html)) !== null) texts.push(m[1]);
    const tdRe = /<td[^>]*>([^<]{8,150})<\/td>/gi;
    while ((m = tdRe.exec(html)) !== null) texts.push(m[1]);
    const spanRe = /<span[^>]*>([^<]{8,120})<\/span>/gi;
    while ((m = spanRe.exec(html)) !== null) texts.push(m[1]);
    const pRe = /<p[^>]*>([^<]{10,200})<\/p>/gi;
    while ((m = pRe.exec(html)) !== null) texts.push(m[1]);

    const cleanText = texts
      .join("\n")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/&#\d+;/g, " ")
      .replace(/&[a-z]+;/g, " ")
      .replace(/[\r\n]+/g, "\n");

    DEGREE_RE.lastIndex = 0;
    while ((m = DEGREE_RE.exec(cleanText)) !== null) {
      const raw = m[0].replace(/\s+/g, " ").trim();
      if (raw.length < 12 || raw.length > 100) continue;
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const level = inferLevel(raw);
      const duration =
        inferDuration(raw) ||
        (level === "PhD"
          ? "3–4 years"
          : level === "Masters"
            ? "1–2 years"
            : level === "Bachelors"
              ? "3–4 years"
              : "1 year");

      courses.push({ name: raw, level, duration, currency: currency || "USD" });
      if (courses.length >= 50) break;
    }
    if (courses.length >= 50) break;
  }

  return courses.slice(0, 35);
}

async function fetchCoursesFromWikipedia(wikiTitle, currency) {
  if (!wikiTitle) return [];

  // Fetch full plain-text extract of the Wikipedia page
  const extractRes = await axios
    .get("https://en.wikipedia.org/w/api.php", {
      params: {
        action: "query",
        titles: wikiTitle,
        prop: "extracts",
        explaintext: true,
        exsectionformat: "plain",
        format: "json",
      },
      timeout: 10000,
      headers: WIKI_HEADERS,
    })
    .catch(() => null);

  const page = Object.values(extractRes?.data?.query?.pages || {})[0];
  const fullText = page?.extract || "";
  if (!fullText) return [];

  // Find academic-related sections for richer wikitext
  const secListRes = await axios
    .get("https://en.wikipedia.org/w/api.php", {
      params: {
        action: "parse",
        page: wikiTitle,
        prop: "sections",
        format: "json",
      },
      timeout: 6000,
      headers: WIKI_HEADERS,
    })
    .catch(() => null);

  const sections = secListRes?.data?.parse?.sections || [];
  const acadIdxs = sections
    .filter((s) =>
      /academic|facult|school|college|department|programme|course|offered|curricul|study/i.test(
        s.line,
      ),
    )
    .map((s) => s.index)
    .slice(0, 6);

  let searchText = fullText.slice(0, 25000);

  if (acadIdxs.length) {
    const secResults = await Promise.allSettled(
      acadIdxs.map((idx) =>
        axios
          .get("https://en.wikipedia.org/w/api.php", {
            params: {
              action: "parse",
              page: wikiTitle,
              prop: "wikitext",
              section: idx,
              format: "json",
            },
            timeout: 6000,
            headers: WIKI_HEADERS,
          })
          .then((r) => {
            const raw = r?.data?.parse?.wikitext?.["*"] || "";
            return raw
              .replace(/\{\{[^{}]*\}\}/g, " ")
              .replace(/\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]/g, "$1")
              .replace(/'{2,}/g, "")
              .replace(/=+[^=]+=+/g, " ");
          })
          .catch(() => ""),
      ),
    );
    const sectionContent = secResults
      .filter((r) => r.status === "fulfilled" && r.value)
      .map((r) => r.value)
      .join("\n");
    if (sectionContent) searchText = sectionContent + "\n" + searchText;
  }

  const seen = new Set();
  const courses = [];

  DEGREE_RE.lastIndex = 0;
  let m;
  while ((m = DEGREE_RE.exec(searchText)) !== null) {
    const raw = m[0].replace(/\s+/g, " ").trim();
    if (raw.length < 12 || raw.length > 100) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const level = inferLevel(raw);
    const duration =
      inferDuration(raw) ||
      (level === "PhD"
        ? "3–4 years"
        : level === "Masters"
          ? "1–2 years"
          : level === "Bachelors"
            ? "3–4 years"
            : "1 year");
    courses.push({ name: raw, level, duration, currency: currency || "USD" });
    if (courses.length >= 35) break;
  }

  return courses;
}

// ── Main export ───────────────────────────────────────────────────────────────
async function fetchEnrichmentData(name) {
  const cached = getCached(name);
  if (cached) return cached;

  // Step 1: resolve the correct Wikipedia title (handles acronyms, short names)
  const wikiTitle = await resolveWikiTitle(name);

  // Step 2: Wikipedia REST API summary
  const wikiRes = await axios
    .get(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`,
      { timeout: 8000, headers: WIKI_HEADERS },
    )
    .catch(() => null);
  const wiki = wikiRes?.data;
  const description = (wiki?.extract || "").slice(0, 500);
  const wikiShort = wiki?.description || "";
  const fullText = wikiShort + " " + description;

  // Step 3: Wikidata structured data (country, city, founded, enrollment, website, logo)
  const wikidata = await fetchWikidata(wikiTitle);

  // (Step 4 used to be Hipolabs. It only answers over plain HTTP, and enrichment results are saved without review,
  // so anyone on the network path could have planted a website or name. Wikidata and Wikipedia cover the same fields.)

  // Step 5: Country — Wikidata is most reliable, then text search
  let country = wikidata.country || "";
  if (!country) {
    const tl = fullText.toLowerCase();
    for (const c of KNOWN_COUNTRIES) {
      if (tl.includes(c.toLowerCase())) {
        country = c;
        break;
      }
    }
  }

  // Step 6: City — Wikidata, then text extraction
  let city = wikidata.city || "";
  if (!city) {
    const patterns = [
      /located in ([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2}),\s*[A-Z]/,
      /(?:university|college|institute)\s+in\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2})/i,
      /^([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2}),\s*[A-Z]/m,
      /based in ([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2})/,
    ];
    for (const p of patterns) {
      const m = fullText.match(p);
      if (m?.[1] && m[1].length > 2 && !KNOWN_COUNTRIES.includes(m[1])) {
        city = m[1].trim();
        break;
      }
    }
    // fallback: Wikipedia description often contains "in City, Country"
    if (!city && wikiShort) {
      const m = wikiShort.match(/in ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),/);
      if (m?.[1] && !KNOWN_COUNTRIES.includes(m[1])) city = m[1].trim();
    }
  }

  // Step 7: Founded year — Wikidata, then text extraction
  let founded = wikidata.founded || "";
  if (!founded) {
    const m = fullText.match(
      /[Ff]ounded\s+in\s+(\d{4})|[Ee]stablished\s+in\s+(\d{4})|[Ee]stablished\s+(\d{4})|[Ff]ounded\s+(\d{4})|(\d{4})\s+as\s+(?:a\s+)?(?:college|university|institute)/,
    );
    if (m) founded = m[1] || m[2] || m[3] || m[4] || m[5];
  }

  // Step 8: University type from description
  const typeMap = [
    [/\b(private)\b/i, "Private"],
    [/\b(public|state|government|national)\b/i, "Public"],
    [/\b(research university|research institution)\b/i, "Research"],
    [
      /\b(institute of technology|technical university|technical institute)\b/i,
      "Technical",
    ],
    [/\b(liberal arts)\b/i, "Liberal Arts"],
  ];
  let type = "";
  for (const [re, label] of typeMap) {
    if (re.test(fullText)) {
      type = label;
      break;
    }
  }

  // Step 9: Website & domain
  let website = wikidata.website || "";
  let domain = "";
  if (website) {
    try {
      domain = new URL(website).hostname.replace("www.", "");
    } catch {}
  }

  // Wikipedia external links for domain/social discovery
  const extRes = await axios
    .get("https://en.wikipedia.org/w/api.php", {
      params: {
        action: "query",
        titles: wikiTitle,
        prop: "extlinks",
        ellimit: 60,
        format: "json",
      },
      timeout: 8000,
      headers: WIKI_HEADERS,
    })
    .catch(() => null);
  const extPage = Object.values(extRes?.data?.query?.pages || {})[0];
  const extLinks = (extPage?.extlinks || []).map((l) => l["*"]);

  if (!domain) {
    const skip = [
      "wikipedia",
      "facebook",
      "twitter",
      "linkedin",
      "youtube",
      "instagram",
      "wikidata",
      "wikimedia",
    ];
    for (const link of extLinks) {
      try {
        const h = new URL(link).hostname.replace("www.", "");
        if (
          !skip.some((s) => h.includes(s)) &&
          (h.includes(".edu") ||
            h.includes(".ac.") ||
            h.endsWith(".in") ||
            h.endsWith(".org"))
        ) {
          domain = h;
          break;
        }
      } catch {}
    }
  }

  const socialLinks = extractSocialLinks(extLinks);
  const finalWebsite = website || (domain ? `https://www.${domain}` : "");

  // Step 10: Scrape university website for og:image and more social links
  let coverImage = "";
  if (finalWebsite) {
    const pageRes = await axios
      .get(finalWebsite, {
        timeout: 7000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        maxRedirects: 4,
        responseType: "text",
      })
      .catch(() => null);

    if (pageRes?.data && typeof pageRes.data === "string") {
      const html = pageRes.data.slice(0, 60000);
      const ogMatch =
        html.match(
          /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        ) ||
        html.match(
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
        ) ||
        html.match(
          /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
        ) ||
        html.match(
          /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
        );
      const rawImg = ogMatch?.[1] || "";
      if (rawImg && !isSvgUrl(rawImg)) {
        try {
          coverImage = rawImg.startsWith("http")
            ? rawImg
            : new URL(rawImg, finalWebsite).href;
        } catch {}
      }
      const htmlSocial = extractSocialLinksFromHtml(html);
      for (const [k, v] of Object.entries(htmlSocial)) {
        if (v) socialLinks[k] = v;
      }
    }
  }

  // Step 11: Cover image — Wikipedia campus photo (fallback)
  if (!coverImage) coverImage = await fetchCampusImage(wikiTitle);
  if (!coverImage) {
    const thumb = wiki?.originalimage?.source || wiki?.thumbnail?.source || "";
    const tl = thumb.toLowerCase();
    if (
      thumb &&
      !isSvgUrl(thumb) &&
      !["coat", "seal", "badge", "emblem", "crest", "arms", "flag"].some((w) =>
        tl.includes(w),
      )
    ) {
      coverImage = thumb;
    }
  }

  // Step 12: Logo — Wikidata logo only (frontend falls back to Google favicon via UniLogoImg)
  const logo = wikidata.logoFromWikidata || "";
  const logoFallback2 = domain
    ? `https://icons.duckduckgo.com/ip3/${domain}.ico`
    : "";

  const currency = COUNTRY_CURRENCY[country] || "USD";

  // Step 13: Scrape courses from university website + Wikipedia in parallel
  const [websiteResult, wikiResult] = await Promise.allSettled([
    finalWebsite
      ? fetchCoursesFromWebsite(finalWebsite, currency)
      : Promise.resolve([]),
    fetchCoursesFromWikipedia(wikiTitle, currency),
  ]);
  const websiteCourses =
    websiteResult.status === "fulfilled" ? websiteResult.value : [];
  const wikiCourses = wikiResult.status === "fulfilled" ? wikiResult.value : [];

  // Merge: website data takes priority; fill remaining slots from Wikipedia
  const seenNames = new Set(websiteCourses.map((c) => c.name.toLowerCase()));
  const courses = [...websiteCourses];
  for (const c of wikiCourses) {
    if (!seenNames.has(c.name.toLowerCase())) {
      seenNames.add(c.name.toLowerCase());
      courses.push(c);
      if (courses.length >= 50) break;
    }
  }

  const data = {
    name,
    country,
    city,
    type,
    founded,
    website: finalWebsite,
    logo,
    logoFallback2,
    coverImage,
    description: description.trim(),
    avgCurrency: currency,
    totalStudents: wikidata.totalStudents || "",
    socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : null,
    courses,
  };

  setCache(name, data);
  return data;
}

module.exports = { fetchEnrichmentData, clearCache };
