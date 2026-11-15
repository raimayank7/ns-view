/* NSShareCore: how a snapshot reaches another person's phone with NO server (platform group P3, plat-share). Pure functions
   (node scripts/test_share.js) used by the maker (share.niveshsahayak.in, reads the shop's own data) and the viewer
   (view.niveshsahayak.in, reads only the link or file it is given and never touches any data home).

   THE FORMAT ("NS1 token"). One text token carries one snapshot:
       NS1<flag>.<body>.<crc>        e.g.  NS1z.eJyr...Q.1a2b3c4d
     flag  z = deflate-raw compressed JSON, e = compressed then encrypted with a passcode, u = plain JSON (old browsers)
     body  base64url of the bytes (for e: 16 byte salt + 12 byte IV + AES-GCM ciphertext; key = PBKDF2-SHA256, 150,000 rounds)
     crc   CRC-32 of the body text as 8 hex digits: catches a link cut short or mistyped by a chat app. It is NOT a signature:
           anyone can make a token, so the viewer always says "details from a link, confirm with the shop". Only a passcode (e)
           also stops a stranger who gets the link from reading it, and its wrong-passcode check is the AES-GCM tag.
   The token travels in one of two ways:
     link  https://view.niveshsahayak.in/#NS1z.....   (everything after # is never sent to any server, not even ours)
     file  a small text file "NS1 ..." named *.nsshare; the viewer opens it with "Open a file", or the whole link / message can be pasted
   The JSON inside ("envelope"):  { v:1, k:kind, t:made date, x:expiry date or '', b:{n name, p phone, u upi, g gstin, a address}, d:{...} }
     kinds  stmt (party statement)  cat (catalogue to order from)  rcpt (e-receipt + warranty card)  fb (feedback / review)
            loy (loyalty card)  staff (staff phone view)
   Expiry is checked by the phone's own clock against x inside the data: a courtesy so an old dues page is not paid by mistake,
   not security (the data is still in the link). Sizes: LIMIT.chat chars is safe in a chat message; up to LIMIT.cut some apps may
   shorten the link, so also send the file; above that, file only; a QR is only made up to LIMIT.qr chars. */
