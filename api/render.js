const fs = require('fs');
const path = require('path');

// ══════════════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════════════
const FIREBASE_PROJECT_ID = 'newsbytes-5ed18';
const FIRESTORE_BASE =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const DEFAULT_TITLE = 'Newsbytes — ICCT Colleges Student Newspaper';
const DEFAULT_DESC =
  'Your source for campus news, sports, editorials, and student life at ICCT Colleges.';

function getSiteUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function trunc(s, n) {
  if (!s) return '';
  const clean = String(s).replace(/\s+/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n).trim() + '…' : clean;
}

function setMetaTag(html, attr, value, newContent) {
  const re = new RegExp(
    `(<meta[^>]*\\b${attr}=["']${value}["'][^>]*\\bcontent=)["'][^"']*["']`,
    'i'
  );
  return html.replace(re, `$1"${escapeHtml(newContent)}"`);
}

// Firestore REST documents come back as {fields: {key: {stringValue: "..."}}}
// rather than plain JSON. This unwraps just the field types this app uses.
function parseFirestoreDoc(doc) {
  const out = {};
  const fields = doc.fields || {};
  for (const key in fields) {
    const v = fields[key];
    out[key] =
      v.stringValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue ?? null;
  }
  return out;
}

function resolveImageUrl(img, SITE_URL, articleId) {
  if (!img) return null;
  if (/^data:image\//i.test(img)) {
    return `${SITE_URL}/api/image?article=${encodeURIComponent(String(articleId))}`;
  }
  return img; // already a real URL (Storage, external host, etc.)
}

module.exports = async (req, res) => {
  try {
    const SITE_URL = getSiteUrl(req);
    const templatePath = path.join(process.cwd(), 'index.html');
    let html = fs.readFileSync(templatePath, 'utf8');

    const articleId = req.query.article;
    let title = DEFAULT_TITLE;
    let description = DEFAULT_DESC;
    let image = `${SITE_URL}/newsbytes_logo.png`;
    let url = `${SITE_URL}/`;
    let articleFound = false;

    if (articleId) {
      url = `${SITE_URL}/?article=${encodeURIComponent(String(articleId))}`;
      const resp = await fetch(
        `${FIRESTORE_BASE}/articles/${encodeURIComponent(String(articleId))}`
      );
      if (resp.ok) {
        const doc = await resp.json();
        const a = parseFirestoreDoc(doc);
        title = a.title || DEFAULT_TITLE;
        description = a.excerpt
          ? trunc(a.excerpt, 200)
          : trunc(a.body, 200) || DEFAULT_DESC;
        // Missing/broken featured image -> fall back to the site logo.
        // Base64-stored images get routed through /api/image (see below),
        // since og:image must be a real fetchable URL, not a data: URI.
        image = resolveImageUrl(a.img, SITE_URL, articleId) || `${SITE_URL}/newsbytes_logo.png`;
        articleFound = true;
      } else {
        // Log the real reason (403 = Firestore rules blocking reads, 404 =
        // wrong/nonexistent article ID, etc.) — check this in the Vercel
        // dashboard: Project -> Deployments -> your deployment -> Functions
        // -> render -> Logs if this keeps happening.
        const bodyText = await resp.text().catch(() => '');
        console.error(
          `Firestore fetch failed for article "${articleId}": ${resp.status} ${resp.statusText} — ${bodyText}`
        );
      }
    }

    html = html.replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
    html = setMetaTag(html, 'property', 'og:title', title);
    html = setMetaTag(html, 'property', 'og:description', description);
    html = setMetaTag(html, 'property', 'og:image', image);
    html = setMetaTag(html, 'property', 'og:url', url);
    html = setMetaTag(html, 'name', 'twitter:title', title);
    html = setMetaTag(html, 'name', 'twitter:description', description);
    html = setMetaTag(html, 'name', 'twitter:image', image);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!articleId || articleFound) {
      // Safe to cache: either the plain homepage default, or a genuinely
      // successful article render.
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    } else {
      // An article ID was requested but we couldn't resolve it — never
      // cache this, so a transient Firestore hiccup or a fixed typo shows
      // up correctly on the very next request instead of being stuck for
      // up to 10 minutes.
      res.setHeader('Cache-Control', 'no-store');
    }
    res.status(200).send(html);
  } catch (err) {
    console.error('render error:', err);
    // Fail-safe: never let a bad Firestore read take the site down.
    try {
      const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(html);
    } catch (e2) {
      res.status(500).send('Internal error');
    }
  }
};
