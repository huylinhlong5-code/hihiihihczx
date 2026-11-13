// Vercel Serverless Function — pulls real headlines from public RSS feeds
// (BBC News, The Guardian, Al Jazeera). Returns clean JSON:
// title, link, pubDate, thumbnail, excerpt.
// Collects NO user data and sends nothing anywhere — it only reads public RSS.

const FEEDS = {
  'top':          'https://feeds.bbci.co.uk/news/rss.xml',
  'world':        'https://feeds.bbci.co.uk/news/world/rss.xml',
  'uk':           'https://feeds.bbci.co.uk/news/uk/rss.xml',
  'us-canada':    'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
  'politics':     'https://feeds.bbci.co.uk/news/politics/rss.xml',
  'business':     'https://feeds.bbci.co.uk/news/business/rss.xml',
  'technology':   'https://feeds.bbci.co.uk/news/technology/rss.xml',
  'science':      'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
  'health':       'https://feeds.bbci.co.uk/news/health/rss.xml',
  'sport':        'https://feeds.bbci.co.uk/sport/rss.xml',
  'entertainment':'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
  'guardian':     'https://www.theguardian.com/international/rss',
  'aljazeera':    'https://www.aljazeera.com/xml/rss/all.xml',
  'photos':       'https://www.theguardian.com/inpictures/rss',
  'travel':       'https://feeds.bbci.co.uk/news/world/rss.xml',
};

function pick(block, tag) {
  const m = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  if (!m) return '';
  return m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

// News image URLs ship small by default. Bump BBC ichef + Guardian to a larger size.
function upscale(url) {
  if (!url) return url;
  url = url.replace(/\/(\d{2,4})\/(cpsprodpb|ace\/standard)\//, '/1024/$2/')
           .replace(/\/news\/\d{2,4}\//, '/news/1024/');
  // Guardian i.guim.co.uk uses ?width=NNN — request a wider version.
  url = url.replace(/([?&]width=)\d+/i, '$11200')
           .replace(/([?&]quality=)\d+/i, '$185');
  return url;
}

function parseRss(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const title = pick(block, 'title');
    const link = pick(block, 'link');
    const pubDate = pick(block, 'pubDate');
    const descRaw = pick(block, 'description');

    let thumbnail = '';
    const mt = block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
    const mc = block.match(/<media:content[^>]+url=["']([^"']+)["']/i);
    const imgM = descRaw.match(/<img[^>]+src=["']([^"']+)["']/i);
    const encM = block.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    if (mt) thumbnail = mt[1];
    else if (mc) thumbnail = mc[1];
    else if (imgM) thumbnail = imgM[1];
    else if (encM) thumbnail = encM[1];
    thumbnail = upscale(thumbnail);

    const excerpt = descRaw
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ').trim();

    if (title && link) items.push({ title, link, pubDate, thumbnail, excerpt });
  }
  return items;
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const cat = url.searchParams.get('cat') || 'top';
    const feed = FEEDS[cat] || FEEDS['top'];
    const r = await fetch(feed, { headers: { 'User-Agent': 'Mozilla/5.0 (news-portal RSS reader)' } });
    if (!r.ok) throw new Error('Upstream ' + r.status);
    const xml = await r.text();
    const items = parseRss(xml).slice(0, 30);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ ok: true, cat, count: items.length, items });
  } catch (err) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ ok: false, error: String((err && err.message) || err), items: [] });
  }
};
