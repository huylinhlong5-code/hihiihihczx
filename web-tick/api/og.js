// Vercel Serverless Function — fetches the og:image (or twitter:image) of an
// article page so stories that ship without an RSS thumbnail still get a picture.
// Reads only public HTML <head>; stores nothing. Heavily cached at the edge.

function firstMatch(html, re) { const m = html.match(re); return m ? m[1] : ''; }

function findImage(html) {
  // Only scan the <head> to stay fast and avoid body noise.
  const head = (html.split(/<\/head>/i)[0] || html).slice(0, 60000);
  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i
  ];
  for (const re of patterns) { const v = firstMatch(head, re); if (v) return v; }
  return '';
}

function decode(u) {
  return u.replace(/&amp;/g, '&').replace(/&#38;/g, '&').replace(/&quot;/g, '"').trim();
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const url = new URL(req.url, 'http://localhost');
    const target = url.searchParams.get('url') || '';
    if (!/^https?:\/\//i.test(target)) throw new Error('bad url');

    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 6000);
    const r = await fetch(target, {
      signal: ac.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Pulse24/1.0; +news reader)' }
    });
    clearTimeout(to);
    if (!r.ok) throw new Error('upstream ' + r.status);

    // Read a bounded chunk — we only need the <head>.
    const html = (await r.text()).slice(0, 120000);
    let img = findImage(html);
    if (img) {
      img = decode(img);
      if (img.startsWith('//')) img = 'https:' + img;
      else if (img.startsWith('/')) { const u = new URL(target); img = u.origin + img; }
    }
    // Long cache: article images rarely change.
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ ok: !!img, image: img || '' });
  } catch (err) {
    res.setHeader('Cache-Control', 's-maxage=600');
    res.status(200).json({ ok: false, image: '', error: String((err && err.message) || err) });
  }
};
