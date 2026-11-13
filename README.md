# Pulse 24

A fast, general **international news reader**. It pulls **public BBC News RSS feeds**,
displays the latest stories with images, and links each headline back to the
original article for the full read.

## Features
- Real, live headlines — auto-refreshes every 5 minutes.
- 8 sections: Top Stories, World, Business, Technology, Science, Health, Sport, Entertainment.
- Responsive layout, light/dark mode, and search across the currently loaded stories.
- **No** login form, **no** personal-data collection, **nothing** sent anywhere.

## Structure
- `index.html` — the page.
- `assets/styles.css`, `assets/app.js` — UI and logic.
- `api/news.js` — Vercel serverless function that fetches RSS server-side and
  returns clean JSON. On a static host without serverless, the page automatically
  falls back to the public rss2json service.

## Run / deploy
- Deploy straight to Vercel (`api/news.js` runs as a serverless function).
- Or run `vercel dev` locally to see live news.
- Opening `index.html` directly via file:// still works — it falls back to rss2json.

## Note on content
Headlines and images are provided by BBC News via public RSS and remain the
copyright of the BBC. This project only aggregates and links back to the source.
For any public or commercial use, check the source's terms or swap in feeds you
are licensed to use (edit the `FEEDS` list in `api/news.js` and `CATS` in `assets/app.js`).
