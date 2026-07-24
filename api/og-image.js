const PROJECT_ID = 'newsbytes-5ed18';

function serveLogo(res) {
  const fs = require('fs');
  const path = require('path');
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), 'newsbytes_logo.png'));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(buf);
  } catch (e) {
    res.status(404).send('Not found');
  }
}

module.exports = async (req, res) => {
  const id = (req.query.id || '').toString().trim();
  if (!id) return serveLogo(res);

  try {
    const r = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/articles/${encodeURIComponent(id)}`
    );
    if (!r.ok) throw new Error('Article not found: ' + r.status);
    const doc = await r.json();
    const dataUri = doc.fields?.img?.stringValue || '';

    const match = dataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) throw new Error('No decodable image on this article');

    const [, mime, base64] = match;
    const buffer = Buffer.from(base64, 'base64');

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(buffer);
  } catch (e) {
    serveLogo(res);
  }
};
