const PROJECT_ID = 'newsbytes-5ed18';
const SITE_NAME = 'Newsbytes';
const DEFAULT_DESC = 'Campus news, events, sports, and student life — straight from ICCT Colleges.';

// Known social/link-preview bots. Add more here if you notice a platform
// isn't picking up rich previews.
const BOT_UA = /facebookexternalhit|Facebot|Twitterbot|Slackbot|Discordbot|WhatsApp|TelegramBot|LinkedInBot|Pinterest|redditbot|Googlebot|bingbot|Applebot|SkypeUriPreview|vkShare|Iframely|Embedly|W3C_Validator|Google-InspectionTool|DuckDuckBot|ia_archiver|quora/i;

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function serveApp(res) {
  const fs = require('fs');
  const path = require('path');
  try {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (e) {
    res.status(500).send('Could not load app.');
  }
}

module.exports = async (req, res) => {
  const ua = req.headers['user-agent'] || '';
  const id = (req.query.id || '').toString().trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = `https://${host}`;

  // Not a crawler, or no id to look up — just hand back the normal app.
  if (!id || !BOT_UA.test(ua)) {
    return serveApp(res);
  }

  try {
    const r = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/articles/${encodeURIComponent(id)}`
    );
    if (!r.ok) throw new Error('Article not found: ' + r.status);
    const doc = await r.json();
    const f = doc.fields || {};

    const title = f.title?.stringValue || SITE_NAME;
    const rawExcerpt = f.excerpt?.stringValue || f.body?.stringValue || '';
    const excerpt = rawExcerpt.length > 200 ? rawExcerpt.slice(0, 200).trim() + '…' : (rawExcerpt || DEFAULT_DESC);
    const hasImg = !!f.img?.stringValue;
    const imageUrl = hasImg
      ? `${origin}/api/og-image?id=${encodeURIComponent(id)}`
      : `${origin}/newsbytes_logo.png`;
    const pageUrl = `${origin}/article/${encodeURIComponent(id)}`;

    const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(excerpt)}">
<meta property="og:image" content="${imageUrl}">
<meta property="og:url" content="${pageUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(excerpt)}">
<meta name="twitter:image" content="${imageUrl}">
<!-- Real in-app browsers (Messenger, Instagram, etc.) sometimes render this
     exact response to an actual person, and some of their embedded preview
     surfaces don't run JavaScript. A meta-refresh redirects even then,
     without needing any script to execute. -->
<meta http-equiv="refresh" content="0; url=${pageUrl}">
<style>
  body{font-family:sans-serif;padding:32px 20px;color:#111009;text-align:center}
  a{color:#c8382a;font-weight:600;text-decoration:none}
</style>
</head><body>
<p>${escapeHtml(title)}</p>
<p><a href="${pageUrl}">Continue to full article →</a></p>
<script>location.replace(${JSON.stringify(pageUrl)});</script>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.status(200).send(html);
  } catch (e) {
    // Article missing/unreachable — fall back to the normal app rather than erroring out.
    serveApp(res);
  }
};