(function (G) {
  'use strict';
  var VERSION = 1, PREFIX = 'NS1';
  var LIMIT = { chat: 1800, cut: 6000, qr: 900 };
  var ITER = 150000;
  var KINDS = ['stmt', 'cat', 'rcpt', 'fb', 'loy', 'staff'];

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((n + (n < 0 ? -1e-9 : 1e-9)) * 100) / 100; }
  function isoOk(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function addDays(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + (+n || 0)); return d.toISOString().slice(0, 10); }
  function addMonths(iso, n) {
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1 + (+n || 0), d = +iso.slice(8, 10);
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0');
  }

  /* ---------- bytes, base64url, crc ---------- */
  var CRC = null;
  function crc32(str) {
    if (!CRC) { CRC = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < str.length; i++) crc = CRC[(crc ^ str.charCodeAt(i)) & 0xFF] ^ (crc >>> 8);
    return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
  }
  function utf8(s) { return new TextEncoder().encode(s); }
  function unutf8(b) { return new TextDecoder().decode(b); }
  function b64u(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var bin = atob(s), b = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }
  function pipe(bytes, stream) {
    var cs = new G.Response(new G.Blob([bytes]).stream().pipeThrough(stream));
    return cs.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }
  function canZip() { return typeof G.CompressionStream === 'function' && typeof G.DecompressionStream === 'function' && typeof G.Response === 'function' && typeof G.Blob === 'function'; }
  function deflate(b) { return pipe(b, new G.CompressionStream('deflate-raw')); }
  function inflate(b) { return pipe(b, new G.DecompressionStream('deflate-raw')); }
  function canCrypt() { return !!(G.crypto && G.crypto.subtle && G.crypto.getRandomValues); }
  function key(pass, salt) {
    var s = G.crypto.subtle;
    return s.importKey('raw', utf8(String(pass)), 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return s.deriveKey({ name: 'PBKDF2', salt: salt, iterations: ITER, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }

  /* ---------- pack / unpack ---------- */
  /* env -> token. opt.pass = passcode (needs crypto), opt.plain = skip compression */
  function pack(env, opt) {
    opt = opt || {};
    var json = JSON.stringify(env), raw = utf8(json), zip = !opt.plain && canZip();
    var step = zip ? deflate(raw) : Promise.resolve(raw);
    return step.then(function (bytes) {
      if (!opt.pass) return { flag: zip ? 'z' : 'u', bytes: bytes };
      if (!canCrypt()) throw new Error('nocrypto');
      var salt = G.crypto.getRandomValues(new Uint8Array(16)), iv = G.crypto.getRandomValues(new Uint8Array(12));
      return key(opt.pass, salt).then(function (k) { return G.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, bytes); }).then(function (ct) {
        var out = new Uint8Array(28 + ct.byteLength); out.set(salt, 0); out.set(iv, 16); out.set(new Uint8Array(ct), 28);
        return { flag: 'e', bytes: out };
      });
    }).then(function (r) { var body = b64u(r.bytes); return PREFIX + r.flag + '.' + body + '.' + crc32(body); });
  }
  var RE = /NS1([zeu])\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})/;
  /* find a token inside any text: a link, a file, a pasted message */
  function find(text) { var m = RE.exec(String(text || '').replace(/\s+/g, '')); return m ? m[0] : ''; }
  function flagOf(token) { var m = RE.exec(token); return m ? (m[1] === 'e' ? 'e' : m[1]) : ''; }
  function needsPass(token) { return /NS1e\./.test(String(token || '')) ; }
  /* token -> { ok, env, expired, expiry } or { ok:false, err } with err one of format, crc, needpass, pass, version, kind, data */
  function unpack(token, opt) {
    opt = opt || {};
    var m = RE.exec(String(token || '').replace(/\s+/g, ''));
    if (!m) return Promise.resolve({ ok: false, err: 'format' });
    if (crc32(m[2]) !== m[3]) return Promise.resolve({ ok: false, err: 'crc' });
    var flag = m[1], bytes;
    try { bytes = unb64u(m[2]); } catch (e) { return Promise.resolve({ ok: false, err: 'format' }); }
    var step;
    if (flag === 'e') {
      if (!opt.pass) return Promise.resolve({ ok: false, err: 'needpass' });
      if (!canCrypt()) return Promise.resolve({ ok: false, err: 'nocrypto' });
      step = key(opt.pass, bytes.subarray(0, 16)).then(function (k) { return G.crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(16, 28) }, k, bytes.subarray(28)); })
        .then(function (ab) { return inflate(new Uint8Array(ab)); }, function () { throw new Error('pass'); });
    } else step = flag === 'z' ? inflate(bytes) : Promise.resolve(bytes);
    return step.then(function (raw) {
      var env;
      try { env = JSON.parse(unutf8(raw)); } catch (e) { return { ok: false, err: 'data' }; }
      if (!env || typeof env !== 'object' || !env.d) return { ok: false, err: 'data' };
      if (env.v !== VERSION) return { ok: false, err: 'version' };
      if (KINDS.indexOf(env.k) < 0) return { ok: false, err: 'kind' };
      var today = opt.today || new Date().toISOString().slice(0, 10);
      return { ok: true, env: env, expired: isoOk(env.x) && today > env.x, expiry: env.x || '' };
    }, function (e) { return { ok: false, err: e && e.message === 'pass' ? 'pass' : 'data' }; });
  }
  function make(kind, biz, data, opt) {
    opt = opt || {};
    var t = opt.today || new Date().toISOString().slice(0, 10), b = {};
    ['n', 'p', 'u', 'g', 'a'].forEach(function (k) { if (biz && biz[k]) b[k] = String(biz[k]); });
    return { v: VERSION, k: kind, t: t, x: opt.days ? addDays(t, +opt.days) : '', b: b, d: data };
  }
  /* sizes and what is safe: link length counts the viewer address */
  function sizes(token, base) {
    var link = (base || 'https://view.niveshsahayak.in/') + '#' + token, n = link.length;
    return { len: n, chat: n <= LIMIT.chat, cut: n > LIMIT.chat && n <= LIMIT.cut, fileOnly: n > LIMIT.cut, qr: n <= LIMIT.qr };
  }
  function linkOf(base, token) { return (base || 'https://view.niveshsahayak.in/') + '#' + token; }
  function fileText(token, title) { return 'NS1 snapshot' + (title ? ' - ' + title : '') + '\r\nOpen this file at https://view.niveshsahayak.in/ (Open a file), or paste the line below there.\r\n\r\n' + token + '\r\n'; }

  /* ---------- UPI ---------- */
  function upiOk(u) { return /^[a-z0-9._-]{2,64}@[a-z][a-z0-9.-]{1,32}$/i.test(String(u || '').trim()); }
  function upiLink(upi, name, amount, note) {
    var a = num(amount);
    return 'upi://pay?pa=' + encodeURIComponent(String(upi).trim()) + '&pn=' + encodeURIComponent(String(name || '').slice(0, 40)) + (a > 0 ? '&am=' + a.toFixed(2) : '') + '&cu=INR' + (note ? '&tn=' + encodeURIComponent(String(note).slice(0, 40)) : '');
  }

  /* ---------- party statement (kind stmt) ----------
     B = NSBooks, docs = the business's documents. opt: rows (how many latest lines, 0 = none), bills (open bills), upi (include pay data), phone, gstin */
  var LBL = { invoice: 'Invoice', cashmemo: 'Cash memo', credit: 'Credit note', debit: 'Debit note', receipt: 'Receipt', adv: 'Advance received', ref: 'Refund paid', pbill: 'Purchase bill', exp: 'Expense', voucher: 'Payment', ob: 'Opening balance', jv: 'Journal', note: 'Note' };
  function docLabel(d) { var t = d.type || 'invoice'; return LBL[t === 'note' ? d.kind : t === 'receipt' && d.kind !== 'pay' ? d.kind : t] || LBL[t] || t; }
  function statementData(B, docs, bizName, partyKey, opt) {
    opt = opt || {};
    var P = B.parties(docs, bizName)[partyKey]; if (!P) return null;
    var from = opt.from || '', to = opt.to || '', S = B.statement(docs, bizName, partyKey, from, to), nRows = opt.rows == null ? 12 : +opt.rows;
    var d = { pn: P.name, asof: opt.asof || to || new Date().toISOString().slice(0, 10), cb: r2(S.close), ob: r2(S.open) };
    if (nRows > 0) d.rows = S.rows.slice(-nRows).map(function (r) { return [r.date, docLabel(r.d), r.d.no || '', r2(r.dr), r2(r.cr), r2(r.bal)]; });
    if (nRows > 0 && S.rows.length > nRows) d.more = S.rows.length - nRows;
    if (opt.bills !== false) {
      var open = B.bills(docs, bizName, partyKey).bills.filter(function (b) { return b.side === 'recv' && b.left > 0.004; });
      d.bills = open.slice(0, 15).map(function (b) { return [b.no || docLabel(b), b.date, b.due || '', r2(b.left)]; });
      if (open.length > 15) d.moreBills = open.length - 15;
    }
    return d;
  }

  /* ---------- catalogue and orders (kind cat) ---------- */
  /* items = the shop's item records; opt.skip = {id:1}; prices come from retail rate; mrp shown only when set and different */
  function catalogueData(items, opt) {
    opt = opt || {}; var skip = opt.skip || {};
    var list = items.filter(function (it) { return it.desc && !skip[it.id] && num(it.rate) > 0; }).sort(function (a, b) { return String(a.desc).localeCompare(String(b.desc)); });
    return { note: String(opt.note || '').slice(0, 300), min: num(opt.min) || 0, gm: opt.gm === 'plus' || opt.gm === 'incl' ? opt.gm : 'none', items: list.slice(0, opt.max || 200).map(function (it) {
      var row = [String(it.desc).slice(0, 60), String(it.unit || '').slice(0, 10), r2(num(it.rate))];
      if (opt.mrp && num(it.mrp) > num(it.rate)) row.push(r2(num(it.mrp)));
      return row;
    }) };
  }
  function orderTotal(cat, qty) { var t = 0; (cat.items || []).forEach(function (r, i) { t += r2(num(qty[i]) * num(r[2])); }); return r2(t); }
  /* the clean WhatsApp text an order arrives as. Keep this layout: parseOrder reads it back. */
  function orderText(env, qty, who) {
    var cat = env.d, lines = [], n = 0, total = 0;
    (cat.items || []).forEach(function (r, i) { var q = num(qty[i]); if (q <= 0) return; var amt = r2(q * num(r[2])); total += amt; lines.push((++n) + '. ' + r[0] + ' x ' + q + (r[1] ? ' ' + r[1] : '') + ' @ ' + r[2].toFixed(2) + ' = ' + amt.toFixed(2)); });
    return 'ORDER for ' + ((env.b && env.b.n) || 'shop') + (who && who.name ? '\nName: ' + who.name : '') + (who && who.note ? '\nNote: ' + who.note : '') + (cat.gm === 'incl' ? '\nPrices: incl. GST' : cat.gm === 'plus' ? '\nPrices: plus GST' : '') + '\n' + lines.join('\n') + '\nTotal: ' + r2(total).toFixed(2) + '\n(NS order, ' + (env.t || '') + ')';
  }
  function parseOrder(text) {
    var out = { name: '', note: '', items: [], total: 0, gm: '' };
    String(text || '').split(/\r?\n/).forEach(function (ln) {
      var m;
      if ((m = /^\s*Name\s*:\s*(.+)$/i.exec(ln))) out.name = m[1].trim();
      else if ((m = /^\s*Note\s*:\s*(.+)$/i.exec(ln))) out.note = m[1].trim();
      else if ((m = /^\s*Prices\s*:\s*(incl|plus)/i.exec(ln))) out.gm = m[1].toLowerCase();
      else if ((m = /^\s*\d+[.)]\s*(.+?)\s+x\s*([\d.,]+)\s*([^\d@=\s][^@=]*?)?\s*(?:@\s*[₹]?\s*([\d.,]+))?\s*(?:=\s*[₹]?\s*([\d.,]+))?\s*$/.exec(ln))) {
        var q = num(m[2]), rate = m[4] != null ? num(m[4]) : 0, amt = m[5] != null ? num(m[5]) : r2(q * rate);
        if (!rate && q) rate = r2(amt / q);
        out.items.push({ desc: m[1].trim(), qty: q, unit: (m[3] || '').trim(), rate: rate, amount: amt });
      } else if ((m = /^\s*Total\s*:\s*[₹]?\s*([\d.,]+)/i.exec(ln))) out.total = num(m[1]);
    });
    return out;
  }
  /* a draft Sales Order record from a parsed order (seller = the business record); the owner finishes it in the Sales order maker */
  function draftOrder(po, seller, no, today, gst) {
    return {
      type: 'so', kind: 'so', no: no, date: today, status: 'sopen', copies: 1, paper: 'a4', design: 'classic', round: true, notes: po.note || '', terms: '', accent: '#0B3B5B',
      seller: Object.assign({}, seller), buyer: { name: po.name || '', addr: '', city: '', pin: '', state: '', gstin: '', phone: '' }, ship: null, withGst: gst !== false,
      items: po.items.map(function (it) { var g = gst == null ? 18 : +gst, rate = po.gm === 'incl' && g > 0 ? Math.round(it.rate / (1 + g / 100) * 10000) / 10000 : it.rate; return { desc: it.desc, hsn: '', qty: it.qty, unit: it.unit || 'Nos', rate: String(rate), disc: '', gst: g }; }), fromWhatsapp: true
    };
  }

  /* ---------- e-receipt and warranty (kind rcpt) ---------- */
  /* doc = a saved bill; war = { months: [months per line], terms, claim } */
  function receiptData(doc, totals, war) {
    war = war || {};
    var rows = (doc.items || []).map(function (it, i) {
      var m = Math.max(0, Math.min(120, Math.round(num((war.months || [])[i]))));
      return [String(it.desc || '').slice(0, 70), num(it.qty), r2(num(it.rate)), m, String(war.serial && war.serial[i] || '').slice(0, 30)];
    }).filter(function (r) { return r[0]; });
    return { no: doc.no || '', date: doc.date, buyer: (doc.buyer && doc.buyer.name) || '', total: r2(totals), paid: doc.status === 'paid', rows: rows, terms: String(war.terms || '').slice(0, 600), claim: String(war.claim || '').slice(0, 120) };
  }
  function warrantyEnd(date, months) { return isoOk(date) && months > 0 ? addMonths(date, months) : ''; }
  /* a calendar file so the phone reminds the buyer a week before warranty ends */
  function ics(title, iso, days) {
    var d = addDays(iso, -(days || 7)), ymd = function (s) { return s.replace(/-/g, ''); };
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nivesh Sahayak//Share//EN', 'BEGIN:VEVENT', 'UID:ns-' + crc32(title + iso) + '@niveshsahayak.in', 'DTSTAMP:' + ymd(d) + 'T000000Z',
      'DTSTART;VALUE=DATE:' + ymd(d), 'DTEND;VALUE=DATE:' + ymd(addDays(d, 1)), 'SUMMARY:' + String(title).replace(/[\r\n,;]/g, ' '), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
  }

  /* ---------- loyalty stamps (kind loy) ---------- */
  /* card = { name, phone, stamps: ['YYYY-MM-DD', ...], used: n (rewards already given) }; goal = stamps per reward */
  function loyaltyAdd(card, date, n) { card.stamps = card.stamps || []; for (var i = 0; i < (n || 1); i++) card.stamps.push(date); return card; }
  function loyaltyGive(card, goal) { if (loyaltyView(card, goal).rewards < 1) return false; card.used = (+card.used || 0) + 1; return true; }
  /* what the card shows: stamps filled on the current card of `goal` boxes, and how many rewards wait */
  function loyaltyView(card, goal) {
    var n = (card.stamps || []).length, used = +card.used || 0, done = Math.floor(n / goal), wait = Math.max(0, done - used);
    var onCard = wait > 0 ? goal : n - done * goal;
    return { total: n, goal: goal, filled: onCard, rewards: wait, toGo: wait > 0 ? 0 : goal - onCard, given: used };
  }
  function loyaltyData(card, prog) {
    return { who: String(card.name || '').slice(0, 40), prog: String(prog.title || '').slice(0, 60), goal: prog.goal, reward: String(prog.reward || '').slice(0, 60), stamps: (card.stamps || []).slice(-60), used: +card.used || 0, terms: String(prog.terms || '').slice(0, 200) };
  }

  /* ---------- feedback and review (kind fb) ---------- */
  function reviewUrlOk(u) { return /^https:\/\/(g\.page\/|g\.co\/|maps\.app\.goo\.gl\/|search\.google\.com\/local\/writereview|www\.google\.com\/maps\/|goo\.gl\/maps\/|www\.justdial\.com\/|www\.facebook\.com\/)/i.test(String(u || '').trim()); }
  function feedbackData(opt) { return { ask: String(opt.ask || '').slice(0, 120), review: reviewUrlOk(opt.review) ? String(opt.review).trim() : '', wa: String(opt.wa || '').replace(/\D/g, '').slice(-12), good: opt.good == null ? 4 : +opt.good }; }
  function feedbackText(env, stars, comment, name) { return 'Feedback for ' + ((env.b && env.b.n) || 'shop') + '\nRating: ' + stars + ' / 5' + (comment ? '\n' + comment : '') + (name ? '\n- ' + name : ''); }

  /* ---------- staff phone view (kind staff) ----------
     slip = a saved salary slip, advances = sadv records of this employee, att = { '1': 'P', ... } or null (hook for the payroll attendance) */
  function staffData(slip, B, advances, att, opt) {
    opt = opt || {};
    var s = B.salSplit(slip), out = { who: (slip.buyer && slip.buyer.name) || '', month: slip.month || '', days: String(slip.days || ''), paid: String(slip.paid || '') };
    if (opt.slip !== false) { out.earn = (slip.earn || []).filter(function (l) { return num(l.amt); }).map(function (l) { return [String(l.desc || '').slice(0, 40), r2(num(l.amt))]; });
      out.ded = (slip.ded || []).filter(function (l) { return num(l.amt); }).map(function (l) { return [String(l.desc || '').slice(0, 40), r2(num(l.amt))]; }); out.gross = s.gross; out.tded = s.ded; out.net = s.net; }
    if (opt.att !== false && att) { out.att = {}; Object.keys(att).forEach(function (k) { if (/^\d{1,2}$/.test(k)) out.att[k] = String(att[k]).slice(0, 2); }); }
    if (opt.adv !== false) {
      var bal = 0, rows = [];
      advances.slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }).forEach(function (a) { var v = r2(num(a.amount)) * (a.kind === 'back' ? -1 : 1); bal = r2(bal + v); rows.push([a.date, a.kind === 'back' ? 'Returned' : 'Given', r2(num(a.amount)), bal]); });
      out.advBal = bal; out.adv = rows.slice(-10);
    }
    return out;
  }

  var API = { VERSION: VERSION, LIMIT: LIMIT, KINDS: KINDS, crc32: crc32, pack: pack, unpack: unpack, find: find, make: make, sizes: sizes, linkOf: linkOf, fileText: fileText, needsPass: needsPass,
    canZip: canZip, canCrypt: canCrypt, upiOk: upiOk, upiLink: upiLink, docLabel: docLabel, statementData: statementData, catalogueData: catalogueData, orderTotal: orderTotal, orderText: orderText,
    parseOrder: parseOrder, draftOrder: draftOrder, receiptData: receiptData, warrantyEnd: warrantyEnd, ics: ics, loyaltyView: loyaltyView, loyaltyAdd: loyaltyAdd, loyaltyGive: loyaltyGive,
    loyaltyData: loyaltyData, reviewUrlOk: reviewUrlOk, feedbackData: feedbackData, feedbackText: feedbackText, staffData: staffData, addDays: addDays, addMonths: addMonths, flagOf: flagOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.NSShareCore = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
