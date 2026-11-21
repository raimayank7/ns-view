/* NSSlipView: the employee's page, view.niveshsahayak.in/pay/#<company code>-<access key>.
   The link carries the company code and the access key after the # (never sent to any server). The employee types the Employee ID and the
   PIN; the phone asks the Worker for the salt, works the key out itself (engine/slipportalcore.js), proves the PIN with a verifier, gets the
   ciphertext only if that is right, and opens it here. Nothing is stored on the phone unless "stay signed in" is ticked, and then only for
   this browser session (sessionStorage). Words: NS.t('slv.*'). */
(function () {
  'use strict';
  var NS = window.NS, $ = NS.$, esc = NS.esc, P = window.NSSlipPortal, SS = window.NSSlipSheet;
  function t(k, v) { return NS.t('slv.' + k, v); }
  var API = (window.NS_CFG && NS_CFG.pay) || '';
  var root, link = null, data = null, shown = '', last = '';
  function msg(kind, text, extra) { return '<div class="gt-card slp-card slp-msg ' + kind + '" role="alert"><h2>' + esc(text) + '</h2>' + (extra || '') + '</div>'; }
  function post(path, body) {
    return fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).catch(function () { return { ok: false, why: 'net' }; });
  }
  function wait(sec) { return sec >= 3600 ? Math.ceil(sec / 3600) + ' h' : sec >= 60 ? Math.ceil(sec / 60) + ' min' : sec + ' s'; }

  function askBox(note) {
    root.innerHTML = '<div data-out></div><form class="gt-card slp-card slp-form" data-f autocomplete="off" novalidate>' +
      '<label class="gt-lbl" for="slp-id">' + esc(t('eid')) + '</label><input id="slp-id" class="gt-in" autocomplete="off" autocapitalize="characters" spellcheck="false" required>' +
      '<label class="gt-lbl" for="slp-pin">' + esc(t('pin')) + '</label><div class="slp-pin"><input id="slp-pin" class="gt-in" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" required>' +
      '<button type="button" class="btn sm" data-show aria-pressed="false">' + esc(t('show')) + '</button></div>' +
      '<label class="chk"><input id="slp-rem" type="checkbox"> ' + esc(t('remember')) + '</label><p class="soft">' + esc(t('rememberh')) + '</p>' +
      '<div class="row"><button class="btn primary" data-go>' + esc(t('unlock')) + '</button></div><p class="soft">' + esc(t('private')) + '</p></form>';
    if (note) $('[data-out]', root).innerHTML = note;
    var pin = $('#slp-pin', root);
    $('[data-show]', root).addEventListener('click', function (e) { var b = e.currentTarget, on = pin.type === 'password'; pin.type = on ? 'text' : 'password'; b.setAttribute('aria-pressed', on); b.textContent = t(on ? 'hide' : 'show'); });
    $('[data-f]', root).addEventListener('submit', function (e) { e.preventDefault(); go($('#slp-id', root).value, pin.value, $('#slp-rem', root).checked); });
    $('#slp-id', root).focus();
  }

  function go(eid, pin, rem) {
    var out = $('[data-out]', root);
    eid = String(eid || '').trim(); pin = String(pin || '').trim();
    if (!eid || !/^\d{6}$/.test(pin)) { out.innerHTML = msg('bad', t('needboth')); return; }
    var btn = $('[data-go]', root); if (btn) btn.disabled = true;
    out.innerHTML = '<div class="gt-card slp-card" role="status"><p><span class="slp-wait" aria-hidden="true"></span>' + esc(t('working')) + '</p></div>';
    P.lookup(link.K, eid).then(function (lk) {
      return post('/salt', { code: link.code, lk: lk }).then(function (s) {
        if (!s.ok) return fail(s);
        return P.derive(pin, link.K, s.salt).then(function (d) {
          return post('/open', { code: link.code, lk: lk, vf: d.vf }).then(function (r) {
            if (!r.ok) return fail(r);
            return P.open(r.ct, d, link.code, lk).then(function (plain) {
              data = plain; data.updated = r.updated; data.eid = eid; shown = '';
              try { if (rem) sessionStorage.setItem('nspay-' + link.code, JSON.stringify({ e: eid, p: pin })); else sessionStorage.removeItem('nspay-' + link.code); } catch (e) {}
              show();
            }, function () { return fail({ why: 'error' }); });
          });
        });
      });
    }).catch(function () { fail({ why: 'error' }); });
  }
  function fail(r) {
    var out = $('[data-out]', root), btn = $('[data-go]', root); if (btn) btn.disabled = false;
    var w = r && r.why;
    if (w === 'off') { root.innerHTML = msg('bad', t('off'), '<p>' + esc(t('offh')) + '</p>'); return; }
    out.innerHTML = msg('bad', w === 'wrong' ? t('wrong') : w === 'locked' ? t('locked', { t: wait(r.wait || 900) }) : w === 'busy' ? t('busy') : w === 'net' ? t('neterr') : t('fail'), w === 'wrong' ? '<p>' + esc(t('wrongh')) + '</p>' : '');
  }

  function show() {
    var months = Object.keys(data.months || {}).sort().reverse();
    if (!months.length) { root.innerHTML = msg('', t('nodata'), '<p><button class="btn" data-lock>' + esc(t('lock')) + '</button></p>'); wire(); return; }
    if (!shown || !data.months[shown]) shown = months[0];
    var s = data.months[shown];
    root.innerHTML = '<div class="gt-card slp-card"><h2>' + esc(t('hello', { n: s.n })) + '</h2><p class="soft">' + esc(t('pick')) + '</p>' +
      '<div class="slp-months" role="group" aria-label="' + esc(t('months')) + '">' + months.map(function (m) { return '<button type="button" class="btn sm" data-m="' + esc(m) + '" aria-pressed="' + (m === shown) + '">' + esc(SS.month(m)) + '</button>'; }).join('') + '</div>' +
      (data.updated ? '<p class="soft">' + esc(t('updated', { d: NS.fmtDate(new Date(data.updated).toISOString().slice(0, 10)) })) + '</p>' : '') + '</div>' +
      SS.html(s, data.co) +
      '<p class="row slp-bar"><button class="btn primary" data-print>' + esc(t('print')) + '</button><button class="btn" data-lock>' + esc(t('lock')) + '</button></p>' +
      '<p class="soft slp-bar">' + esc(t('private')) + '</p>';
    wire();
    document.title = t('title') + ' - ' + SS.month(shown);
  }
  var BOUND = false;
  function wire() { if (BOUND) return; BOUND = true; root.addEventListener('click', onclick); }
  function onclick(e) {
    var m = e.target.closest('[data-m]'); if (m) { shown = m.getAttribute('data-m'); show(); return; }
    if (e.target.closest('[data-print]')) { window.print(); return; }
    if (e.target.closest('[data-lock]')) { data = null; try { sessionStorage.removeItem('nspay-' + link.code); } catch (er) {} askBox(); }
  }

  function noLink(note) {
    root.innerHTML = '<div data-out>' + (note || '') + '</div><form class="gt-card slp-card" data-lk novalidate><label class="gt-lbl" for="slp-lk">' + esc(t('paste')) + '</label>' +
      '<textarea id="slp-lk" class="gt-in" rows="2" spellcheck="false" placeholder="https://view.niveshsahayak.in/pay/#ABCD2345-..."></textarea><div class="row"><button class="btn primary">' + esc(t('open')) + '</button></div><p class="soft">' + esc(t('pasteh')) + '</p></form>';
    $('[data-lk]', root).addEventListener('submit', function (e) {
      e.preventDefault(); var v = $('#slp-lk', root).value, l = P.parseLink(v);
      if (!l) { noLink(msg('bad', /^[A-Z0-9]{8}$/i.test(v.trim()) ? t('codeonly') : t('badlink'))); return; }
      location.hash = '#' + l.code + '-' + l.K;
    });
  }
  function start() {
    root = $('#slip-view'); if (!root) return; wire();
    data = null; link = P.parseLink(decodeURIComponent((location.hash || '').slice(1)));
    if (!link) { noLink(); return; }
    if (!API) { root.innerHTML = msg('bad', t('soon')); return; }
    fetch(API + '/meta/' + link.code).then(function (r) { return r.json(); }).catch(function () { return { ok: false, why: 'net' }; }).then(function (m) {
      if (m.why === 'net') { root.innerHTML = msg('bad', t('neterr')); return; }
      if (m.why === 'busy') { root.innerHTML = msg('bad', t('busy')); return; }
      if (!m.exists) { root.innerHTML = msg('bad', t('notactive'), '<p>' + esc(t('notactiveh')) + '</p>'); return; }
      if (m.off) { root.innerHTML = msg('bad', t('off'), '<p>' + esc(t('offh')) + '</p>'); return; }
      askBox();
      var s = null; try { s = JSON.parse(sessionStorage.getItem('nspay-' + link.code) || 'null'); } catch (e) {}
      if (s && s.e && s.p) { $('#slp-id', root).value = s.e; $('#slp-pin', root).value = s.p; $('#slp-rem', root).checked = true; go(s.e, s.p, true); }
    });
  }
  window.addEventListener('hashchange', start);
  document.addEventListener('ns-lang', function () { if (data) show(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.NSSlipView = { start: start };
})();
