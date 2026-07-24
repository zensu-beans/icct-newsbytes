const fs = require('fs');
const path = require('path');

// ══════════════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════════════
const FIREBASE_PROJECT_ID = 'newsbytes-5ed18'; // from your firebaseConfig
const FIRESTORE_BASE =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const DEFAULT_TITLE = 'Newsbytes — ICCT Colleges Student Newspaper';
const DEFAULT_DESC =
  'Your source for campus news, sports, editorials, and student life at ICCT Colleges.';

// No domain yet? No problem. Vercel puts the actual request host (your
// *.vercel.app URL today, your custom domain later) in these headers, so
// og:url / og:image are always built from wherever this deployment is
// actually being served — nothing to hardcode, nothing to update later.
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

    if (articleId) {
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
        image = a.img || `${SITE_URL}/newsbytes_logo.png`;
      }
      url = `${SITE_URL}/?article=${encodeURIComponent(String(articleId))}`;
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
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.status(200).send(html);
  } catch (err) {
    console.error('render error:', err);
    // Fail-safe: never let a bad Firestore read take the site down.
    try {
      const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(html);
    } catch (e2) {
      res.status(500).send('Internal error');
    }
  }
};
