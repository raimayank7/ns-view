/* NSShareView: opens an NS1 snapshot (see sharecore.js) on the other person's phone. It reads ONLY the link / file / pasted text it is
   given: no data home, no store, nothing is sent anywhere. Used by view.niveshsahayak.in (page with #share-view) and, as a preview, by the
   maker (NSShareView.render(env, element, { preview: true })). Screen words: NS.t('sv.*'); names, items and notes are the shop's own text. */
(function () {
  'use strict';
  var NS = window.NS, $ = NS.$, $$ = NS.$$, esc = NS.esc, t = function (k, v) { return NS.t(k, v); }, C = window.NSShareCore;
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
  function m(v) { return NS.money(v); }
  function d(iso) { return iso ? NS.fmtDate(iso) : ''; }
  function ltr(s) { return '<bdi dir="ltr">' + esc(s) + '</bdi>'; }
  var KEEP = null, PASS = null, last = null;   /* the token being shown and its envelope */

  function head(env) {
    var b = env.b || {};
    return '<div class="sv-head"><b class="sv-shop">' + esc(b.n || t('sv.shop')) + '</b>' + (b.a ? '<span>' + esc(b.a) + '</span>' : '') +
      (b.p ? '<span>' + ltr(b.p) + '</span>' : '') + (b.g ? '<span>GSTIN ' + ltr(b.g) + '</span>' : '') + '</div>' +
      '<p class="note sv-snap">' + esc(t('sv.snap', { d: d(env.t), x: env.x ? t('sv.until', { d: d(env.x) }) : '' })) + ' ' + esc(t('sv.confirm')) + '</p>';
  }
  function table(cols, rows, nums) {
    return '<div class="gt-scroll"><table class="gt-tbl gt-list"><thead><tr>' + cols.map(function (c, i) { return '<th' + (nums && nums.indexOf(i) >= 0 ? ' class="n"' : '') + '>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (nums && nums.indexOf(i) >= 0 ? ' class="n"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function waLink(phone, text) { var p = String(phone || '').replace(/\D/g, ''); if (p.length === 10) p = '91' + p; return 'https://wa.me/' + (p.length >= 11 ? p : '') + '?text=' + encodeURIComponent(text); }
  function download(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  /* the QR library (cdnjs, pinned version + hash) loads only when a QR is needed */
  var QRJ = null;
  function qrLib() {
    if (window.qrcode) return Promise.resolve(true);
    return QRJ || (QRJ = new Promise(function (ok) {
      var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; s.integrity = 'sha384-mZT2gIty7ZDdOGkxfP6joZcYdMW1Jvj9dRlfpTmaJAKKXTqzygtB22k7FLe+KZC1';
      s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer'; s.onload = function () { ok(true); }; s.onerror = function () { ok(false); }; document.head.appendChild(s);
    }));
  }
  function qr(box, text) {
    return qrLib().then(function (okk) {
      if (!okk || !window.qrcode) { box.hidden = true; return; }
      try { var q = window.qrcode(0, 'M'); q.addData(text); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { box.hidden = true; }
    });
  }

  /* ---------- the six kinds ---------- */
  function stmt(env, el, o) {
    var x = env.d, b = env.b || {}, due = x.cb > 0.004, h = head(env);
    h += '<div class="gt-card"><h2>' + esc(t('sv.st.for', { p: x.pn })) + '</h2><p class="sv-big ' + (due ? 'due' : 'clear') + '">' +
      esc(due ? t('sv.st.due', { a: m(x.cb) }) : x.cb < -0.004 ? t('sv.st.adv', { a: m(-x.cb) }) : t('sv.st.nil')) + '</p><p class="soft">' + esc(t('sv.st.asof', { d: d(x.asof) })) + '</p>';
    if (due && b.u && C.upiOk(b.u)) {
      h += '<div class="sv-pay"><a class="btn primary" data-upi href="' + esc(C.upiLink(b.u, b.n, x.cb, 'Dues')) + '">' + esc(t('sv.st.pay', { a: m(x.cb) })) + '</a>' +
        '<div class="sv-qr" data-qr aria-label="UPI QR"></div><p class="note"><b>' + esc(t('sv.st.check')) + '</b> ' + esc(t('sv.st.payee', { n: b.n || '', u: b.u })) + '</p></div>';
    }
    h += '</div>';
    if (x.bills && x.bills.length) h += '<div class="gt-card"><h3>' + esc(t('sv.st.open')) + '</h3>' + table([t('sv.bill'), t('sv.date'), t('sv.duedate'), t('sv.left')],
      x.bills.map(function (r) { return [esc(r[0]), esc(d(r[1])), esc(d(r[2])), '<b>' + m(r[3]) + '</b>']; }), [3]) + (x.moreBills ? '<p class="soft">' + esc(t('sv.more', { n: x.moreBills })) + '</p>' : '') + '</div>';
    if (x.rows && x.rows.length) h += '<div class="gt-card"><h3>' + esc(t('sv.st.lines')) + '</h3>' + table([t('sv.date'), t('sv.what'), t('sv.dr'), t('sv.cr'), t('sv.bal')],
      x.rows.map(function (r) { return [esc(d(r[0])), esc(r[1] + (r[2] ? ' ' + r[2] : '')), r[3] ? m(r[3]) : '', r[4] ? m(r[4]) : '', m(r[5])]; }), [2, 3, 4]) + (x.more ? '<p class="soft">' + esc(t('sv.more', { n: x.more })) + '</p>' : '') + '</div>';
    el.innerHTML = h;
    var q = $('[data-qr]', el); if (q) qr(q, C.upiLink(b.u, b.n, x.cb, 'Dues'));
    if (!o.preview) el.insertAdjacentHTML('beforeend', '<p class="row gt-acts"><button type="button" class="btn" data-print>' + esc(t('sv.print')) + '</button></p>');
  }

  function cat(env, el, o) {
    var x = env.d, b = env.b || {}, h = head(env), qty = [];
    h += '<div class="gt-card"><h2>' + esc(t('sv.ct.title')) + '</h2>' + (x.note ? '<p>' + esc(x.note) + '</p>' : '') + (x.gm === 'incl' || x.gm === 'plus' ? '<p class="soft">' + esc(t(x.gm === 'incl' ? 'sv.ct.incl' : 'sv.ct.plus')) + '</p>' : '') +
      '<div class="sv-items">' + (x.items || []).map(function (r, i) {
        return '<div class="sv-item"><div><b>' + esc(r[0]) + '</b><small>' + m(r[2]) + (r[1] ? ' / ' + esc(r[1]) : '') + (r[3] ? ' <s>' + m(r[3]) + '</s>' : '') + '</small></div>' +
          '<div class="sv-step"><button type="button" class="btn sm" data-q="' + i + '" data-d="-1" aria-label="' + esc(t('sv.ct.less', { n: r[0] })) + '">−</button><input type="number" inputmode="decimal" min="0" step="any" value="0" data-qi="' + i + '" aria-label="' + esc(r[0]) + '">' +
          '<button type="button" class="btn sm" data-q="' + i + '" data-d="1" aria-label="' + esc(t('sv.ct.more', { n: r[0] })) + '">+</button></div></div>';
      }).join('') + '</div>' +
      '<div class="gt-card sv-tot"><div class="row"><b>' + esc(t('sv.ct.total')) + '</b><b data-tot>' + m(0) + '</b></div>' + (x.min ? '<p class="soft" data-min>' + esc(t('sv.ct.min', { a: m(x.min) })) + '</p>' : '') +
      '<label class="gt-lbl" for="sv-nm">' + esc(t('sv.ct.name')) + '</label><input id="sv-nm" class="gt-in" autocomplete="name">' +
      '<label class="gt-lbl" for="sv-nt">' + esc(t('sv.ct.note')) + '</label><input id="sv-nt" class="gt-in" placeholder="' + esc(t('sv.ct.noteph')) + '">' +
      '<div class="row"><button type="button" class="btn primary" data-order disabled>' + esc(b.p ? t('sv.ct.send') : t('sv.ct.copy')) + '</button></div><p class="soft">' + esc(t('sv.ct.how')) + '</p></div></div>';
    el.innerHTML = h;
    function upd() {
      qty = $$('[data-qi]', el).map(function (i) { return Math.max(0, num(i.value)); });
      var tot = C.orderTotal(x, qty), any = qty.some(function (q) { return q > 0; });
      $('[data-tot]', el).textContent = m(tot);
      var mn = $('[data-min]', el); if (mn) mn.classList.toggle('bad', any && tot < x.min);
      $('[data-order]', el).disabled = !any || (x.min && tot < x.min) || !!o.preview;
    }
    el.addEventListener('click', function (e) {
      var s = e.target.closest('[data-q]');
      if (s) { var i = $('[data-qi="' + s.getAttribute('data-q') + '"]', el), v = Math.max(0, num(i.value) + +s.getAttribute('data-d')); i.value = String(Math.round(v * 1000) / 1000); upd(); return; }
      if (e.target.closest('[data-order]')) {
        var text = C.orderText(env, qty, { name: $('#sv-nm', el).value.trim(), note: $('#sv-nt', el).value.trim() });
        if (b.p) window.open(waLink(b.p, text), '_blank', 'noopener'); else copy(text);
      }
    });
    el.addEventListener('input', function (e) { if (e.target.hasAttribute('data-qi')) upd(); });
    upd();
  }
  function copy(text) { if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { NS.toast(t('sv.copied')); }, function () { NS.toast(text); }); else NS.toast(text); }

  function rcpt(env, el, o) {
    var x = env.d, h = head(env), today = new Date().toISOString().slice(0, 10), soonest = '', title = '';
    h += '<div class="gt-card"><h2>' + esc(t('sv.rc.title', { n: x.no })) + '</h2><p class="soft">' + esc(d(x.date)) + (x.buyer ? ' · ' + esc(x.buyer) : '') + '</p>' +
      table([t('sv.item'), t('sv.qty'), t('sv.rate'), t('sv.rc.war')], (x.rows || []).map(function (r) {
        var end = C.warrantyEnd(x.date, r[3]), st = '';
        if (end) { var left = Math.round((new Date(end) - new Date(today)) / 864e5); st = '<b>' + esc(d(end)) + '</b><br><small class="' + (left < 0 ? 'bad' : '') + '">' + esc(left < 0 ? t('sv.rc.over') : t('sv.rc.left', { n: left })) + '</small>';
          if (left >= 0 && (!soonest || end < soonest)) { soonest = end; title = r[0]; } }
        else st = '<small>' + esc(t('sv.rc.none')) + '</small>';
        return [esc(r[0]) + (r[4] ? '<br><small>' + esc(t('sv.rc.serial')) + ' ' + ltr(r[4]) + '</small>' : ''), esc(r[1]), m(r[2]), st];
      }), [1, 2]) + '<p class="sv-big">' + esc(t('sv.rc.total', { a: m(x.total) })) + ' <small>' + esc(x.paid ? t('sv.rc.paid') : t('sv.rc.unpaid')) + '</small></p>' +
      (x.terms ? '<h3>' + esc(t('sv.rc.terms')) + '</h3><p class="sv-terms">' + esc(x.terms) + '</p>' : '') + (x.claim ? '<p><b>' + esc(t('sv.rc.claim')) + '</b> ' + esc(x.claim) + '</p>' : '') + '</div>';
    el.innerHTML = h;
    if (o.preview) return;
    var row = '<p class="row gt-acts"><button type="button" class="btn primary" data-keep>' + esc(t('sv.rc.keep')) + '</button><button type="button" class="btn" data-print>' + esc(t('sv.print')) + '</button>' +
      (soonest ? '<button type="button" class="btn" data-ics>' + esc(t('sv.rc.ics', { d: d(soonest) })) + '</button>' : '') + '</p><p class="soft">' + esc(t('sv.rc.keepnote')) + '</p>';
    el.insertAdjacentHTML('beforeend', row);
    el.addEventListener('click', function (e) { if (e.target.closest('[data-ics]')) download('warranty-' + soonest + '.ics', C.ics(t('sv.rc.icst', { i: title }), soonest, 7), 'text/calendar'); });
  }

  function fb(env, el, o) {
    var x = env.d, b = env.b || {}, stars = 0, h = head(env);
    h += '<div class="gt-card"><h2>' + esc(x.ask || t('sv.fb.ask', { n: b.n || '' })) + '</h2><div class="sv-stars" role="radiogroup" aria-label="' + esc(t('sv.fb.rate')) + '">' +
      [1, 2, 3, 4, 5].map(function (i) { return '<button type="button" class="sv-star" role="radio" aria-checked="false" data-s="' + i + '" aria-label="' + esc(t('sv.fb.n', { n: i })) + '">★</button>'; }).join('') + '</div>' +
      '<label class="gt-lbl" for="sv-fc">' + esc(t('sv.fb.say')) + '</label><textarea id="sv-fc" class="gt-in" rows="3"></textarea>' +
      '<label class="gt-lbl" for="sv-fn">' + esc(t('sv.ct.name')) + '</label><input id="sv-fn" class="gt-in" autocomplete="name">' +
      '<div class="row">' + (x.wa || b.p ? '<button type="button" class="btn primary" data-fbsend disabled>' + esc(t('sv.fb.send')) + '</button>' : '') +
      (x.review ? '<a class="btn" href="' + esc(x.review) + '" target="_blank" rel="noopener">' + esc(t('sv.fb.google')) + '</a>' : '') + '</div>' +
      '<p class="soft">' + esc(t('sv.fb.how')) + '</p></div>';
    el.innerHTML = h;
    el.addEventListener('click', function (e) {
      var s = e.target.closest('[data-s]');
      if (s) { stars = +s.getAttribute('data-s'); $$('[data-s]', el).forEach(function (n) { var on = +n.getAttribute('data-s') <= stars; n.classList.toggle('on', on); n.setAttribute('aria-checked', String(+n.getAttribute('data-s') === stars)); }); var sb = $('[data-fbsend]', el); if (sb && !o.preview) sb.disabled = false; return; }
      if (e.target.closest('[data-fbsend]')) window.open(waLink(x.wa || b.p, C.feedbackText(env, stars, $('#sv-fc', el).value.trim(), $('#sv-fn', el).value.trim())), '_blank', 'noopener');
    });
  }

  function loy(env, el, o) {
    var x = env.d, v = C.loyaltyView({ stamps: x.stamps || [], used: x.used }, x.goal || 10), h = head(env), box = '';
    for (var i = 0; i < v.goal; i++) box += '<span class="sv-box' + (i < v.filled ? ' on' : '') + '" aria-hidden="true">' + (i < v.filled ? '★' : i + 1) + '</span>';
    h += '<div class="gt-card"><h2>' + esc(x.prog || t('sv.ly.title')) + '</h2><p class="soft">' + esc(x.who ? t('sv.ly.for', { p: x.who }) : '') + '</p><div class="sv-card" data-card>' + box + '</div>' +
      '<p class="sv-big ' + (v.rewards ? 'clear' : '') + '" role="status">' + esc(v.rewards ? t('sv.ly.reward', { r: x.reward || t('sv.ly.gift'), n: v.rewards }) : t('sv.ly.togo', { n: v.toGo, r: x.reward || t('sv.ly.gift') })) + '</p>' +
      '<p class="soft">' + esc(t('sv.ly.count', { f: v.filled, g: v.goal, a: v.total, u: v.given })) + '</p>' + (x.terms ? '<p class="soft">' + esc(x.terms) + '</p>' : '') + '<p class="note">' + esc(t('sv.ly.note')) + '</p>' +
      (o.preview ? '' : '<p class="row gt-acts"><button type="button" class="btn primary" data-keep>' + esc(t('sv.ly.keep')) + '</button><button type="button" class="btn" data-png>' + esc(t('sv.ly.png')) + '</button></p>') + '</div>';
    el.innerHTML = h;
    var png = $('[data-png]', el); if (png) png.addEventListener('click', function () { cardPng(env, v); });
  }
  /* the card as a picture to keep or send: drawn on a canvas, nothing leaves the phone */
  function cardPng(env, v) {
    var x = env.d, c = document.createElement('canvas'), W = 900, cols = Math.min(5, v.goal), rows = Math.ceil(v.goal / cols), H = 300 + rows * 130, g;
    c.width = W; c.height = H; g = c.getContext('2d');
    g.fillStyle = '#FFF8EC'; g.fillRect(0, 0, W, H); g.fillStyle = '#0B3B5B'; g.fillRect(0, 0, W, 120);
    g.fillStyle = '#fff'; g.font = 'bold 44px sans-serif'; g.textBaseline = 'middle'; g.fillText((env.b && env.b.n || '').slice(0, 28), 40, 45); g.font = '30px sans-serif'; g.fillText((x.prog || '').slice(0, 40), 40, 90);
    g.fillStyle = '#222'; g.font = '34px sans-serif'; g.fillText((x.who || '').slice(0, 30), 40, 170);
    for (var i = 0; i < v.goal; i++) {
      var cx = 90 + (i % cols) * ((W - 140) / cols) + 40, cy = 260 + Math.floor(i / cols) * 130;
      g.beginPath(); g.arc(cx, cy, 48, 0, 7); g.fillStyle = i < v.filled ? '#E8A317' : '#fff'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#0B3B5B'; g.stroke();
      g.fillStyle = i < v.filled ? '#fff' : '#0B3B5B'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillText(i < v.filled ? '★' : String(i + 1), cx, cy + 2); g.textAlign = 'start';
    }
    g.fillStyle = '#555'; g.font = '26px sans-serif'; g.fillText((v.rewards ? 'Reward waiting: ' : 'Reward after ' + v.goal + ' stamps: ') + (x.reward || '').slice(0, 30), 40, H - 40);
    c.toBlob(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'loyalty-card.png'; document.body.appendChild(a); a.click(); a.remove(); }, 'image/png');
  }

  function staff(env, el, o) {
    var x = env.d, h = head(env), mo = x.month ? new Date(x.month + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '';
    h += '<div class="gt-card"><h2>' + esc(t('sv.sf.title', { p: x.who, m: mo })) + '</h2>';
    if (x.earn) h += '<p class="sv-big">' + esc(t('sv.sf.net', { a: m(x.net) })) + '</p><p class="soft">' + esc(t('sv.sf.days', { d: x.days || '-', p: x.paid || '-' })) + '</p>' +
      table([t('sv.sf.earn'), ''], x.earn.map(function (r) { return [esc(r[0]), m(r[1])]; }).concat([['<b>' + esc(t('sv.sf.gross')) + '</b>', '<b>' + m(x.gross) + '</b>']]), [1]) +
      (x.ded && x.ded.length ? table([t('sv.sf.ded'), ''], x.ded.map(function (r) { return [esc(r[0]), m(r[1])]; }).concat([['<b>' + esc(t('sv.sf.tded')) + '</b>', '<b>' + m(x.tded) + '</b>']]), [1]) : '');
    if (x.att) {
      var days = Object.keys(x.att).map(Number).sort(function (a, b) { return a - b; });
      h += '<h3>' + esc(t('sv.sf.att')) + '</h3><div class="sv-att">' + days.map(function (n) { var c = x.att[n]; return '<span class="a-' + esc(c.charAt(0).toLowerCase()) + '"><i>' + n + '</i>' + esc(c) + '</span>'; }).join('') + '</div>';
    }
    if (x.adv) h += '<h3>' + esc(t('sv.sf.adv')) + '</h3><p class="sv-big">' + esc(t('sv.sf.advbal', { a: m(x.advBal) })) + '</p>' +
      (x.adv.length ? table([t('sv.date'), t('sv.what'), t('sv.amt'), t('sv.bal')], x.adv.map(function (r) { return [esc(d(r[0])), esc(r[1] === 'Given' ? t('sv.sf.given') : t('sv.sf.back')), m(r[2]), m(r[3])]; }), [2, 3]) : '');
    h += '<p class="note">' + esc(t('sv.sf.private')) + '</p></div>';
    el.innerHTML = h;
    if (!o.preview) el.insertAdjacentHTML('beforeend', '<p class="row gt-acts"><button type="button" class="btn" data-print>' + esc(t('sv.print')) + '</button></p>');
  }

  var KIND = { stmt: stmt, cat: cat, rcpt: rcpt, fb: fb, loy: loy, staff: staff };
  function render(env, el, opt) {
    opt = opt || {};
    var fn = KIND[env.k]; if (!fn) return false;
    el.className = (el.className.replace(/\bsv-k-\w+/g, '') + ' sv-k-' + env.k).trim();
    fn(env, el, opt);
    if (!opt.preview) {
      var keep = $('[data-keep]', el);
      if (keep) keep.addEventListener('click', function () { if (KEEP) download('snapshot-' + env.k + '-' + (env.t || '') + '.nsshare', C.fileText(KEEP, (env.b && env.b.n) || ''), 'text/plain'); });
      var pr = $('[data-print]', el); if (pr) pr.addEventListener('click', function () { window.print(); });
      if (el.getAttribute('data-kept') !== '1') { el.setAttribute('data-kept', '1'); }
    }
    return true;
  }

  /* ---------- the viewer page ---------- */
  var root;
  function msg(kind, text, extra) { return '<div class="gt-card sv-msg ' + kind + '" role="alert"><h2>' + esc(text) + '</h2>' + (extra || '') + '</div>'; }
  function openToken(raw, pass) {
    var tok = C.find(raw);
    if (!tok) { root.querySelector('[data-out]').innerHTML = msg('bad', t('sv.e.format'), '<p>' + esc(t('sv.e.formath')) + '</p>'); return; }
    KEEP = tok; PASS = pass || null;
    C.unpack(tok, { pass: pass }).then(function (r) {
      var out = root.querySelector('[data-out]');
      if (!r.ok) {
        if (r.err === 'needpass' || r.err === 'pass') {
          out.innerHTML = msg(r.err === 'pass' ? 'bad' : '', r.err === 'pass' ? t('sv.e.pass') : t('sv.e.needpass'), '<form data-pass><label class="gt-lbl" for="sv-pw">' + esc(t('sv.passcode')) + '</label><input id="sv-pw" class="gt-in" type="password" autocomplete="off" required> <button class="btn primary">' + esc(t('sv.open')) + '</button></form><p class="soft">' + esc(t('sv.e.passh')) + '</p>');
          $('#sv-pw', out).focus();
        } else out.innerHTML = msg('bad', t('sv.e.' + (r.err === 'crc' ? 'crc' : r.err === 'version' ? 'version' : r.err === 'nocrypto' ? 'nocrypto' : 'data')), '<p>' + esc(t('sv.e.' + (r.err === 'crc' ? 'crch' : 'datah'))) + '</p>');
        return;
      }
      last = r.env;
      if (r.expired) { out.innerHTML = msg('bad', t('sv.e.expired', { d: d(r.expiry), s: (r.env.b && r.env.b.n) || t('sv.shop') }), '<p>' + esc(t('sv.e.expiredh')) + '</p>'); return; }
      out.innerHTML = ''; var box = document.createElement('div'); out.appendChild(box);
      if (!render(r.env, box)) out.innerHTML = msg('bad', t('sv.e.kind'));
      document.title = ((r.env.b && r.env.b.n) || 'Nivesh Sahayak') + ' - ' + t('sv.k.' + r.env.k);
    });
  }
  function start() {
    root = $('#share-view'); if (!root) return;
    root.innerHTML = '<div data-out></div><div class="gt-card sv-open gt-noprint"><h3>' + esc(t('sv.have')) + '</h3><label class="gt-lbl" for="sv-file">' + esc(t('sv.file')) + '</label><input id="sv-file" type="file" accept=".nsshare,.txt,text/plain">' +
      '<label class="gt-lbl" for="sv-paste">' + esc(t('sv.paste')) + '</label><textarea id="sv-paste" class="gt-in" rows="2" spellcheck="false" placeholder="https://view.niveshsahayak.in/#NS1z..."></textarea><div class="row"><button type="button" class="btn" data-go>' + esc(t('sv.open')) + '</button></div>' +
      '<p class="soft">' + esc(t('sv.privacy')) + '</p></div>';
    root.addEventListener('submit', function (e) { if (e.target.hasAttribute('data-pass')) { e.preventDefault(); openToken(KEEP, $('#sv-pw', root).value); } });
    root.addEventListener('click', function (e) { if (e.target.closest('[data-go]')) { var v = $('#sv-paste', root).value; if (v.trim()) openToken(v); } });
    $('#sv-file', root).addEventListener('change', function (e) { var f = e.target.files[0]; if (!f || f.size > 2e6) return; var r = new FileReader(); r.onload = function () { openToken(String(r.result)); }; r.readAsText(f); });
    function fromHash() { var h = decodeURIComponent((location.hash || '').slice(1)); if (h) openToken(h); }
    window.addEventListener('hashchange', fromHash); fromHash();
    document.addEventListener('ns-lang', function () { if (last && KEEP) openToken(KEEP, PASS); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.NSShareView = { render: render, qr: qr };
})();
