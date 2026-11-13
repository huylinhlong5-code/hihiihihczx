/* Pulse 24 — editorial international news reader.
   Blends public RSS feeds (BBC News, The Guardian, Al Jazeera); every story links
   back to its source. Collects NO personal data; bookmarks live only in your browser.
   Load order for resilience: /api/news serverless → rss2json → allorigins proxy.
   v3: og:image auto-fill, Photos gallery + lightbox, weather & crypto widgets,
       share, related stories, infinite scroll, hash routing, back-to-top. */

var App = (function () {
  var FEEDS = {
    'home':          { name: 'Home',          rss: 'https://feeds.bbci.co.uk/news/rss.xml',                         source: 'BBC News' },
    'world':         { name: 'World',         rss: 'https://feeds.bbci.co.uk/news/world/rss.xml',                   source: 'BBC News' },
    'uk':            { name: 'UK',            rss: 'https://feeds.bbci.co.uk/news/uk/rss.xml',                      source: 'BBC News' },
    'us-canada':     { name: 'US & Canada',   rss: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',     source: 'BBC News' },
    'politics':      { name: 'Politics',      rss: 'https://feeds.bbci.co.uk/news/politics/rss.xml',                source: 'BBC News' },
    'business':      { name: 'Business',      rss: 'https://feeds.bbci.co.uk/news/business/rss.xml',                source: 'BBC News' },
    'technology':    { name: 'Technology',    rss: 'https://feeds.bbci.co.uk/news/technology/rss.xml',              source: 'BBC News' },
    'science':       { name: 'Science',       rss: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', source: 'BBC News' },
    'health':        { name: 'Health',        rss: 'https://feeds.bbci.co.uk/news/health/rss.xml',                  source: 'BBC News' },
    'sport':         { name: 'Sport',         rss: 'https://feeds.bbci.co.uk/sport/rss.xml',                        source: 'BBC News' },
    'entertainment': { name: 'Entertainment', rss: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',  source: 'BBC News' },
    'photos':        { name: 'In Pictures',   rss: 'https://www.theguardian.com/inpictures/rss',                    source: 'The Guardian' },
    'guardian':      { name: 'The Guardian',  rss: 'https://www.theguardian.com/international/rss',                  source: 'The Guardian' },
    'aljazeera':     { name: 'Al Jazeera',    rss: 'https://www.aljazeera.com/xml/rss/all.xml',                     source: 'Al Jazeera' }
  };
  var NAV = ['home','world','uk','us-canada','politics','business','technology','science','health','sport','entertainment','photos'];
  var HOME_BLEND = ['home','guardian','aljazeera'];
  var HOME_RAILS = ['world','us-canada','business','technology','science','health','sport','entertainment'];
  var PAGE = 9;

  var current = 'home';
  var mem = {};
  var byLink = {};
  var saved = [];
  var pageItems = [], pageShown = 0;
  var io = null;              // IntersectionObserver for infinite scroll
  var galleryItems = [];      // current lightbox pool
  var galleryIndex = 0;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; };
  function feed(id) { return FEEDS[id] || FEEDS['home']; }
  function nameOf(id) { return feed(id).name; }
  function srcOf(id) { return feed(id).source; }
  function rssOf(id) { return feed(id).rss; }
  function apiCat(id) { return id === 'home' ? 'top' : id; }

  /* ---------- utils ---------- */
  var PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='200'%3E%3Crect width='320' height='200' fill='%23d8d4ca'/%3E%3Ctext x='160' y='108' font-size='15' fill='%238a8f98' text-anchor='middle' font-family='Georgia'%3EPulse%2024%3C/text%3E%3C/svg%3E";
  function pic(src, eager) {
    if (!src) return '<img src="' + PLACEHOLDER + '" alt="" loading="lazy">';
    var big = esc(upscale(src)), orig = esc(src);
    var h = "if(this.dataset.s!='1'){this.dataset.s='1';this.src='" + orig + "'}else{this.onerror=null;this.src='" + PLACEHOLDER + "'}";
    return '<img src="' + big + '" alt="" loading="' + (eager ? 'eager' : 'lazy') + '" onerror="' + h + '">';
  }
  function upscale(url) {
    if (!url) return url;
    url = url.replace(/\/(\d{2,4})\/(cpsprodpb|ace\/standard)\//, '/1024/$2/')
             .replace(/\/news\/\d{2,4}\//, '/news/1024/');
    url = url.replace(/([?&]width=)\d+/i, '$11200').replace(/([?&]quality=)\d+/i, '$185');
    return url;
  }
  function timeAgo(pub) {
    var t = new Date(pub).getTime();
    if (isNaN(t)) return '';
    var diff = Math.floor((Date.now() - t) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) { var m = Math.floor(diff / 60); return m + (m === 1 ? ' min ago' : ' mins ago'); }
    if (diff < 86400) { var h = Math.floor(diff / 3600); return h + (h === 1 ? ' hour ago' : ' hours ago'); }
    var d = new Date(t), mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return mo[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }
  function normalize(raw) {
    var thumb = raw.thumbnail || (raw.enclosure && raw.enclosure.link) || '';
    return {
      title: (raw.title || '').trim(), link: (raw.link || '').trim(),
      pubDate: raw.pubDate || raw.pubdate || '', thumbnail: thumb,
      excerpt: (raw.excerpt || raw.description || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    };
  }
  function tag(items, id) { var s = srcOf(id); items.forEach(function (a) { a.source = a.source || s; byLink[a.link] = a; }); return items; }

  /* ---------- og:image auto-fill (fixes stories with no picture) ---------- */
  var ogCache = {};
  try { ogCache = JSON.parse(localStorage.getItem('pulse:og')) || {}; } catch (e) { ogCache = {}; }
  var ogQueue = [], ogActive = 0, OG_MAX = 3;
  function ogPersist() { try { localStorage.setItem('pulse:og', JSON.stringify(ogCache)); } catch (e) {} }
  function applyImage(link, img) {
    if (byLink[link] && img) byLink[link].thumbnail = img;
    var enc = encodeURIComponent(link);
    var thumbs = document.querySelectorAll('[data-imglk="' + enc + '"]');
    for (var i = 0; i < thumbs.length; i++) {
      var im = thumbs[i].querySelector('img');
      if (im && img) { im.src = upscale(img); im.dataset.s = ''; im.classList.add('img-faded'); }
      // Always clear the shimmer — either the real image loads, or the placeholder shows.
      thumbs[i].classList.remove('no-img');
    }
  }
  function ogPump() {
    while (ogActive < OG_MAX && ogQueue.length) {
      var link = ogQueue.shift();
      if (ogCache[link] === '' || ogCache[link]) { applyImage(link, ogCache[link]); continue; }
      ogActive++;
      (function (lk) {
        fetch('/api/og?url=' + encodeURIComponent(lk))
          .then(function (r) { return r.json(); })
          .then(function (d) { ogCache[lk] = (d && d.image) || ''; ogPersist(); applyImage(lk, ogCache[lk]); })
          .catch(function () { ogCache[lk] = ''; })
          .then(function () { ogActive--; ogPump(); });
      })(link);
    }
  }
  function fillMissingImages(root) {
    var scope = root || document;
    var holders = scope.querySelectorAll('.no-img[data-imglk]');
    var links = [];
    for (var i = 0; i < holders.length; i++) {
      var lk = decodeURIComponent(holders[i].getAttribute('data-imglk') || '');
      if (lk && links.indexOf(lk) === -1) links.push(lk);
    }
    links.forEach(function (lk) { if (ogQueue.indexOf(lk) === -1) ogQueue.push(lk); });
    ogPump();
  }

  /* ---------- fetch chain ---------- */
  function withTimeout(p, ms) {
    return new Promise(function (res, rej) {
      var to = setTimeout(function () { rej(new Error('timeout')); }, ms || 9000);
      p.then(function (v) { clearTimeout(to); res(v); }, function (e) { clearTimeout(to); rej(e); });
    });
  }
  function srcApi(id) {
    return withTimeout(fetch('/api/news?cat=' + encodeURIComponent(apiCat(id))).then(function (r) {
      if (!r.ok) throw 0; return r.json();
    }).then(function (d) { if (!d.ok || !d.items || !d.items.length) throw 0; return d.items.map(normalize); }));
  }
  function srcRss2json(id) {
    var u = 'https://api.rss2json.com/v1/api.json?count=40&rss_url=' + encodeURIComponent(rssOf(id));
    return withTimeout(fetch(u).then(function (r) { return r.json(); }).then(function (d) {
      if (d.status !== 'ok' || !d.items || !d.items.length) throw 0; return d.items.map(normalize);
    }));
  }
  function parseXmlClient(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    var nodes = doc.getElementsByTagName('item'), out = [];
    for (var i = 0; i < nodes.length; i++) {
      var it = nodes[i];
      var g = function (t) { var e = it.getElementsByTagName(t)[0]; return e ? e.textContent : ''; };
      var title = g('title'), link = g('link'), pubDate = g('pubDate'), desc = g('description');
      var thumb = '', mt = it.getElementsByTagName('media:thumbnail')[0];
      if (!mt && it.getElementsByTagNameNS) { var l = it.getElementsByTagNameNS('*', 'thumbnail'); if (l && l[0]) mt = l[0]; }
      if (mt) thumb = mt.getAttribute('url') || '';
      if (!thumb) { var mc = it.getElementsByTagName('media:content')[0]; if (mc) thumb = mc.getAttribute('url') || ''; }
      if (!thumb) { var en = it.getElementsByTagName('enclosure')[0]; if (en) thumb = en.getAttribute('url') || ''; }
      if (!thumb) { var mm = (desc || '').match(/<img[^>]+src=["']([^"']+)["']/i); if (mm) thumb = mm[1]; }
      var a = normalize({ title: title, link: link, pubDate: pubDate, thumbnail: thumb, excerpt: desc });
      if (a.title && a.link) out.push(a);
    }
    if (!out.length) throw 0; return out.slice(0, 40);
  }
  function srcProxy(id) {
    var u = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(rssOf(id));
    return withTimeout(fetch(u).then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(parseXmlClient), 12000);
  }
  function fetchFresh(id) {
    return srcApi(id).catch(function () { return srcRss2json(id); }).catch(function () { return srcProxy(id); })
      .then(function (items) { tag(items, id); mem[id] = items; lsSet('feed:' + id, items); return items; });
  }
  function load(id) {
    if (mem[id]) return Promise.resolve(mem[id]);
    var cached = lsGet('feed:' + id);
    var net = fetchFresh(id);
    if (cached && cached.length) { tag(cached, id); mem[id] = cached; net.catch(function () {}); return Promise.resolve(cached); }
    return net;
  }

  /* ---------- localStorage cache ---------- */
  function lsGet(key) { try { var v = JSON.parse(localStorage.getItem('pulse:' + key)); if (v && Date.now() - v.t < 1800000) return v.items; } catch (e) {} return null; }
  function lsSet(key, items) { try { localStorage.setItem('pulse:' + key, JSON.stringify({ t: Date.now(), items: items.slice(0, 40) })); } catch (e) {} }

  /* ---------- bookmarks ---------- */
  function loadSaved() { try { saved = JSON.parse(localStorage.getItem('pulse:saved')) || []; } catch (e) { saved = []; } }
  function persistSaved() { try { localStorage.setItem('pulse:saved', JSON.stringify(saved.slice(0, 200))); } catch (e) {} }
  function isSaved(link) { for (var i = 0; i < saved.length; i++) if (saved[i].link === link) return true; return false; }
  function toggleSave(e, enc) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    var link = decodeURIComponent(enc), a = byLink[link];
    if (isSaved(link)) { saved = saved.filter(function (x) { return x.link !== link; }); }
    else if (a) { saved.unshift({ title: a.title, link: a.link, thumbnail: a.thumbnail, pubDate: a.pubDate, excerpt: a.excerpt, source: a.source }); toast('Saved to your list'); }
    persistSaved(); reflectSave(link); updateSavedCount();
    if (current === 'saved') renderSaved();
    if ($('readerSave')) { var on = isSaved(link); $('readerSave').className = 'reader-save' + (on ? ' on' : ''); $('readerSave').innerHTML = (on ? '★ Saved' : '☆ Save'); }
    return false;
  }
  function reflectSave(link) {
    var enc = encodeURIComponent(link), on = isSaved(link);
    var els = document.querySelectorAll('[data-lk="' + enc + '"]');
    for (var i = 0; i < els.length; i++) { els[i].classList.toggle('on', on); if (els[i].classList.contains('save-btn')) els[i].innerHTML = on ? '★' : '☆'; }
  }
  function updateSavedCount() { var b = $('savedBtn'); if (b) b.innerHTML = (saved.length ? '★' : '☆') + ' Saved' + (saved.length ? ' (' + saved.length + ')' : ''); }

  /* ---------- share ---------- */
  function share(e, enc) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    var link = decodeURIComponent(enc), a = byLink[link] || { title: 'Pulse 24', link: link };
    if (navigator.share) { navigator.share({ title: a.title, url: link }).catch(function () {}); }
    else if (navigator.clipboard) { navigator.clipboard.writeText(link).then(function () { toast('Link copied to clipboard'); }); }
    else { window.open(link, '_blank', 'noopener'); }
    return false;
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }

  /* ---------- building blocks ---------- */
  function badge(a) { return '<span class="src-badge">' + esc(a.source || 'News') + '</span>'; }
  function saveBtn(a) {
    var enc = encodeURIComponent(a.link), on = isSaved(a.link);
    return '<span class="save-btn' + (on ? ' on' : '') + '" role="button" tabindex="0" data-lk="' + enc + '" aria-label="Save article" ' +
      'onclick="return App.toggleSave(event,\'' + enc + '\')" ' +
      'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){return App.toggleSave(event,\'' + enc + '\')}">' + (on ? '★' : '☆') + '</span>';
  }
  function shareBtn(a) {
    var enc = encodeURIComponent(a.link);
    return '<span class="share-btn" role="button" tabindex="0" aria-label="Share article" ' +
      'onclick="return App.share(event,\'' + enc + '\')" ' +
      'onkeydown="if(event.key===\'Enter\'){return App.share(event,\'' + enc + '\')}">⤴</span>';
  }
  function thumbWrap(a, extra) {
    var enc = encodeURIComponent(a.link);
    var noimg = a.thumbnail ? '' : ' no-img';
    return '<div class="card-thumb' + noimg + '" data-imglk="' + enc + '">' + pic(a.thumbnail) + (extra || '') + '</div>';
  }
  function openAttr(a) { return ' href="' + esc(a.link) + '" target="_blank" rel="noopener" onclick="return App.open(event,\'' + encodeURIComponent(a.link) + '\')"'; }
  function card(a) { byLink[a.link] = a;
    return '<a class="card"' + openAttr(a) + '>' +
      thumbWrap(a, saveBtn(a) + shareBtn(a)) +
      '<div class="card-body"><h3>' + esc(a.title) + '</h3><p>' + esc(a.excerpt) + '</p>' +
      '<div class="card-meta">' + badge(a) + '<span class="dot"></span>' + esc(timeAgo(a.pubDate)) + '</div></div></a>';
  }
  function hrow(a) { byLink[a.link] = a;
    var enc = encodeURIComponent(a.link), noimg = a.thumbnail ? '' : ' no-img';
    return '<a class="hrow"' + openAttr(a) + '><span class="hrow-thumb' + noimg + '" data-imglk="' + enc + '">' + pic(a.thumbnail) + '</span>' +
      '<div class="hbody"><h3>' + esc(a.title) + '</h3><p>' + esc(a.excerpt) + '</p>' +
      '<div class="card-meta">' + badge(a) + '<span class="dot"></span>' + esc(timeAgo(a.pubDate)) + shareBtn(a) + '</div></div></a>';
  }
  function heroBlock(items, tagName) {
    var hero = items[0], side = items.slice(1, 4); byLink[hero.link] = hero;
    var henc = encodeURIComponent(hero.link), hno = hero.thumbnail ? '' : ' no-img';
    return '<div class="hero">' +
      '<a class="hero-main"' + openAttr(hero) + '><span class="hero-imgwrap' + hno + '" data-imglk="' + henc + '">' + pic(hero.thumbnail, true) + '</span>' +
        '<div class="hero-cap"><span class="tag">' + esc(tagName) + '</span>' +
        '<h2>' + esc(hero.title) + '</h2><p>' + esc(hero.excerpt) + '</p></div></a>' +
      '<div class="hero-side">' + side.map(function (a) { byLink[a.link] = a;
        var enc = encodeURIComponent(a.link), no = a.thumbnail ? '' : ' no-img';
        return '<a class="mini"' + openAttr(a) + '><span class="mini-thumb' + no + '" data-imglk="' + enc + '">' + pic(a.thumbnail) + '</span>' +
          '<div><h3>' + esc(a.title) + '</h3><div class="card-meta">' + badge(a) + '</div></div></a>';
      }).join('') + '</div></div>';
  }
  function secHead(title, moreId) {
    return '<div class="sec-head"><h2>' + esc(title) + '</h2><span class="rule"></span>' +
      (moreId ? '<a class="more" onclick="App.go(\'' + moreId + '\')">More ' + esc(title) + ' →</a>' : '') + '</div>';
  }
  function mergeFeeds(lists) {
    var seen = {}, out = [];
    lists.forEach(function (items) {
      items.forEach(function (a) {
        var k = (a.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 55);
        if (k && !seen[k]) { seen[k] = 1; out.push(a); }
      });
    });
    out.sort(function (x, y) { var dx = new Date(x.pubDate).getTime() || 0, dy = new Date(y.pubDate).getTime() || 0; return dy - dx; });
    return out;
  }

  /* ---------- widgets: weather + crypto ---------- */
  function wxIcon(code) {
    if (code === 0) return '☀️'; if (code <= 2) return '🌤️'; if (code === 3) return '☁️';
    if (code <= 48) return '🌫️'; if (code <= 67) return '🌧️'; if (code <= 77) return '🌨️';
    if (code <= 82) return '🌦️'; if (code <= 86) return '❄️'; return '⛈️';
  }
  function wxText(code) {
    if (code === 0) return 'Clear sky'; if (code <= 2) return 'Partly cloudy'; if (code === 3) return 'Overcast';
    if (code <= 48) return 'Fog'; if (code <= 57) return 'Drizzle'; if (code <= 67) return 'Rain';
    if (code <= 77) return 'Snow'; if (code <= 82) return 'Rain showers'; if (code <= 86) return 'Snow showers'; return 'Thunderstorm';
  }
  function renderWeather(el, place, cur) {
    el.innerHTML =
      '<div class="wx-main"><span class="wx-ic">' + wxIcon(cur.weathercode) + '</span>' +
      '<div><div class="wx-temp">' + Math.round(cur.temperature) + '°C</div>' +
      '<div class="wx-place">' + esc(place) + '</div></div></div>' +
      '<div class="wx-sub">' + wxText(cur.weathercode) + ' · wind ' + Math.round(cur.windspeed) + ' km/h</div>';
  }
  function loadWeather() {
    var el = $('wxBox'); if (!el) return;
    function forCoords(lat, lon, place) {
      fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current_weather=true')
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d && d.current_weather) renderWeather(el, place, d.current_weather); else throw 0; })
        .catch(function () { el.innerHTML = '<div class="wx-sub">Weather unavailable.</div>'; });
    }
    function byIp() {
      fetch('https://ipapi.co/json/').then(function (r) { return r.json(); })
        .then(function (d) { if (d && d.latitude) forCoords(d.latitude, d.longitude, (d.city || d.country_name || 'Your area')); else throw 0; })
        .catch(function () { forCoords(51.5074, -0.1278, 'London'); });
    }
    if (navigator.geolocation) {
      var done = false;
      var to = setTimeout(function () { if (!done) { done = true; byIp(); } }, 3500);
      navigator.geolocation.getCurrentPosition(
        function (p) { if (done) return; done = true; clearTimeout(to); forCoords(p.coords.latitude.toFixed(3), p.coords.longitude.toFixed(3), 'Your location'); },
        function () { if (done) return; done = true; clearTimeout(to); byIp(); },
        { timeout: 3000, maximumAge: 600000 }
      );
    } else byIp();
  }
  function loadCrypto() {
    var el = $('cryptoBox'); if (!el) return;
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.bitcoin) throw 0;
        function row(name, sym, o) {
          var ch = o.usd_24h_change || 0, up = ch >= 0;
          return '<div class="cx-row"><span class="cx-sym">' + sym + '</span><span class="cx-name">' + name + '</span>' +
            '<span class="cx-price">$' + Number(o.usd).toLocaleString('en-US') + '</span>' +
            '<span class="cx-chg ' + (up ? 'up' : 'down') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(ch).toFixed(2) + '%</span></div>';
        }
        el.innerHTML = row('Bitcoin', 'BTC', d.bitcoin) + row('Ethereum', 'ETH', d.ethereum);
      })
      .catch(function () { el.innerHTML = '<div class="wx-sub">Market data unavailable.</div>'; });
  }
  function widgetHtml() {
    return '<div class="box widget"><h3>🌦 Weather</h3><div id="wxBox" class="wx"><div class="wx-sub">Locating…</div></div></div>' +
           '<div class="box widget"><h3>📈 Markets</h3><div id="cryptoBox" class="cx"><div class="wx-sub">Loading…</div></div></div>';
  }
  function bootWidgets() { loadWeather(); loadCrypto(); }

  /* ---------- skeletons ---------- */
  function skeletonHome() {
    var r = ''; for (var i = 0; i < 4; i++) r += '<div class="sk sk-card"></div>';
    $('main').innerHTML = '<div class="hero"><div class="sk sk-hero"></div><div class="hero-side">' +
      '<div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-line"></div></div></div>' +
      '<div class="sec-head"><div class="sk" style="height:24px;width:180px;border-radius:6px"></div></div>' +
      '<div class="rail">' + r + '</div>';
  }

  /* ---------- views ---------- */
  function stamp() { var n = new Date(); if ($('updatedAt')) $('updatedAt').textContent = 'Updated ' + n.getHours() + ':' + ('0' + n.getMinutes()).slice(-2); }

  function renderHome(top) {
    var picks = top.slice(4, 7), latest = top.slice(7, 15), trending = top.slice(0, 7), html = '';
    html += '<div class="status-bar"><span id="catTitle">Top Stories</span><span class="updated" id="updatedAt"></span></div>';
    html += heroBlock(top, 'Breaking');
    html += secHead('Editor’s Picks', '');
    html += '<section class="grid picks">' + picks.map(card).join('') + '</section>';
    html += secHead('Latest News', 'world');
    html += '<div class="cols"><div class="hlist">' + latest.map(hrow).join('') + '</div>';
    html += '<aside class="sidebar">' + widgetHtml() +
      '<div class="box"><h3>Trending Now</h3>' +
      trending.map(function (a, i) { byLink[a.link] = a;
        return '<a class="rank-item"' + openAttr(a) + '><span class="rank-num">' + (i + 1) + '</span><h4>' + esc(a.title) + '</h4></a>';
      }).join('') + '</div></aside></div>';
    HOME_RAILS.forEach(function (id) {
      html += secHead(nameOf(id), id);
      html += '<div class="rail" id="rail-' + id + '"><div class="rail-empty">Loading…</div></div>';
    });
    $('main').innerHTML = html; stamp(); bootWidgets(); fillMissingImages();
  }
  function renderCategory(id, items) {
    pageItems = items; pageShown = 0;
    var html = '<div class="status-bar"><span id="catTitle">' + esc(nameOf(id)) + '</span><span class="updated" id="updatedAt"></span></div>';
    html += '<section id="heroWrap">' + heroBlock(items, nameOf(id)) + '</section>';
    html += secHead('More in ' + nameOf(id), '');
    html += '<section class="grid" id="catGrid"></section>';
    html += '<div class="load-more-wrap" id="loadWrap"><span class="scroll-sentinel" id="sentinel"></span><button class="load-more" onclick="App.loadMore()">Load more stories</button></div>';
    $('main').innerHTML = html; stamp(); appendPage(); observeSentinel();
  }
  function appendPage() {
    var g = $('catGrid'); if (!g) return;
    var start = 4 + pageShown, next = pageItems.slice(start, start + PAGE);
    g.insertAdjacentHTML('beforeend', next.map(card).join('')); pageShown += next.length;
    fillMissingImages(g);
    if (4 + pageShown >= pageItems.length) { var w = $('loadWrap'); if (w) w.style.display = 'none'; if (io) io.disconnect(); }
  }
  function observeSentinel() {
    if (io) io.disconnect();
    var s = $('sentinel'); if (!s || !('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) appendPage(); });
    }, { rootMargin: '600px' });
    io.observe(s);
  }
  function renderPhotos(id, items) {
    var html = '<div class="status-bar"><span id="catTitle">📷 In Pictures</span><span class="updated" id="updatedAt"></span></div>';
    html += '<p class="gallery-intro">The day in photography, curated by The Guardian. Tap any image to view it full screen.</p>';
    galleryItems = items.filter(function (a) { return a.thumbnail; });
    if (!galleryItems.length) galleryItems = items;
    html += '<section class="gallery">' + galleryItems.map(function (a, i) {
      var no = a.thumbnail ? '' : ' no-img', enc = encodeURIComponent(a.link);
      return '<figure class="ph" onclick="App.lightbox(' + i + ')" tabindex="0" onkeydown="if(event.key===\'Enter\'){App.lightbox(' + i + ')}">' +
        '<span class="ph-img' + no + '" data-imglk="' + enc + '">' + pic(a.thumbnail) + '</span>' +
        '<figcaption>' + esc(a.title) + '</figcaption></figure>';
    }).join('') + '</section>';
    $('main').innerHTML = html; stamp(); fillMissingImages();
  }
  function renderSaved() {
    var html = '<div class="status-bar"><span id="catTitle">★ Saved Stories</span></div>';
    if (!saved.length) { $('main').innerHTML = html + '<div class="state-msg">No saved stories yet. Tap the ☆ on any story to save it here.</div>'; return; }
    saved.forEach(function (a) { byLink[a.link] = a; });
    $('main').innerHTML = html + '<section class="grid">' + saved.map(card).join('') + '</section>';
    fillMissingImages();
  }
  function ticker(items) {
    var seq = items.slice(0, 12).map(function (a) {
      return '<a href="' + esc(a.link) + '" target="_blank" rel="noopener">' + esc(a.title) + '</a><span class="sep">•</span>';
    }).join('');
    if ($('tickerMove')) $('tickerMove').innerHTML = seq + seq;
  }
  function showState(msg, retry) {
    $('main').innerHTML = '<div class="state-msg">' + esc(msg) + (retry ? '<br><button onclick="App.go(App.current())">Try again</button>' : '') + '</div>';
  }

  /* ---------- lightbox (photo gallery) ---------- */
  function lightbox(i) {
    galleryIndex = i;
    var lb = $('lightbox');
    if (!lb) {
      lb = document.createElement('div'); lb.id = 'lightbox'; lb.className = 'lightbox';
      lb.innerHTML = '<button class="lb-close" aria-label="Close">✕</button>' +
        '<button class="lb-nav lb-prev" aria-label="Previous">‹</button>' +
        '<figure class="lb-stage"><img id="lbImg" alt=""><figcaption id="lbCap"></figcaption></figure>' +
        '<button class="lb-nav lb-next" aria-label="Next">›</button>';
      document.body.appendChild(lb);
      lb.querySelector('.lb-close').onclick = closeLightbox;
      lb.querySelector('.lb-prev').onclick = function (e) { e.stopPropagation(); lbStep(-1); };
      lb.querySelector('.lb-next').onclick = function (e) { e.stopPropagation(); lbStep(1); };
      lb.onclick = function (e) { if (e.target === lb) closeLightbox(); };
    }
    lbShow(); lb.classList.add('show'); document.body.classList.add('noscroll');
  }
  function lbShow() {
    var a = galleryItems[galleryIndex]; if (!a) return;
    $('lbImg').src = upscale(a.thumbnail || PLACEHOLDER);
    $('lbCap').innerHTML = '<b>' + esc(a.title) + '</b><a class="lb-open" href="' + esc(a.link) + '" target="_blank" rel="noopener">Open source ↗</a>';
  }
  function lbStep(d) { galleryIndex = (galleryIndex + d + galleryItems.length) % galleryItems.length; lbShow(); }
  function closeLightbox() { var lb = $('lightbox'); if (lb) lb.classList.remove('show'); document.body.classList.remove('noscroll'); }

  /* ---------- reader panel ---------- */
  var lastFocus = null;
  function relatedHtml(a) {
    var pool = mem[current === 'home' ? 'home' : current] || [];
    if (!pool.length) { for (var k in byLink) pool.push(byLink[k]); }
    var rel = [];
    for (var i = 0; i < pool.length && rel.length < 4; i++) {
      if (pool[i].link !== a.link) rel.push(pool[i]);
    }
    if (!rel.length) return '';
    return '<div class="reader-related"><h4>More stories</h4>' + rel.map(function (r) {
      var enc = encodeURIComponent(r.link), no = r.thumbnail ? '' : ' no-img';
      return '<a class="rel-item" href="' + esc(r.link) + '" onclick="return App.open(event,\'' + enc + '\')">' +
        '<span class="rel-thumb' + no + '" data-imglk="' + enc + '">' + pic(r.thumbnail) + '</span>' +
        '<span class="rel-title">' + esc(r.title) + '</span></a>';
    }).join('') + '</div>';
  }
  function openReader(a) {
    if (!a) return; lastFocus = document.activeElement;
    var enc = encodeURIComponent(a.link), on = isSaved(a.link);
    $('readerBody').innerHTML =
      (a.thumbnail ? '<div class="reader-img">' + pic(a.thumbnail, true) + '</div>' : '') +
      '<div class="reader-meta">' + badge(a) + '<span class="dot"></span>' + esc(timeAgo(a.pubDate)) + '</div>' +
      '<h2 class="reader-title">' + esc(a.title) + '</h2>' +
      '<p class="reader-text">' + esc(a.excerpt) + '</p>' +
      '<div class="reader-actions">' +
        '<a class="reader-open" href="' + esc(a.link) + '" target="_blank" rel="noopener">Read full article ↗</a>' +
        '<button id="readerSave" class="reader-save' + (on ? ' on' : '') + '" data-lk="' + enc + '" onclick="App.toggleSave(event,\'' + enc + '\')">' + (on ? '★ Saved' : '☆ Save') + '</button>' +
        '<button class="reader-share" onclick="App.share(event,\'' + enc + '\')">⤴ Share</button>' +
      '</div>' +
      '<p class="reader-note">Full text is hosted by ' + esc(a.source || 'the source') + '. Open the link above to read the complete article.</p>' +
      relatedHtml(a);
    var r = $('reader'); r.hidden = false; document.body.classList.add('noscroll');
    requestAnimationFrame(function () { r.classList.add('show'); var c = $('readerClose'); if (c) c.focus(); });
  }
  function closeReader() {
    var r = $('reader'); r.classList.remove('show');
    setTimeout(function () { r.hidden = true; document.body.classList.remove('noscroll'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }, 220);
  }
  function open(e, enc) {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return true;
    if (e) e.preventDefault();
    var scroller = $('reader'); if (scroller) { var p = scroller.querySelector('.reader-panel'); if (p) p.scrollTop = 0; }
    openReader(byLink[decodeURIComponent(enc)]); return false;
  }

  /* ---------- navigation ---------- */
  function nav() {
    $('navCats').innerHTML = NAV.map(function (id) {
      return '<span class="cat-link' + (id === current ? ' active' : '') + '" role="link" tabindex="0" ' +
        'onclick="App.go(\'' + id + '\')" onkeydown="if(event.key===\'Enter\'){App.go(\'' + id + '\')}">' + esc(nameOf(id)) + '</span>';
    }).join('');
  }
  function go(id, skipHash) {
    current = id; nav(); window.scrollTo({ top: 0, behavior: 'smooth' });
    document.title = (id === 'saved' ? 'Saved' : nameOf(id)) + ' — Pulse 24';
    if (!skipHash) { try { location.hash = id === 'home' ? '' : id; } catch (e) {} }
    if ($('searchInput')) $('searchInput').value = '';

    if (id === 'saved') { renderSaved(); return; }

    if (id === 'photos') {
      var pc = lsGet('feed:photos');
      if (pc && pc.length) { tag(pc, 'photos'); renderPhotos('photos', pc); }
      else $('main').innerHTML = '<div class="state-msg">Loading photos…</div>';
      fetchFresh('photos').then(function (items) { renderPhotos('photos', items); })
        .catch(function () { if (!(pc && pc.length)) showState('Could not load photos right now.', true); });
      return;
    }

    if (id === 'home') {
      var c = lsGet('merged:home');
      if (c && c.length) { c.forEach(function (a) { byLink[a.link] = a; }); ticker(c); renderHome(c); } else skeletonHome();
      Promise.all(HOME_BLEND.map(function (s) { return fetchFresh(s).catch(function () { return []; }); }))
        .then(function (lists) {
          var merged = mergeFeeds(lists);
          if (!merged.length) throw 0;
          lsSet('merged:home', merged); ticker(merged); renderHome(merged);
          HOME_RAILS.forEach(function (rid) {
            load(rid).then(function (items) { var el = $('rail-' + rid); if (el) { el.innerHTML = items.slice(0, 4).map(card).join(''); fillMissingImages(el); } })
              .catch(function () { var el = $('rail-' + rid); if (el) el.innerHTML = '<div class="rail-empty">Unavailable right now.</div>'; });
          });
        })
        .catch(function () { if (!(c && c.length)) showState('Could not load the news. If you opened this file directly, deploy it (Vercel) or run a local server — some feeds block direct browser access.', true); });
      return;
    }

    // category
    var cc = lsGet('feed:' + id);
    if (cc && cc.length) { tag(cc, id); ticker(mem['home'] || cc); renderCategory(id, cc); }
    else $('main').innerHTML = '<div class="state-msg">Loading ' + esc(nameOf(id)) + '…</div>';
    fetchFresh(id).then(function (items) { ticker(mem['home'] || items); renderCategory(id, items); })
      .catch(function () { if (!(cc && cc.length)) showState('Could not load ' + nameOf(id) + ' right now.', true); });
  }
  function refresh() {
    var b = $('refreshBtn'); if (b) { b.classList.add('spin'); setTimeout(function () { b.classList.remove('spin'); }, 900); }
    mem = {};
    try { for (var k in localStorage) if (k.indexOf('pulse:feed:') === 0 || k === 'pulse:merged:home') localStorage.removeItem(k); } catch (e) {}
    go(current, true);
  }
  function loadMore() { appendPage(); }
  function filter(q) {
    q = (q || '').toLowerCase().trim();
    if (!q) { go(current); return; }
    var m = [];
    for (var k in byLink) { var a = byLink[k]; if ((a.title + ' ' + a.excerpt).toLowerCase().indexOf(q) !== -1) m.push(a); }
    var html = '<div class="status-bar"><span id="catTitle">Search: “' + esc(q) + '”</span></div>';
    if (!m.length) { $('main').innerHTML = html + '<div class="state-msg">No stories match your search.</div>'; return; }
    $('main').innerHTML = html + '<section class="grid">' + m.slice(0, 40).map(card).join('') + '</section>';
    fillMissingImages();
  }

  /* ---------- init ---------- */
  function initChrome() {
    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var mo = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var d = new Date();
    $('dateStr').textContent = days[d.getDay()] + ', ' + mo[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    $('yearStr').textContent = '© ' + d.getFullYear() + ' Pulse 24 · Non-commercial news aggregator';

    var pref = null; try { pref = localStorage.getItem('pulse:theme'); } catch (e) {}
    var wantDark = pref === 'dark' || (pref === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (wantDark) { document.documentElement.setAttribute('data-theme', 'dark'); $('themeBtn').textContent = '☀ Light'; }
    $('themeBtn').onclick = function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (dark) { document.documentElement.removeAttribute('data-theme'); this.textContent = '🌙 Dark'; }
      else { document.documentElement.setAttribute('data-theme', 'dark'); this.textContent = '☀ Light'; }
      try { localStorage.setItem('pulse:theme', dark ? 'light' : 'dark'); } catch (e) {}
    };
    if ($('refreshBtn')) $('refreshBtn').onclick = refresh;
    if ($('savedBtn')) $('savedBtn').onclick = function () { go('saved'); };
    if ($('readerClose')) $('readerClose').onclick = closeReader;
    if ($('readerOverlay')) $('readerOverlay').onclick = closeReader;
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if ($('lightbox') && $('lightbox').classList.contains('show')) return closeLightbox(); if (!$('reader').hidden) closeReader(); }
      if ($('lightbox') && $('lightbox').classList.contains('show')) {
        if (e.key === 'ArrowLeft') lbStep(-1); if (e.key === 'ArrowRight') lbStep(1);
      }
    });

    var t; $('searchInput').addEventListener('input', function () { clearTimeout(t); var v = this.value; t = setTimeout(function () { filter(v); }, 220); });
    updateSavedCount();

    // back-to-top button
    var btt = document.createElement('button');
    btt.id = 'backTop'; btt.className = 'back-top'; btt.setAttribute('aria-label', 'Back to top'); btt.innerHTML = '↑';
    btt.onclick = function () { window.scrollTo({ top: 0, behavior: 'smooth' }); };
    document.body.appendChild(btt);
    window.addEventListener('scroll', function () { btt.classList.toggle('show', window.scrollY > 700); }, { passive: true });

    // hash routing
    window.addEventListener('hashchange', function () {
      var h = (location.hash || '').replace('#', '');
      if (h && h !== current && (FEEDS[h] || h === 'saved')) go(h, true);
      if (!h && current !== 'home') go('home', true);
    });
  }
  document.addEventListener('DOMContentLoaded', function () {
    loadSaved(); initChrome(); nav();
    var h = (location.hash || '').replace('#', '');
    go(h && (FEEDS[h] || h === 'saved') ? h : 'home', true);
    setInterval(function () { if (!$('searchInput').value && current === 'home') refresh(); }, 300000);
    if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  });

  return { go: go, open: open, toggleSave: toggleSave, share: share, closeReader: closeReader, loadMore: loadMore, refresh: refresh, lightbox: lightbox, current: function () { return current; } };
})();
