const FIREBASE_PROJECT_ID = 'newsbytes-5ed18';
const FIRESTORE_BASE =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

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

// Article "img" fields can be one of:
//  - a real http(s) URL              -> we redirect straight to it
//  - a data:image/...;base64,... URI -> we decode it and stream real bytes
//    (this is the case for images stored directly as Firestore fields)
function parseDataUri(str) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(str || '');
  if (!m) return null;
  return { mime: m[1], base64: m[2] };
}

module.exports = async (req, res) => {
  try {
    const articleId = req.query.article;
    if (!articleId) {
      res.status(400).send('Missing ?article=ID');
      return;
    }

    const resp = await fetch(
      `${FIRESTORE_BASE}/articles/${encodeURIComponent(String(articleId))}`
    );
    if (!resp.ok) {
      res.status(404).send('Article not found');
      return;
    }

    const doc = await resp.json();
    const a = parseFirestoreDoc(doc);
    const img = a.img;

    if (!img) {
      res.status(404).send('No image for this article');
      return;
    }

    const dataUri = parseDataUri(img);
    if (dataUri) {
      const buffer = Buffer.from(dataUri.base64, 'base64');
      res.setHeader('Content-Type', dataUri.mime);
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      res.status(200).send(buffer);
      return;
    }

    // Already a real URL (e.g. Firebase Storage / external host) — just
    // redirect to it rather than proxying bytes we don't need to touch.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.redirect(302, img);
  } catch (err) {
    console.error('image endpoint error:', err);
    res.status(500).send('Internal error');
  }
};
