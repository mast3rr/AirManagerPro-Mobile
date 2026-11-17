/* AirManager Pro – Handy-App. Fünf Reiter: Heute, Buchungen, Ausgaben, Chat, Monat.
   Keine Browser-Dialoge (alert/confirm/prompt): eigene Blätter (Sheets) und Hinweise (Toasts). */
(function () {
  'use strict';
  const API = window.AM_API, I = window.AM_I18N, t = I.t, CFG = window.AM_CONFIG;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
  const ls = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)); } catch (e) { return null; } };
  const app = $('#app'), sheets = $('#sheets'), toasts = $('#toasts');

  /* ------------------------------------------------------------------ Datum, Geld, Notiz-Marken */
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => iso(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const nights = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const fmtDate = s => new Intl.DateTimeFormat(I.locale(), {day: '2-digit', month: '2-digit', year: 'numeric'}).format(parse(s));
  const fmtShort = s => new Intl.DateTimeFormat(I.locale(), {day: '2-digit', month: '2-digit'}).format(parse(s));
  const fmtDay = s => new Intl.DateTimeFormat(I.locale(), {weekday: 'short', day: '2-digit', month: '2-digit'}).format(parse(s));
  const fmtLong = d => new Intl.DateTimeFormat(I.locale(), {weekday: 'long', day: 'numeric', month: 'long'}).format(d);
  const fmtTime = d => new Intl.DateTimeFormat(I.locale(), {hour: '2-digit', minute: '2-digit'}).format(d);
  const ymNow = () => today().slice(0, 7);
  const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const ymRange = ym => { const [y, m] = ym.split('-').map(Number); return [`${ym}-01`, `${ym}-${pad(new Date(y, m, 0).getDate())}`]; };
  const ymLabel = ym => { const [y, m] = ym.split('-').map(Number); const s = new Intl.DateTimeFormat(I.locale(), {month: 'long', year: 'numeric'}).format(new Date(y, m - 1, 1)); return s.charAt(0).toUpperCase() + s.slice(1); };
  const plural = (key, n) => n === 1 ? t(key + '1') : t(key + 'N', {n});
  const cents = v => Math.round(Number(v || 0) * 100);
  const money = c => new Intl.NumberFormat(I.locale(), {style: 'currency', currency: 'EUR'}).format(c / 100);
  const amountText = v => (cents(v) / 100).toFixed(2).replace('.', ',');
  /* „120,50“ oder „120.5“ -> „120.50“; ungültig -> null. Gerechnet wird in Cent (keine Rundungsfehler). */
  const parseAmount = s => { const m = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(String(s).trim()); return m ? `${Number(m[1])}.${(m[2] || '').padEnd(2, '0')}` : null; };

  /* Herkunft/Zahlung stehen wie am Computer als Marken im Notizfeld (services/bookingsrc.py) – hier gleich gelesen und geschrieben. */
  const MARK = /^\[\[(src:airbnb|pay:open)\]\]\n?/, ICAL = /\n?\[\[ical:([A-Za-z0-9@._=+\-]{1,120})\]\]\s*$/;
  function splitNotes(notes) {
    let n = String(notes || ''), src = 'private', pay = 'paid', ical = '';
    const im = ICAL.exec(n); if (im) { ical = im[1]; n = n.replace(ICAL, ''); }
    for (let m; (m = MARK.exec(n));) { if (m[1] === 'src:airbnb') src = 'airbnb'; else pay = 'open'; n = n.slice(m[0].length); }
    return {src, pay, text: n, ical};
  }
  function joinNotes(src, pay, text, ical) {
    const out = (src === 'airbnb' ? '[[src:airbnb]]\n' : '') + (pay === 'open' ? '[[pay:open]]\n' : '') + splitNotes(text).text;
    return ical ? out + (out ? '\n' : '') + `[[ical:${ical}]]` : out;
  }

  /* ------------------------------------------------------------------ Symbole */
  const svg = (p, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const IC = {
    today: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>'),
    book: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    exp: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
    chat: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
    month: svg('<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    left: svg('<path d="m15 5-7 7 7 7"/>'), right: svg('<path d="m9 5 7 7-7 7"/>'),
    in: svg('<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M3 12h11M10 8l4 4-4 4"/>'),
    out: svg('<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M10 12h11M17 8l4 4-4 4"/>'),
    home: svg('<path d="M4 11 12 4l8 7v9H4z"/>'),
    clip: svg('<path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>'),
    cam: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    send: svg('<path d="M4 12 20 4l-6 16-3-7z"/>'),
    refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4v7h-7"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    wifi: svg('<path d="M3 9a14 14 0 0 1 18 0M6.5 12.5a9 9 0 0 1 11 0M10 16a4 4 0 0 1 4 0"/><path d="M3 3l18 18"/>'),
    file: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>'),
    grip: svg('<path d="M5 9h14M5 15h14"/>'),
    share: svg('<path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>'),
    image: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'),
    link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    bell: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
    shield: svg('<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/>'),
    face: svg('<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9v1.5M15 9v1.5M12 9v4h-1M9 15.5a4 4 0 0 0 6 0"/>'),
  };

  /* ------------------------------------------------------------------ Zustand */
  const S = {tab: ls('am_m_tab') || 'today', ym: ymNow(), pid: '', props: [], access: null, profile: null, device: 'ok',
             badge: 0, pending: 0, push: 'off', anaWhole: ls('am_m_ana') === 'all', ana: null, anaForce: false, peer: null, timers: [], seq: 0};
  const TABS = [['today', 'tabToday', IC.today], ['bookings', 'tabBookings', IC.book], ['expenses', 'tabExpenses', IC.exp],
                ['chat', 'tabChat', IC.chat], ['month', 'tabMonth', IC.month]];
  const perm = k => !!(S.access && S.access.permissions && S.access.permissions[k]);
  const canWrite = k => S.device === 'ok' && perm(k);
  const propName = id => { const p = S.props.find(x => x.id === id); return p ? p.name : '—'; };
  const isPrivate = id => !!(S.access && (S.access.private_properties || []).includes(id));

  const CATS = {Cleaning: 'catCleaning', Maintenance: 'catMaintenance', Utilities: 'catUtilities', Laundry: 'catLaundry', Supplies: 'catSupplies',
                Electricity: 'catElectricity', Water: 'catWater', Waste: 'catWaste', 'Property tax': 'catPropertyTax', Internet: 'catInternet', Other: 'catOther'};
  const catLabel = c => CATS[c] ? t(CATS[c]) : c;
  const PAID_BY = {'Manager Card': 'pbManager', 'Owner Account': 'pbOwner', Cash: 'pbCash', 'Bank Transfer': 'pbBank'};
  const B_STATUS = {confirmed: 'stConfirmed', checked_in: 'stCheckedIn', checked_out: 'stCheckedOut', cancelled: 'stCancelled'};

  /* ------------------------------------------------------------------ Hinweise, Fehlertexte */
  function toast(text, kind) {
    const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.textContent = text;
    toasts.appendChild(el); setTimeout(() => el.classList.add('out'), kind === 'err' ? 4200 : 2400); setTimeout(() => el.remove(), kind === 'err' ? 4600 : 2800);
  }
  function errText(e) {
    if (!e || !e.kind) return t('errGeneric');
    if (e.kind === 'offline') return t('offline');
    if (e.kind === 'auth') return t('sessionOver');
    const c = e.code;
    if (c === 'device_pending') return t('devPendingTitle');
    if (c === 'device_revoked' || c === 'device_unknown' || c === 'device_mismatch') return t('devRevoked');
    if (c === 'access_denied' || c === 'not_authorized') return t('errAccess');
    if (c === 'conflict') return t('errChanged');
    if (c === 'entity_not_found' || c === 'entity_deleted') return t('errGone');
    if (c === 'property_not_found') return t('errPropGone');
    if (['invalid_payload', 'constraint_violation', 'missing_field', 'reference_error'].includes(c)) return t('errValue');
    return e.kind === 'server' ? t('errBusy') : t('errGeneric');
  }

  /* ------------------------------------------------------------------ Anmeldung */
  function stopTimers() { S.timers.forEach(clearInterval); S.timers = []; }
  function showLogin(note) {
    stopTimers(); sheets.innerHTML = ''; document.body.className = 'is-login';
    app.innerHTML = `<div class="login"><img class="logo" src="icons/icon-192.png" alt="" width="84" height="84">
      <p class="creator">${esc(t('creator'))}<br><b>Brahim Ramaj</b></p><h1>${esc(t('appName'))}</h1><p class="muted">${esc(t('loginHint'))}</p>
      <form class="card form" novalidate>
        <label>${esc(t('email'))}<input name="email" type="email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email" required></label>
        <label>${esc(t('password'))}<input name="password" type="password" autocomplete="current-password" required></label>
        <p class="msg" role="alert" hidden></p>
        <button class="btn" type="submit">${esc(t('signIn'))}</button>
      </form>
      <div class="langs">${I.LANGS.map(l => `<button type="button" class="${l === I.lang ? 'on' : ''}" data-lang="${l}">${esc(I.names[l])}</button>`).join('')}</div></div>`;
    const form = $('form', app), msg = $('.msg', form), btn = $('button', form);
    if (note) { msg.hidden = false; msg.textContent = note; }
    $$('[data-lang]', app).forEach(b => b.onclick = () => { I.lang = b.dataset.lang; showLogin(); });
    form.onsubmit = async ev => {
      ev.preventDefault();
      const email = form.email.value.trim(), password = form.password.value;
      if (!email || !password) return;
      btn.disabled = true; btn.textContent = t('signingIn'); msg.hidden = true;
      try { await API.signIn(email, password); form.password.value = ''; await start(); }
      catch (e) {
        msg.hidden = false; btn.disabled = false; btn.textContent = t('signIn');
        msg.textContent = e.code === 'bad_login' ? t('badLogin') : e.code === 'too_many' ? t('tooMany') : e.code === 'not_authorized' ? t('notAllowed') : errText(e);
      }
    };
  }
  API.onSignedOut = () => showLogin(t('sessionOver'));

  /* ------------------------------------------------------------------ Start */
  async function start() {
    document.body.className = ''; app.innerHTML = `<div class="boot"><div class="spin"></div><p>${esc(t('loading'))}</p></div>`;
    try {
      const [access, profile, props, device] = await Promise.all([API.access(), API.profile(), API.properties(), API.registerDevice(t('devName'))]);
      Object.assign(S, {access, profile, props, device});
    } catch (e) {
      if (e.kind === 'auth') return;                                        // Anmeldeseite ist schon da
      if (e.code === 'not_authorized') { await API.signOut(); showLogin(t('notAllowed')); return; }
      app.innerHTML = `<div class="boot">${e.kind === 'offline' ? IC.wifi : ''}<h2>${esc(errText(e))}</h2>${e.kind === 'offline' ? `<p class="muted">${esc(t('offlineHint'))}</p>` : ''}
        <button class="btn" data-retry>${esc(t('retry'))}</button><button class="btn ghost" data-out>${esc(t('signOut'))}</button></div>`;
      $('[data-retry]', app).onclick = start;
      $('[data-out]', app).onclick = async () => { await API.signOut(); showLogin(); };
      return;
    }
    const qs = new URLSearchParams(location.search), want = qs.get('tab');   // über eine Mitteilung geöffnet: gleich den passenden Reiter (und Monat) zeigen
    if (want) { history.replaceState(null, '', location.pathname); if (VIEWS[want]) { S.tab = want; await pushMonth(want, qs.get('ym')); } }
    shell(); go(S.tab); checkPending(); checkUpdate();
    if (want === 'admin' && isAdmin()) adminSheet('dev');
    pushRefresh().then(async () => { if (S.push === 'on') { try { await pushSave(await pushSub()); } catch (e) { /* nächstes Mal */ } } });   // Sprache/Konto aktuell halten
    S.timers.push(setInterval(() => { if (!document.hidden) checkUpdate(); }, 1800000));
    if (perm('chat')) { pollBadge(); S.timers.push(setInterval(() => { if (!document.hidden) pollBadge(); }, 30000)); }
  }

  function shell() {
    const name = (S.profile && S.profile.display_name) || (API.user && API.user.email) || '?';
    app.innerHTML = `<header class="top"><div class="top-t"><h1 id="ttl"></h1><small id="sub"></small></div>
        <button class="rbtn" data-act="refresh" aria-label="${esc(t('refresh'))}">${IC.refresh}</button>
        <button class="avatar" data-act="settings" aria-label="${esc(t('settings'))}">${esc(name.trim().charAt(0).toUpperCase())}</button></header>
      <div id="banner"></div><main id="view" class="view"></main>
      <nav class="tabs">${TABS.map(([k, key, ic]) => `<button data-tab="${k}">${ic}<span>${esc(t(key))}</span>${k === 'chat' ? '<i class="dot" hidden></i>' : ''}</button>`).join('')}</nav>`;
    banner();
  }
  function banner() {
    const el = $('#banner'); if (!el) return;
    if (!navigator.onLine) el.innerHTML = `<div class="ban warn">${IC.wifi}<div><b>${esc(t('offline'))}</b><small>${esc(t('offlineHint'))}</small></div></div>`;
    else if (S.device === 'pending') el.innerHTML = `<div class="ban"><div>${IC.lock}</div><div><b>${esc(t('devPendingTitle'))}</b><small>${esc(t('devPendingText'))}</small><button class="link" data-act="devcheck">${esc(t('devCheck'))}</button></div></div>`;
    else if (S.device === 'revoked') el.innerHTML = `<div class="ban warn">${IC.lock}<div><b>${esc(t('devRevoked'))}</b></div></div>`;
    else el.innerHTML = '';
    if (S.pending && isAdmin() && navigator.onLine) el.insertAdjacentHTML('beforeend', `<div class="ban"><div>${IC.shield}</div><div><b>${esc(S.pending === 1 ? t('admBanner1') : t('admBannerN', {n: S.pending}))}</b><button class="link" data-act="admin">${esc(t('admOpen'))}</button></div></div>`);
  }
  window.addEventListener('online', banner); window.addEventListener('offline', banner);

  const VIEWS = {};
  function go(tab) {
    if (!VIEWS[tab]) tab = 'today';
    S.tab = tab; ls('am_m_tab', tab); S.peer = null; clearInterval(S.chatTimer);
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.body.classList.remove('in-thread');
    render();
  }
  async function render() {
    const view = $('#view'); if (!view) return;
    const my = ++S.seq, fn = VIEWS[S.tab];
    if (view.dataset.cur !== S.tab) view.innerHTML = `<div class="boot small"><div class="spin"></div></div>`;
    view.dataset.cur = S.tab;
    try { const html = await fn.load(); if (my !== S.seq) return; view.innerHTML = html; if (fn.after) fn.after(view); }
    catch (e) {
      if (my !== S.seq || e.kind === 'auth') return;
      view.innerHTML = `<div class="boot small">${e.kind === 'offline' ? IC.wifi : ''}<h2>${esc(errText(e))}</h2><button class="btn" data-act="refresh">${esc(t('retry'))}</button></div>`;
    }
  }
  const head = (title, sub) => { $('#ttl').textContent = title; $('#sub').textContent = sub || ''; };

  /* ------------------------------------------------------------------ Bausteine */
  const monthNav = () => `<div class="mnav"><button data-act="m-prev" aria-label="${esc(t('prevMonth'))}">${IC.left}</button>
    <button class="mlabel" data-act="m-now">${esc(ymLabel(S.ym))}</button><button data-act="m-next" aria-label="${esc(t('nextMonth'))}">${IC.right}</button></div>`;
  const propFilter = () => S.props.length > 1 ? `<label class="pfilter"><select data-filter aria-label="${esc(t('property'))}"><option value="">${esc(t('all'))}</option>
    ${S.props.map(p => `<option value="${p.id}" ${p.id === S.pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : '';
  const fab = (act, label) => `<button class="fab" data-act="${act}" aria-label="${esc(label)}">${IC.plus}</button>`;
  const empty = text => `<div class="empty">${esc(text)}</div>`;
  const tag = (cls, text) => `<span class="tag ${cls}">${esc(text)}</span>`;

  function bookingRow(b, mode) {
    const n = splitNotes(b.notes), cancelled = b.status === 'cancelled';
    const when = mode === 'arr' ? t('until', {d: fmtShort(b.check_out)}) : mode === 'dep' ? `${fmtShort(b.check_in)} – ${fmtShort(b.check_out)}`
      : `${fmtShort(b.check_in)} – ${fmtDate(b.check_out)}`;
    return `<button class="row ${cancelled ? 'dim' : ''}" data-act="booking" data-id="${b.id}">
      <div class="row-m"><b>${esc(b.guest_name)}</b><small>${esc(propName(b.property_id))}</small><small>${esc(when)} · ${esc(plural('nights', nights(b.check_in, b.check_out)))}</small>
        <div class="tags">${tag('st-' + b.status, t(B_STATUS[b.status] || 'stConfirmed'))}${n.src === 'airbnb' ? tag('air', t('srcAirbnb')) : ''}${n.pay === 'open' && !cancelled ? tag('open', t('payOpen')) : ''}</div></div>
      <div class="row-a mono">${esc(money(cents(b.amount)))}</div></button>`;
  }

  /* ------------------------------------------------------------------ Heute */
  VIEWS.today = {
    async load() {
      const d0 = today(), rows = await API.bookingsTouching(d0, addDays(d0, 7));
      const h = new Date().getHours(), hi = t(h < 11 ? 'hiMorning' : h < 18 ? 'hiDay' : 'hiEvening');
      head(`${hi}${S.profile ? ', ' + S.profile.display_name.split(' ')[0] : ''}`, fmtLong(new Date()));
      const arr = rows.filter(b => b.check_in === d0), dep = rows.filter(b => b.check_out === d0),
            stay = rows.filter(b => b.check_in < d0 && b.check_out > d0), next = rows.filter(b => b.check_in > d0);
      const busy = new Set(rows.filter(b => b.check_in <= d0 && b.check_out > d0).map(b => b.property_id));
      const active = S.props.filter(p => p.status !== 'inactive');
      const headS = (title, n) => `<h3 class="sec" data-grip>${esc(title)}<i>${n}</i><span class="grip">${IC.grip}</span></h3>`;
      const part = (key, title, n, inner) => `<section class="tsec" data-sec="${key}">${headS(title, n)}<div class="tbody">${inner}</div></section>`;
      const listOf = (list, mode) => list.length ? `<div class="list">${list.map(b => bookingRow(b, mode)).join('')}</div>` : empty(t('nothingToday'));
      const groups = {}; next.forEach(b => (groups[b.check_in] = groups[b.check_in] || []).push(b));
      const parts = {
        next: part('next', t('next7'), next.length, next.length ? Object.keys(groups).sort().map(d => `<div class="day">${esc(fmtDay(d))}</div><div class="list">${groups[d].map(b => bookingRow(b, 'arr')).join('')}</div>`).join('') : empty(t('nothingToday'))),
        arr: part('arr', t('arrivalsToday'), arr.length, listOf(arr, 'arr')), dep: part('dep', t('departuresToday'), dep.length, listOf(dep, 'dep')),
        stay: part('stay', t('staying'), stay.length, listOf(stay, 'arr'))};
      return `<div class="tiles"><div class="tile t-in">${IC.in}<b>${arr.length}</b><span>${esc(t('arrivals'))}</span></div>
          <div class="tile t-out">${IC.out}<b>${dep.length}</b><span>${esc(t('departures'))}</span></div>
          <div class="tile t-occ">${IC.home}<b>${active.filter(p => busy.has(p.id)).length}<em>/${active.length}</em></b><span>${esc(t('occupied'))}</span></div></div>
        <div class="quick">${canWrite('book_edit') ? `<button class="btn" data-act="new-booking">${IC.plus}${esc(t('newBooking'))}</button>` : ''}
          ${canWrite('exp_edit') ? `<button class="btn ghost" data-act="new-expense">${IC.plus}${esc(t('newExpense'))}</button>` : ''}</div>
        ${S.props.length ? '' : empty(t('noProps'))}
        <div id="tsecs">${todayOrder().map(k => parts[k]).join('')}</div><p class="hint">${esc(t('todayHint'))}</p>`;
    },
    after(view) { wireReorder($('#tsecs', view)); },
  };

  /* Reihenfolge der Abschnitte auf „Heute“: Überschrift gedrückt halten und nach oben/unten ziehen. Gilt nur für dieses Handy. */
  const T_DEFAULT = ['next', 'arr', 'dep', 'stay'];
  function todayOrder() {
    let o; try { o = JSON.parse(ls('am_m_today') || 'null'); } catch (e) { o = null; }
    return Array.isArray(o) && o.length === T_DEFAULT.length && T_DEFAULT.every(k => o.includes(k)) ? o : T_DEFAULT;
  }
  function wireReorder(box) {
    if (!box) return;
    const view = $('#view');
    let timer = 0, drag = null, sx = 0, sy = 0;
    const mid = el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
    const begin = sec => {
      const before = sec.getBoundingClientRect().top;
      drag = sec; box.classList.add('reorder'); sec.classList.add('dragging');
      view.scrollTop += sec.getBoundingClientRect().top - before;          // die gehaltene Überschrift bleibt unter dem Finger
      if (navigator.vibrate) navigator.vibrate(12);
    };
    const move = y => {                                                   // die ANDEREN Abschnitte wandern – der gehaltene bleibt im Dokument (sonst verliert das iPhone die Berührung)
      let all = $$('.tsec', box), i = all.indexOf(drag);
      for (let k = i + 1; k < all.length && y > mid(all[k]); k++) drag.before(all[k]);
      all = $$('.tsec', box); i = all.indexOf(drag);
      for (let k = i - 1; k >= 0 && y < mid(all[k]); k--) drag.after(all[k]);
    };
    const end = () => {
      clearTimeout(timer); timer = 0;
      if (!drag) return;
      drag.classList.remove('dragging'); box.classList.remove('reorder');
      ls('am_m_today', JSON.stringify($$('.tsec', box).map(s => s.dataset.sec)));
      drag.scrollIntoView({block: 'nearest'}); drag = null;
    };
    const down = (target, x, y) => {
      const h = target.closest && target.closest('[data-grip]'); if (!h || !box.contains(h)) return;
      sx = x; sy = y; clearTimeout(timer); timer = setTimeout(() => { timer = 0; begin(h.parentNode); }, 420);
    };
    const moved = (x, y, ev) => {
      if (drag) { ev.preventDefault(); move(y); }
      else if (timer && Math.hypot(x - sx, y - sy) > 10) { clearTimeout(timer); timer = 0; }   // Finger bewegt sich: das ist Scrollen, kein Halten
    };
    box.addEventListener('touchstart', e => { const p = e.touches[0]; down(e.target, p.clientX, p.clientY); }, {passive: true});
    box.addEventListener('touchmove', e => { const p = e.touches[0]; moved(p.clientX, p.clientY, e); }, {passive: false});
    box.addEventListener('touchend', end); box.addEventListener('touchcancel', end);
    box.addEventListener('mousedown', e => down(e.target, e.clientX, e.clientY));
    box.addEventListener('mousemove', e => moved(e.clientX, e.clientY, e));
    box.addEventListener('mouseup', end); box.addEventListener('mouseleave', end);
    box.addEventListener('contextmenu', e => { if (e.target.closest('[data-grip]')) e.preventDefault(); });
  }

  /* ------------------------------------------------------------------ Buchungen */
  let cache = {bookings: [], expenses: [], receipts: {}};
  VIEWS.bookings = {
    async load() {
      const [a, b] = ymRange(S.ym); cache.bookings = await API.bookingsByCheckIn(a, b);
      const list = cache.bookings.filter(x => !S.pid || x.property_id === S.pid), counted = list.filter(x => x.status !== 'cancelled');
      head(t('tabBookings'), plural('bookings', counted.length));
      return `${monthNav()}${propFilter()}
        ${list.length ? `<div class="list">${list.map(x => bookingRow(x)).join('')}</div>
          <div class="sum"><span>${esc(t('total'))}</span><b class="mono">${esc(money(counted.reduce((s, x) => s + cents(x.amount), 0)))}</b></div>` : empty(t('noBookings'))}
        ${canWrite('book_edit') ? fab('new-booking', t('newBooking')) : ''}`;
    },
  };

  /* ------------------------------------------------------------------ Ausgaben */
  VIEWS.expenses = {
    async load() {
      const [a, b] = ymRange(S.ym); cache.expenses = await API.expensesByDate(a, b);
      const files = await API.receiptsOf(cache.expenses.map(x => x.id)).catch(() => []);
      cache.receipts = {}; files.forEach(f => { if (!cache.receipts[f.entity_id]) cache.receipts[f.entity_id] = f; });   // neuester Beleg je Ausgabe
      const list = cache.expenses.filter(x => !S.pid || x.property_id === S.pid);
      head(t('tabExpenses'), plural('expenses', list.length));
      return `${monthNav()}${propFilter()}
        ${list.length ? `<div class="list">${list.map(x => `<button class="row" data-act="expense" data-id="${x.id}">
            <div class="row-m"><b>${esc(x.title)}</b><small>${esc(propName(x.property_id))} · ${esc(fmtDate(x.date))}</small>
              <div class="tags">${tag('cat', catLabel(x.category))}${x.status === 'pending' ? tag('open', t('exPending')) : ''}${cache.receipts[x.id] ? `<span class="tag clip">${IC.clip}${esc(t('receipt'))}</span>` : ''}</div></div>
            <div class="row-a mono neg">${esc(money(cents(x.amount)))}</div></button>`).join('')}</div>
          <div class="sum"><span>${esc(t('total'))}</span><b class="mono neg">${esc(money(list.reduce((s, x) => s + cents(x.amount), 0)))}</b></div>` : empty(t('noExpenses'))}
        ${canWrite('exp_edit') ? fab('new-expense', t('newExpense')) : ''}`;
    },
  };

  /* ------------------------------------------------------------------ Monat */
  /* ------------------------------------------------------------------ Analyse (wie „Analysen“ am Computer): Abrechnung, wer bekommt was,
     Auszahlungen als Minus und das Guthaben über alle Jahre. Gerechnet wird in mobile/statement.js – derselbe Weg wie am Computer. */
  const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
  async function anaData(force) {
    if (!force && S.ana && Date.now() - S.ana.at < 60000) return S.ana;
    const raw = await API.statementData(), def = CFG.defaults || {};
    const names = {}, emails = new Set();
    const note = (e, n) => { e = String(e || '').toLowerCase(); if (!e) return; emails.add(e); if (n && !names[e]) names[e] = n; };
    note(API.user.email, S.profile && S.profile.display_name);
    for (const d of Object.values(raw.ownership)) { (d && d.owners || []).forEach(o => note(o.email, o.name)); if (d && d.manager) note(d.manager.email, d.manager.name); }
    Object.keys(raw.payouts).forEach(k => note(k.split('|').slice(1).join('|')));
    if (isAdmin()) { try { (await API.admin.staff()).forEach(u => note(u.email, u.display_name)); } catch (e) { /* ohne Liste: Namen aus den Einstellungen */ } }
    const find = async h => { if (!h) return ''; for (const e of emails) if (await sha(e) === h) return e; return ''; };
    const ownerEmail = (await find(def.ownerHash)) || (isAdmin() ? String(API.user.email).toLowerCase() : '');
    const managerEmail = await find(def.managerHash);
    S.ana = {at: Date.now(), data: {...raw, me: String(API.user.email).toLowerCase(), access: S.access,
      opts: {mode: def.mode || 'manager', rate: Number.isFinite(def.rate) ? def.rate : 3000, ownerEmail, managerEmail, names}}};
    return S.ana;
  }
  const eur = c => money(c), minus = c => '− ' + money(c);
  const personName = (p, onlyProfit) => p.email ? p.name : t(onlyProfit ? 'anaOwnerNA' : 'anaManagerNA');
  async function analytics(force) {
    const {data} = await anaData(force), [y, m] = S.ym.split('-').map(Number), whole = !!S.anaWhole;
    const mo = window.AM_STATEMENT.overview(data, {year: y, month: m, pid: S.pid || null, whole});
    const life = window.AM_STATEMENT.lifetime(data, new Date().getFullYear()).filter(q => q.email && !q.noacct);
    head(t('tabMonth'), whole ? t('anaAllTime') : ymLabel(S.ym));
    const rates = [...new Set(mo.rows.map(r => r.rate))];
    const flow = mo.has_data ? `<div class="card flow">
        <div class="fr"><span>${esc(t(whole ? 'anaAllBookings' : 'anaMonthBookings'))}<small>${esc(plural('bookings', mo.total.bookings))}</small></span><b class="mono">${esc(eur(mo.total.gross))}</b></div>
        <div class="fr neg"><span>${esc(t('anaCommission'))}${rates.length === 1 ? `<small>${esc(String(rates[0]).replace('.', ','))} %</small>` : ''}</span><b class="mono">${esc(minus(mo.total.commission))}</b></div>
        <div class="fr neg"><span>${esc(t(whole ? 'anaExpAll' : 'anaExpMonth'))}</span><b class="mono">${esc(minus(mo.total.expenses))}</b></div>
        <div class="fr tot"><span>${esc(t('anaProfit'))}</span><b class="mono ${mo.total.profit < 0 ? 'neg' : ''}">${esc(eur(mo.total.profit))}</b></div></div>` : empty(t(whole ? 'anaNoneAll' : 'anaNoneMonth'));
    const ppl = mo.has_data ? `<h3 class="sec">${esc(t('anaWho'))}</h3><div class="ppl">${mo.people.map(p => `<div class="card pc ${p.me ? 'mine' : ''}">
        <b class="pn">${esc(personName(p, p.profit && !p.commission))}${p.me ? ` <small>(${esc(t('anaYou'))})</small>` : ''}</b>
        ${p.commission ? `<div class="pr"><span>${esc(t('anaCommShort'))}</span><span class="mono">${esc(eur(p.commission))}</span></div>` : ''}
        ${p.profit || !p.commission ? `<div class="pr"><span>${esc(t('anaShare'))}</span><span class="mono ${p.profit < 0 ? 'neg' : ''}">${esc(eur(p.profit))}</span></div>` : ''}
        <div class="pr tt"><span>${esc(t('total'))}</span><span class="mono">${esc(eur(p.total))}</span></div>
        ${p.email && !p.noacct ? `<div class="pr neg"><span>${esc(t('anaPaid'))}</span><span class="mono">${esc(minus(p.paid))}</span></div>
          <div class="pr open"><span>${esc(t('anaOpen'))}</span><b class="mono ${p.total - p.paid < 0 ? 'neg' : 'pos'}">${esc(eur(p.total - p.paid))}</b></div>` : ''}</div>`).join('')}</div>
        ${!whole ? `<p class="hint">${esc(t('anaPaidMonthHint'))}</p>` : ''}` : '';
    const rows = mo.rows.length > 1 || (mo.rows.length && S.pid === '') ? `<h3 class="sec">${esc(t('anaPerProp'))}</h3><div class="list">${mo.rows.map(r => `<div class="row static arow"><div class="row-m">
        <b>${esc(r.name)}</b><small>${esc(plural('bookings', r.bookings))} · ${esc(t('anaCommShort'))} ${esc(String(r.rate).replace('.', ','))} %</small>
        <small>${esc(t('income'))} ${esc(eur(r.gross))} · ${esc(t('anaCommShort'))} ${esc(eur(r.commission))} · ${esc(t('spent'))} ${esc(eur(r.expenses))}</small>
        <small>${r.shares.map(s => `${esc(s.email ? s.name : t('anaOwnerNA'))} ${esc(String(s.pct).replace('.', ','))} %: ${esc(eur(s.amount))}`).join(' · ')}</small></div>
        <div class="row-a"><b class="mono ${r.profit < 0 ? 'neg' : 'pos'}">${esc(eur(r.profit))}</b></div></div>`).join('')}</div>` : '';
    const bal = life.length ? `<h3 class="sec">${esc(t('anaBalance'))}</h3>${life.sort((a, b) => (b.me - a.me)).map(q => `<div class="card bal ${q.me ? 'mine' : ''}">
        <div class="bh"><b>${esc(q.name)}${q.me ? ` <small>(${esc(t('anaYou'))})</small>` : ''}</b><b class="mono big ${q.balance < 0 ? 'neg' : 'pos'}">${esc(eur(q.balance))}</b></div>
        <p class="muted small">${esc(t('anaBalanceHint'))}</p>
        <div class="pr"><span>${esc(t('anaEarnedAll'))}</span><span class="mono">${esc(eur(q.earned))}</span></div>
        <div class="pr neg"><span>${esc(t('anaPaidAll'))}</span><span class="mono">${esc(minus(q.withdrawn))}</span></div>
        <div class="yrs">${q.rows.map(r => `<div class="yr"><span>${r.year}</span><span class="mono">${esc(eur(r.earned))}</span><span class="mono neg">${r.withdrawn ? esc(minus(r.withdrawn)) : '–'}</span><b class="mono">${esc(eur(r.balance))}</b></div>`).join('')}
          <div class="yr yh"><span>${esc(t('anaYear'))}</span><span>${esc(t('anaEarned'))}</span><span>${esc(t('anaPaidShort'))}</span><span>${esc(t('anaRunning'))}</span></div></div></div>`).join('')}` : '';
    return `<div class="${whole ? 'ana-whole' : ''}">${monthNav()}</div>${propFilter()}
      ${seg('ana', [['m', t('anaMonth')], ['all', t('anaAllTimeShort')]], whole ? 'all' : 'm')}
      <h3 class="sec">${esc(whole ? t('anaStatement') + ' · ' + t('anaAllTime') : t('anaMonthly') + ' · ' + ymLabel(S.ym))}</h3>
      ${flow}${ppl}${rows}${bal}<p class="hint">${esc(t('anaNote'))}</p>`;
  }
  async function simpleMonth() {
      const [a, b] = ymRange(S.ym), [bk, ex] = await Promise.all([API.bookingsByCheckIn(a, b), API.expensesByDate(a, b)]);
      head(t('tabMonth'), ymLabel(S.ym));
      const by = {}; const at = id => (by[id] = by[id] || {inc: 0, exp: 0});
      bk.filter(x => x.status !== 'cancelled').forEach(x => { at(x.property_id).inc += cents(x.amount); });
      ex.forEach(x => { at(x.property_id).exp += cents(x.amount); });
      const ids = [...new Set([...S.props.map(p => p.id), ...Object.keys(by)])];
      const allPrivate = ids.length > 0 && ids.every(isPrivate);            // Privat-Konto: die eigenen Wohnungen zählen in die Summe
      const inSum = id => allPrivate || !isPrivate(id);
      const tot = ids.filter(inSum).reduce((s, id) => ({inc: s.inc + at(id).inc, exp: s.exp + at(id).exp}), {inc: 0, exp: 0});
      const res = c => `<b class="mono ${c < 0 ? 'neg' : 'pos'}">${esc(money(c))}</b>`;
      return `${monthNav()}
        <div class="kpis"><div class="kpi"><span>${esc(t('income'))}</span><b class="mono pos">${esc(money(tot.inc))}</b></div>
          <div class="kpi"><span>${esc(t('spent'))}</span><b class="mono neg">${esc(money(tot.exp))}</b></div>
          <div class="kpi wide"><span>${esc(t('result'))}</span>${res(tot.inc - tot.exp)}</div></div>
        ${ids.length ? `<div class="list">${ids.map(id => { const v = at(id); return `<div class="row static"><div class="row-m"><b>${esc(propName(id))}${!inSum(id) ? ' ' + tag('air', t('srcPrivate')) : ''}</b>
            <small>${esc(t('income'))} ${esc(money(v.inc))} · ${esc(t('spent'))} ${esc(money(v.exp))}</small></div><div class="row-a">${res(v.inc - v.exp)}</div></div>`; }).join('')}</div>` : empty(t('monthEmpty'))}
        <p class="hint">${esc(t('monthHint'))}</p>`;
  }
  VIEWS.month = {
    load() { const f = S.anaForce; S.anaForce = false; return perm('reports') ? analytics(f) : simpleMonth(); },
    after(view) {
      $$('[data-seg="ana"] button', view).forEach(b => b.addEventListener('click', () => { S.anaWhole = b.dataset.v === 'all'; ls('am_m_ana', S.anaWhole ? 'all' : 'm'); render(); }));
    },
  };

  /* ------------------------------------------------------------------ Blatt (Sheet) von unten */
  function sheet({title, body, saveLabel, onSave, cls}) {
    const el = document.createElement('div'); el.className = 'sheet-w';
    el.innerHTML = `<div class="sheet ${cls || ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sh-h"><button type="button" class="link" data-x>${esc(onSave ? t('cancel') : t('close'))}</button><h2>${esc(title)}</h2>
        ${onSave ? `<button type="button" class="link strong" data-save>${esc(saveLabel || t('save'))}</button>` : '<span class="sp"></span>'}</div>
      <div class="sh-b">${body}<p class="msg" role="alert" hidden></p></div></div>`;
    sheets.appendChild(el); requestAnimationFrame(() => el.classList.add('in'));
    const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 220); };
    const msg = $('.msg', el), say = text => { msg.hidden = !text; msg.textContent = text || ''; if (text) msg.scrollIntoView({block: 'nearest'}); };
    el.addEventListener('click', e => { if (e.target === el) close(); });
    $('[data-x]', el).onclick = close;
    const save = $('[data-save]', el);
    if (save) save.onclick = async () => {
      if (save.disabled) return;
      save.disabled = true; const label = save.textContent; save.textContent = t('saving'); say('');
      try { if (await onSave({el, say}) !== false) close(); }
      catch (e) { say(errText(e)); if (e.code === 'device_pending') { S.device = 'pending'; banner(); } }
      finally { save.disabled = false; save.textContent = label; }
    };
    return {el, close, say};
  }
  const field = (label, html) => `<label class="f"><span>${esc(label)}</span>${html}</label>`;
  const seg = (name, opts, val) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === val ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
  const segVal = (el, name) => { const b = $(`[data-seg="${name}"] .on`, el); return b ? b.dataset.v : ''; };
  const wireSegs = el => $$('.seg', el).forEach(s => s.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $$('button', s).forEach(x => x.classList.toggle('on', x === b)); }));
  const propSelect = val => `<select name="property_id">${S.props.filter(p => p.status !== 'inactive' || p.id === val).map(p => `<option value="${p.id}" ${p.id === val ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;

  /* ------------------------------------------------------------------ Buchung anlegen / bearbeiten */
  function bookingForm(b) {
    const isNew = !b, ro = !canWrite('book_edit');
    let cur = b || {property_id: S.pid || (S.props[0] || {}).id, guest_name: '', check_in: today(), check_out: addDays(today(), 1), amount: '', status: 'confirmed', notes: '', version: 0};
    const fill = () => {
      const n = splitNotes(cur.notes);
      return `<fieldset ${ro ? 'disabled' : ''}>${field(t('property'), propSelect(cur.property_id))}
        ${field(t('guest'), `<input name="guest_name" maxlength="120" autocomplete="off" value="${esc(cur.guest_name)}">`)}
        <div class="two">${field(t('checkIn'), `<input name="check_in" type="date" value="${esc(cur.check_in)}">`)}${field(t('checkOut'), `<input name="check_out" type="date" value="${esc(cur.check_out)}">`)}</div>
        <p class="nights muted"></p>
        ${field(t('amount'), `<input name="amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${cur.amount === '' ? '' : esc(amountText(cur.amount))}">`)}
        <div class="f"><span>${esc(t('source'))}</span>${seg('src', [['private', t('srcPrivate')], ['airbnb', t('srcAirbnb')]], n.src)}</div>
        <div class="f"><span>${esc(t('payment'))}</span>${seg('pay', [['paid', t('payPaid')], ['open', t('payOpen')]], n.pay)}</div>
        ${field(t('status'), `<select name="status">${Object.keys(B_STATUS).map(k => `<option value="${k}" ${k === cur.status ? 'selected' : ''}>${esc(t(B_STATUS[k]))}</option>`).join('')}</select>`)}
        ${field(t('notes'), `<textarea name="notes" rows="3" maxlength="2000">${esc(n.text)}</textarea>`)}</fieldset>`;
    };
    const wire = el => {
      wireSegs(el);
      const ci = $('[name=check_in]', el), co = $('[name=check_out]', el), out = $('.nights', el);
      const upd = () => { const n = ci.value && co.value ? nights(ci.value, co.value) : 0; out.textContent = n > 0 ? plural('nights', n) : ''; };
      ci.addEventListener('change', () => { if (ci.value && (!co.value || co.value <= ci.value)) co.value = addDays(ci.value, 1); upd(); });
      co.addEventListener('change', upd); upd();
    };
    const sh = sheet({title: isNew ? t('newBooking') : ro ? t('tabBookings') : t('editBooking'), body: `<form class="form" novalidate>${fill()}</form>`,
      onSave: ro ? null : async ({el, say}) => {
        const f = $('form', el), v = n => f.elements[n].value.trim();
        const amount = parseAmount(v('amount') || '0');
        if (!v('guest_name')) { say(t('errGuest')); return false; }
        if (!v('check_in') || !v('check_out') || v('check_out') <= v('check_in')) { say(t('errDates')); return false; }
        if (amount === null) { say(t('errAmount')); return false; }
        const old = splitNotes(cur.notes);
        const fields = {property_id: v('property_id'), guest_name: v('guest_name'), check_in: v('check_in'), check_out: v('check_out'), amount, status: v('status'),
                        notes: joinNotes(segVal(el, 'src'), segVal(el, 'pay'), f.elements.notes.value, old.ical)};
        if (!isNew) {                                                        // erst prüfen, ob inzwischen ein anderes Gerät geändert hat
          const fresh = await API.booking(cur.id);
          if (!fresh || fresh.deleted_at) { say(t('errGone')); return false; }
          if (fresh.version !== cur.version) { cur = fresh; f.innerHTML = fill(); wire(el); say(t('errChanged')); return false; }
        }
        if (fields.status !== 'cancelled') {                                  // gleiche Regel wie am Computer
          const hit = (await API.bookingsOverlapping(fields.property_id, fields.check_in, fields.check_out)).filter(x => x.id !== cur.id);
          const p = S.props.find(x => x.id === fields.property_id);
          if (hit.length >= ((p && p.units) || 1)) { say(t('errOverlap')); return false; }
        }
        if (isNew) await API.apply('booking', API.uuid(), 'insert', 0, fields);
        else await API.apply('booking', cur.id, 'update', cur.version, fields);
        toast(t('saved'), 'ok'); S.ym = fields.check_in.slice(0, 7); render();
      }});
    wire(sh.el);
  }

  /* ------------------------------------------------------------------ Foto verkleinern (Kamera/Galerie -> JPEG) */
  function toJpeg(file, maxSide, quality) {
    return new Promise((ok, fail) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); c.toBlob(b => b ? ok(b) : fail(new Error('blob')), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('image')); };
      img.src = url;
    });
  }
  const toBase64 = blob => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = fail; r.readAsDataURL(blob); });

  /* Texterkennung (Tesseract, freie Software): läuft komplett auf dem Handy – das Foto geht dafür an keinen fremden Dienst.
     Wird erst beim ersten Beleg geladen (einmalig einige MB, danach aus dem Zwischenspeicher). */
  let ocrLib = null;
  const loadOcr = () => ocrLib || (ocrLib = new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = 'ocr/tesseract.min.js';
    s.onload = () => ok(window.Tesseract); s.onerror = () => { ocrLib = null; s.remove(); fail(new Error('ocr')); };
    document.head.appendChild(s);
  }));
  async function readReceipt(blob, onProgress) {
    const T = await loadOcr(), dir = new URL('ocr', location.href).href;
    const worker = await T.createWorker(['deu', 'sqi'], 1, {workerPath: dir + '/worker.min.js', corePath: dir, langPath: dir, workerBlobURL: false, gzip: true,
      logger: m => { if (m.status === 'recognizing text') onProgress(Math.round((m.progress || 0) * 100)); }});
    try { const r = await worker.recognize(blob); return window.AM_RECEIPT.parse((r.data && r.data.text) || ''); }
    finally { worker.terminate(); }
  }

  /* Bild groß ansehen: mit zwei Fingern zoomen, doppelt tippen (2,5-fach / zurück), gezoomt verschieben, teilen/sichern.
     Die Seite selbst bleibt unzoombar (sonst gerät die Tastatur-Erkennung durcheinander) – gezoomt wird nur das Bild. */
  function dataToBlob(src) {
    const m = /^data:([^;,]+);base64,(.*)$/.exec(src || ''); if (!m) return null;
    const bin = atob(m[2]), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], {type: m[1]});
  }
  function lightbox(src, blob) {
    const el = document.createElement('div'); el.className = 'lb';
    el.innerHTML = `<div class="lb-bar"><button type="button" class="lb-b" data-share aria-label="${esc(t('lbShare'))}" hidden>${IC.share}</button>
      <button type="button" class="lb-b" data-x aria-label="${esc(t('close'))}">×</button></div><img alt="" draggable="false">`;
    const img = $('img', el); img.src = src; document.body.appendChild(el);
    let s = 1, x = 0, y = 0, g = null, moved = false, lastTap = 0, tapTimer = 0;
    const bounds = () => ({mx: Math.max(0, (img.offsetWidth * s - el.clientWidth) / 2), my: Math.max(0, (img.offsetHeight * s - el.clientHeight) / 2)});
    const clamp = () => { const b = bounds(); x = Math.min(b.mx, Math.max(-b.mx, x)); y = Math.min(b.my, Math.max(-b.my, y)); };
    const draw = anim => { img.style.transition = anim ? 'transform .22s ease' : 'none'; img.style.transform = `translate(${x}px, ${y}px) scale(${s})`; el.classList.toggle('zoomed', s > 1.01); };
    const rel = (cx, cy) => { const r = el.getBoundingClientRect(); return [cx - r.left - r.width / 2, cy - r.top - r.height / 2]; };
    const zoomAt = (ns, px, py) => { ns = Math.min(5, Math.max(1, ns)); x = px - (px - x) * ns / s; y = py - (py - y) * ns / s; s = ns; if (s === 1) x = y = 0; clamp(); };
    const close = () => { clearTimeout(tapTimer); el.remove(); if (blob && /^blob:/.test(src)) URL.revokeObjectURL(src); };
    el.addEventListener('touchstart', e => {
      const T = e.touches;
      if (T.length === 2) {
        const [ax, ay] = rel(T[0].clientX, T[0].clientY), [bx, by] = rel(T[1].clientX, T[1].clientY);
        g = {pinch: true, d: Math.hypot(ax - bx, ay - by) || 1, s, x, y, mx: (ax + bx) / 2, my: (ay + by) / 2}; moved = true;
      } else if (T.length === 1) { g = {pinch: false, sx: T[0].clientX, sy: T[0].clientY, x, y}; moved = false; }
    }, {passive: true});
    el.addEventListener('touchmove', e => {
      const T = e.touches; if (!g) return;
      if (g.pinch && T.length === 2) {
        e.preventDefault();
        const [ax, ay] = rel(T[0].clientX, T[0].clientY), [bx, by] = rel(T[1].clientX, T[1].clientY);
        const ns = Math.min(5, Math.max(1, g.s * Math.hypot(ax - bx, ay - by) / g.d)), mx = (ax + bx) / 2, my = (ay + by) / 2;
        s = ns; x = mx - (g.mx - g.x) * ns / g.s; y = my - (g.my - g.y) * ns / g.s; draw(false);
      } else if (!g.pinch && T.length === 1) {
        const dx = T[0].clientX - g.sx, dy = T[0].clientY - g.sy;
        if (Math.hypot(dx, dy) > 8) moved = true;
        if (s > 1.01) { e.preventDefault(); x = g.x + dx; y = g.y + dy; draw(false); }      // nur gezoomt verschieben – sonst bleibt langes Drücken (Sichern) möglich
      }
    }, {passive: false});
    el.addEventListener('touchend', e => { if (e.touches.length === 0 && g) { if (s < 1.05) { s = 1; x = y = 0; } clamp(); draw(true); g = null; } });
    el.addEventListener('wheel', e => { e.preventDefault(); const [px, py] = rel(e.clientX, e.clientY); zoomAt(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), px, py); draw(false); }, {passive: false});
    el.addEventListener('click', e => {
      if (e.target.closest('.lb-bar')) return;
      if (moved) { moved = false; return; }                               // Ende eines Zooms/Verschiebens ist kein Tippen
      const now = Date.now(), [px, py] = rel(e.clientX, e.clientY);
      if (now - lastTap < 320) {                                          // doppelt tippen: hinein- oder herauszoomen
        clearTimeout(tapTimer); lastTap = 0;
        if (s > 1.01) { s = 1; x = y = 0; } else zoomAt(2.5, px, py);
        draw(true); return;
      }
      lastTap = now;
      if (s <= 1.01 && e.target !== img) tapTimer = setTimeout(close, 330); // einmal neben das Bild tippen: schließen
    });
    $('[data-x]', el).onclick = close;
    const file = blob || dataToBlob(src);
    const shareBtn = $('[data-share]', el);
    if (file && navigator.canShare) {
      const f = new File([file], 'airmanager-' + Date.now() + (/png/.test(file.type) ? '.png' : '.jpg'), {type: file.type || 'image/jpeg'});
      if (navigator.canShare({files: [f]})) {
        shareBtn.hidden = false;
        shareBtn.onclick = () => navigator.share({files: [f]}).catch(() => {});        // iPhone: „Bild sichern“, AirDrop, WhatsApp …
      }
    }
    draw(false);
  }

  /* ------------------------------------------------------------------ Ausgabe anlegen / bearbeiten */
  function expenseForm(x) {
    const isNew = !x, ro = !canWrite('exp_edit');
    let cur = x || {property_id: S.pid || (S.props[0] || {}).id, title: '', category: 'Other', amount: '', date: today(), receipt_number: '', paid_by: 'Manager Card', status: 'paid', itemized_positions: [], version: 0};
    let photo = null, photoUrl = '', ocrItems = null, ocrRun = 0;
    const has = !isNew && cache.receipts[cur.id];
    const fill = () => {
      const fixed = (cur.itemized_positions || []).length > 0, cats = Object.keys(CATS).includes(cur.category) ? Object.keys(CATS) : [cur.category, ...Object.keys(CATS)];
      return `<fieldset ${ro ? 'disabled' : ''}>${field(t('property'), propSelect(cur.property_id))}
        ${field(t('title'), `<input name="title" maxlength="160" autocomplete="off" value="${esc(cur.title)}">`)}
        <div class="two">${field(t('amount'), `<input name="amount" inputmode="decimal" autocomplete="off" placeholder="0,00" ${fixed ? 'readonly' : ''} value="${cur.amount === '' ? '' : esc(amountText(cur.amount))}">`)}
          ${field(t('date'), `<input name="date" type="date" value="${esc(cur.date)}">`)}</div>
        ${fixed ? `<p class="muted small">${esc(t('positionsHint'))}</p>` : ''}
        ${field(t('category'), `<select name="category">${cats.map(c => `<option value="${esc(c)}" ${c === cur.category ? 'selected' : ''}>${esc(catLabel(c))}</option>`).join('')}</select>`)}
        ${field(t('paidBy'), `<select name="paid_by">${(PAID_BY[cur.paid_by] ? Object.keys(PAID_BY) : [cur.paid_by, ...Object.keys(PAID_BY)]).map(k => `<option value="${esc(k)}" ${k === cur.paid_by ? 'selected' : ''}>${esc(PAID_BY[k] ? t(PAID_BY[k]) : k)}</option>`).join('')}</select>`)}
        <div class="f"><span>${esc(t('status'))}</span>${seg('st', [['paid', t('exPaid')], ['pending', t('exPending')]], cur.status)}</div>
        ${field(t('receiptNo'), `<input name="receipt_number" maxlength="80" autocomplete="off" value="${esc(cur.receipt_number)}">`)}</fieldset>
        <div class="f"><span>${esc(t('receipt'))}</span>
          ${has ? `<button type="button" class="btn ghost" data-show>${IC.clip}${esc(t('showReceipt'))}</button>` : ''}
          ${ro ? '' : `<div class="photo"><img class="ph-prev" alt="" hidden><label class="btn ghost ph-add">${IC.cam}<span>${esc(t('addPhoto'))}</span><input type="file" accept="image/*" hidden></label>
            <button type="button" class="link" data-rm hidden>${esc(t('removePhoto'))}</button></div>
            <p class="ocr small" hidden></p><div class="ocr-items" hidden></div>`}</div>`;
    };
    const wire = el => {
      wireSegs(el);
      const show = $('[data-show]', el);
      if (show) show.onclick = async () => {
        const f = cache.receipts[cur.id];
        if (f.mime === 'application/pdf') { sh.say(t('receiptPdf')); return; }
        show.disabled = true;
        try { const b = await API.fileBlob(f.storage_path); lightbox(URL.createObjectURL(b), b); } catch (e) { sh.say(errText(e)); }
        show.disabled = false;
      };
      const inp = $('.ph-add input', el); if (!inp) return;
      const prev = $('.ph-prev', el), rm = $('[data-rm]', el), lab = $('.ph-add span', el);
      const set = blob => {
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        photo = blob; photoUrl = blob ? URL.createObjectURL(blob) : '';
        prev.hidden = rm.hidden = !blob; if (blob) prev.src = photoUrl; lab.textContent = t(blob ? 'changePhoto' : 'addPhoto');
      };
      inp.onchange = async () => {
        const file = inp.files[0]; inp.value = ''; if (!file) return;
        try { set(await toJpeg(file, 1600, 0.82)); sh.say(''); } catch (e) { sh.say(t('photoBad')); return; }
        scan(photo);
      };
      /* Beleg auslesen: füllt nur leere Felder vor – alles bleibt änderbar und wird erst mit „Speichern“ übernommen. */
      const note = $('.ocr', el), list = $('.ocr-items', el), f = $('form', el);
      const clearOcr = () => { ocrRun++; ocrItems = null; note.hidden = list.hidden = true; list.innerHTML = ''; };
      const scan = async blob => {
        clearOcr(); const my = ocrRun;
        note.hidden = false; note.className = 'ocr small busy'; note.textContent = t('ocrLoading');
        let r;
        try { r = await readReceipt(blob, n => { if (my === ocrRun) note.textContent = t('ocrReading', {n}); }); }
        catch (e) { if (my === ocrRun) { note.className = 'ocr small'; note.textContent = t('ocrFail'); } return; }
        if (my !== ocrRun || !document.body.contains(el)) return;
        const fixed = (cur.itemized_positions || []).length > 0;
        let got = 0;
        const put = (name, val, ok) => { const i = f.elements[name]; if (val && i && !i.readOnly && ok(i.value.trim())) { i.value = val; i.dispatchEvent(new Event('change', {bubbles: true})); got++; } };
        put('title', r.title || (r.items[0] && r.items[0].title) || '', v => !v);
        put('amount', r.total > 0 ? (r.total / 100).toFixed(2).replace('.', ',') : '', v => !v || cents(parseAmount(v) || 0) === 0);
        put('receipt_number', r.receipt_number.slice(0, 80), v => !v);
        if (isNew && r.date && r.date <= today() && r.date >= addDays(today(), -730)) put('date', r.date, () => true);
        note.className = 'ocr small';
        if (!got && !r.items.length) { note.textContent = t('ocrNothing'); return; }
        note.textContent = t('ocrDone');
        if (r.items.length && !fixed) {
          const sumOk = r.items.reduce((s, i) => s + i.amount, 0) === r.total;
          ocrItems = sumOk ? r.items : null;
          list.hidden = false;
          list.innerHTML = `${r.items.map(i => `<div class="ocr-row"><span>${i.qty > 1 ? esc(i.qty) + ' × ' : ''}${esc(i.title)}</span><b class="mono">${esc(money(i.amount))}</b></div>`).join('')}
            ${sumOk ? check('data-ocr-items', true, t('ocrItems', {n: r.items.length})) : `<p class="muted small">${esc(t('ocrItemsOff'))}</p>`}`;
        }
      };
      prev.onclick = () => lightbox(URL.createObjectURL(photo), photo); rm.onclick = () => { set(null); clearOcr(); };
      if (photo) set(photo);
    };
    const sh = sheet({title: isNew ? t('newExpense') : ro ? t('tabExpenses') : t('editExpense'), body: `<form class="form" novalidate>${fill()}</form>`,
      onSave: ro ? null : async ({el, say}) => {
        const f = $('form', el), v = n => f.elements[n].value.trim();
        const amount = parseAmount(v('amount') || '0');
        if (!v('title')) { say(t('errTitle')); return false; }
        if (amount === null) { say(t('errAmount')); return false; }
        if (!v('date')) { say(t('errDate')); return false; }
        const fields = {property_id: v('property_id'), title: v('title'), category: v('category') || 'Other', amount, date: v('date'),
                        receipt_number: v('receipt_number'), paid_by: v('paid_by'), status: segVal(el, 'st')};
        let id = cur.id;
        const take = $('[data-ocr-items]', el);
        const pos = ocrItems && take && take.checked && ocrItems.reduce((s, i) => s + i.amount, 0) === cents(amount)
          ? ocrItems.map(i => ({title: i.title, qty: String(i.qty), unit_price: (i.unit_price / 100).toFixed(2), amount: (i.amount / 100).toFixed(2)})) : null;
        if (isNew) { id = API.uuid(); await API.apply('expense', id, 'insert', 0, {...fields, itemized_positions: pos || []}); }
        else {
          const fresh = await API.expense(cur.id);
          if (!fresh || fresh.deleted_at) { say(t('errGone')); return false; }
          if (fresh.version !== cur.version) { cur = fresh; f.innerHTML = fill(); wire(el); say(t('errChanged')); return false; }
          const changed = Object.keys(fields).some(k => (k === 'amount' ? cents(fields[k]) !== cents(cur[k]) : String(fields[k]) !== String(cur[k])));
          if (changed || pos) await API.apply('expense', id, 'update', cur.version, pos ? {...fields, itemized_positions: pos} : fields);
        }
        let photoOk = true;
        if (photo) { say(t('uploading')); try { await API.uploadReceipt(id, photo); } catch (e) { photoOk = false; } say(''); }
        toast(photoOk ? t('saved') : t('photoFail'), photoOk ? 'ok' : 'err'); S.ym = fields.date.slice(0, 7); render();
      }});
    wire(sh.el);
  }

  /* ------------------------------------------------------------------ Chat */
  async function pollBadge() {
    try { const d = await API.chat.badge(); S.badge = d.total || 0; } catch (e) { return; }
    const dot = $('.tabs .dot'); if (dot) { dot.hidden = !S.badge; dot.textContent = S.badge > 9 ? '9+' : S.badge; }
  }
  const lastText = c => { if (c.last_kind === 'file') return t('chatFile'); if (c.last_kind === 'nudge') return t('chatNudge');
    const p = parseBody(c.last_body); return p.text || (p.links[0] ? t(p.links[0].k === 'bk' ? 'linkBooking' : 'linkExpense') : ''); };
  const dayLabel = d => { const s = iso(d); return s === today() ? t('today') : s === addDays(today(), -1) ? t('yesterday') : fmtDate(s); };
  const ROLE = {admin: 'roleAdmin', manager: 'roleManager', owner: 'roleOwner'};
  const images = {};                                                        // geladene Chat-Bilder (id -> data-URL), nur im Arbeitsspeicher

  VIEWS.chat = {
    async load() {
      if (!perm('chat')) { head(t('tabChat')); return empty(t('chatNoAccess')); }
      if (S.peer) return thread();
      const d = await API.chat.contacts(), list = d.threads || [];
      head(t('tabChat'));
      if (list.length === 1 && !S.leftThread) { S.peer = list[0]; return thread(); }
      return list.length ? `<div class="list">${list.map(c => `<button class="row" data-act="peer" data-id="${c.user_id}" data-name="${esc(c.display_name)}" data-role="${esc(c.role)}">
        <span class="avatar sm">${esc((c.display_name || '?').charAt(0).toUpperCase())}</span>
        <div class="row-m"><b>${esc(c.display_name)}</b><small>${c.last_sender_id === API.user.id ? esc(t('chatYou')) + ': ' : ''}${esc(lastText(c)) || esc(t(ROLE[c.role] || 'roleManager'))}</small></div>
        <div class="row-a">${c.last_at ? `<small>${esc(dayLabel(new Date(c.last_at)))}</small>` : ''}${c.unread ? `<i class="dot on">${c.unread}</i>` : ''}</div></button>`).join('')}</div>` : empty(t('chatNoContacts'));
    },
    after(view) { if (S.peer) wireThread(view); },
  };

  /* Markierungen im Nachrichtentext wie am Computer (static/js/chatwidget.js): Antwort [[re:ID]], Verweis [[bk:Monat|Wohnung|Name]] / [[ex:…]] */
  const MARKC = /\[\[(re|bk|ex):([^\[\]]{1,200})\]\]/g;
  function parseBody(b) {
    let reply = null; const links = [];
    const text = String(b || '').replace(MARKC, (m, k, v) => { if (k === 're') reply = v.trim(); else links.push({k, v}); return ''; }).trim();
    return {reply, links, text};
  }
  const cleanLabel = s => String(s).replace(/[\[\]|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  function linkChip(l) {
    const a = l.v.split('|'), month = a[0] || '', pid = a[1] || '', label = a.slice(2).join('|') || month;
    const ok = /^\d{4}-\d{2}$/.test(month) && /^[\w-]{0,64}$/.test(pid);
    return `<button type="button" class="clink" ${ok ? `data-golink="${l.k}" data-month="${month}" data-pid="${esc(pid)}"` : 'disabled'}>${IC.link}<span><b>${esc(t(l.k === 'bk' ? 'linkBooking' : 'linkExpense'))}</b> ${esc(label)}</span></button>`;
  }
  const plainOf = m => m.kind === 'file' ? (m.att_name || t('chatFile')) : m.kind === 'nudge' ? t('chatNudge') : parseBody(m.body).text;
  function bubble(m) {
    const mine = m.sender_id === API.user.id, at = new Date(m.created_at), p = parseBody(m.body);
    const orig = p.reply && (S.msgs || []).find(x => x.id === p.reply);
    const extra = (orig ? `<div class="cquote"><b>${esc(orig.sender_id === API.user.id ? t('chatYou') : S.peer.display_name)}</b> ${esc(plainOf(orig).slice(0, 120))}</div>` : '') + p.links.map(linkChip).join('');
    let inner;
    if (m.kind === 'file' && /^image\//.test(m.att_type || '')) inner = `<button type="button" class="cimg" data-img="${m.id}">${images[m.id] ? `<img alt="" src="${images[m.id]}">` : `<span class="spin"></span>`}</button>${p.text && p.text !== m.att_name ? `<p>${esc(p.text)}</p>` : ''}`;
    else if (m.kind === 'file') inner = `<div class="cfile">${IC.file}<div><b>${esc(m.att_name || t('chatFile'))}</b><small>${esc(t('chatFileHint'))}</small></div></div>${p.text && p.text !== m.att_name ? `<p>${esc(p.text)}</p>` : ''}`;
    else if (m.kind === 'nudge') inner = `<p class="nudge">${IC.bell}${esc(t('chatNudge'))}</p>`;
    else inner = p.text ? `<p>${esc(p.text)}</p>` : '';
    return `<div class="msgb ${mine ? 'me' : ''}" data-seq="${m.seq}">${extra}${inner}<time>${esc(fmtTime(at))}</time></div>`;
  }
  function messagesHtml(list) {
    let day = '', out = '';
    list.forEach(m => { const d = iso(new Date(m.created_at)); if (d !== day) { day = d; out += `<div class="cday">${esc(dayLabel(new Date(m.created_at)))}</div>`; } out += bubble(m); });
    return out || empty(t('chatEmpty'));
  }
  function plusMenu() {
    const pick = (f, ic, label, sub, attrs) => `<label class="pitem"><span class="mic">${ic}</span><span><b>${esc(label)}</b><small>${esc(sub)}</small></span><input type="file" class="ovl" data-f="${f}" ${attrs}></label>`;
    const act = (m, ic, label, sub) => `<button type="button" class="pitem" data-m="${m}"><span class="mic">${ic}</span><span><b>${esc(label)}</b><small>${esc(sub)}</small></span></button>`;
    return `<div class="pmenu" role="menu" hidden>${pick('cam', IC.cam, t('chatCamera'), t('chatCameraSub'), 'accept="image/*" capture="environment"')}
      ${pick('photo', IC.image, t('chatPhoto'), t('chatPhotoSub'), 'accept="image/*"')}
      ${pick('file', IC.file, t('chatSendFile'), t('chatSendFileSub'), 'accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"')}
      ${act('link', IC.link, t('chatLinkBtn'), t('chatLinkSub'))}${act('nudge', IC.bell, t('chatNudgeBtn'), t('chatNudgeSub'))}</div>`;
  }
  async function thread() {
    const d = await API.chat.history(S.peer.user_id);
    S.msgs = d.messages || []; head(S.peer.display_name, t(ROLE[S.peer.role] || 'roleManager'));
    return `<div class="thread"><button class="link tback" data-act="chat-back">${IC.left}${esc(t('back'))}</button><div class="msgs" id="msgs">${messagesHtml(S.msgs)}</div>
      <div class="cchip" hidden></div>
      <form class="composer" novalidate>${plusMenu()}<button type="button" class="cbtn" data-plus aria-label="${esc(t('chatMore'))}" aria-expanded="false">${IC.plus}</button>
        <textarea rows="1" maxlength="2000" placeholder="${esc(t('chatPlaceholder'))}" enterkeyhint="send"></textarea>
        <button class="cbtn send" type="submit" aria-label="${esc(t('chatSend'))}">${IC.send}</button></form></div>`;
  }
  function loadImages(root) {
    $$('[data-img]', root).forEach(async b => {
      const id = b.dataset.img;
      if (!images[id] && !b.dataset.busy) {
        b.dataset.busy = '1';
        try { const f = await API.chat.file(id); images[id] = `data:${f.type};base64,${f.data}`; b.innerHTML = '<img alt="">'; $('img', b).src = images[id]; }
        catch (e) { b.textContent = t('chatImage'); }
      }
      b.onclick = () => { if (images[id]) lightbox(images[id]); };
    });
  }
  const FILE_OK = /\.(png|jpe?g|gif|webp|bmp|pdf|txt|csv|docx?|xlsx?|pptx?|zip)$/i;
  function wireThread(view) {
    document.body.classList.add('in-thread');
    const box = $('#msgs', view), form = $('.composer', view), ta = $('textarea', form), chip = $('.cchip', view);
    const pm = $('.pmenu', form), plus = $('[data-plus]', form);
    const bottom = () => { box.scrollTop = box.scrollHeight; };
    const peer = S.peer.user_id;
    let link = null;
    loadImages(box); bottom(); setTimeout(bottom, 300);
    API.chat.read(peer).then(pollBadge).catch(() => {});
    const add = m => { if (S.msgs.some(x => x.id === m.id)) return; const near = box.scrollHeight - box.scrollTop - box.clientHeight < 120; S.msgs.push(m); box.innerHTML = messagesHtml(S.msgs); loadImages(box); if (near || m.sender_id === API.user.id) bottom(); };
    clearInterval(S.chatTimer);
    S.chatTimer = setInterval(async () => {
      if (document.hidden || !S.peer || S.peer.user_id !== peer || !document.body.contains(box)) return;
      try {
        const d = await API.chat.history(peer), fresh = (d.messages || []).filter(m => !S.msgs.some(x => x.id === m.id));
        if (fresh.length) { fresh.forEach(add); if (fresh.some(m => m.sender_id !== API.user.id)) API.chat.read(peer).then(pollBadge).catch(() => {}); }
      } catch (e) { /* nächster Versuch in ein paar Sekunden */ }
    }, 4000);
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
    ta.addEventListener('focus', () => { setTimeout(bottom, 350); });
    box.addEventListener('click', e => {                                    // Verweis antippen: Monat (und Wohnung) in Buchungen/Ausgaben öffnen
      const b = e.target.closest('[data-golink]'); if (!b) return;
      S.ym = b.dataset.month; S.pid = S.props.some(p => p.id === b.dataset.pid) ? b.dataset.pid : '';
      go(b.dataset.golink === 'bk' ? 'bookings' : 'expenses');
    });
    const setLink = l => {
      link = l; chip.hidden = !l;
      chip.innerHTML = l ? `${IC.link}<span><b>${esc(t(l.k === 'bk' ? 'linkBooking' : 'linkExpense'))}</b> ${esc(l.v.split('|').slice(2).join('|'))}</span><button type="button" aria-label="${esc(t('removePhoto'))}">×</button>` : '';
      if (l) $('button', chip).onclick = () => setLink(null);
    };
    let busy = false;
    const send = async fn => {
      if (busy) return false; busy = true; form.classList.add('busy'); let ok = true;
      try { const d = await fn(); if (d.message) add(d.message); }
      catch (e) { ok = false; toast(e.code === 'file_too_large' ? t('chatFileBig') : e.code === 'file_type_not_allowed' ? t('chatFileType') : e.code === 'too_fast' ? t('chatTooFast') : errText(e), 'err'); }
      busy = false; form.classList.remove('busy'); return ok;
    };
    const pre = () => link ? `[[${link.k}:${link.v}]]` : '';
    form.onsubmit = async ev => {
      ev.preventDefault();
      const text = ta.value.trim(), mark = pre(); if (!text && !mark) return;
      const old = link; ta.value = ''; ta.style.height = 'auto'; setLink(null);
      if (!await send(() => API.chat.post(peer, mark ? mark + '\n' + text : text))) { ta.value = text; setLink(old); }
    };
    const sendFile = async (name, type, b64) => { const mark = pre(), old = link; setLink(null); if (!await send(() => API.chat.postFile(peer, name, type, b64, mark))) setLink(old); };
    const photo = async f => {
      let b64; try { b64 = await toBase64(await toJpeg(f, 1400, 0.75)); } catch (e) { toast(t('photoBad'), 'err'); return; }
      if (b64.length > 2700000) { toast(t('chatTooBig'), 'err'); return; }
      sendFile('foto.jpg', 'image/jpeg', b64);
    };
    const sendAny = async f => {
      if (/^image\/(jpeg|png|heic|heif|webp)$/.test(f.type)) { photo(f); return; }      // Bilder werden verkleinert wie Fotos
      if (!FILE_OK.test(f.name) || !/^[a-z]+\/[a-z0-9.+-]{1,80}$/.test(f.type || '')) { toast(t('chatFileType'), 'err'); return; }
      if (f.size * 4 / 3 > 2700000) { toast(t('chatFileBig'), 'err'); return; }
      let b64; try { b64 = await toBase64(f); } catch (e) { toast(t('errGeneric'), 'err'); return; }
      sendFile(f.name.slice(0, 120), f.type, b64);
    };
    /* Plus-Menü direkt über dem Eingabefeld (wie bei WhatsApp). Die Dateifelder bleiben im Menü, bis eine Auswahl kommt –
       so öffnet das iPhone seine Auswahl an dieser Stelle und nicht mitten im Bildschirm. */
    const openMenu = on => {
      pm.hidden = !on; plus.classList.toggle('on', on); plus.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) { ta.blur(); requestAnimationFrame(() => pm.classList.add('in')); } else pm.classList.remove('in');
    };
    plus.onclick = e => { e.stopPropagation(); openMenu(pm.hidden); };
    const outside = e => { if (!pm.hidden && !pm.contains(e.target) && e.target !== plus && !plus.contains(e.target)) openMenu(false); };
    document.addEventListener('pointerdown', outside, true);
    new MutationObserver((_, o) => { if (!document.body.contains(form)) { document.removeEventListener('pointerdown', outside, true); o.disconnect(); } })
      .observe(document.body, {childList: true, subtree: true});
    $$('input[type=file]', pm).forEach(inp => {
      inp.addEventListener('change', () => { const f = inp.files[0]; inp.value = ''; openMenu(false); if (!f) return; if (inp.dataset.f === 'file') sendAny(f); else photo(f); });
      inp.addEventListener('cancel', () => openMenu(false));
    });
    pm.addEventListener('click', e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      openMenu(false);
      if (b.dataset.m === 'link') linkPicker(l => { setLink(l); ta.focus(); });
      else if (b.dataset.m === 'nudge') send(() => API.chat.nudge(peer));
    });
  }
  /* Buchung oder Ausgabe suchen und als Verweis an die Nachricht hängen (am Computer öffnet der Verweis Monat und Wohnung) */
  function linkPicker(done) {
    const sh = sheet({title: t('chatLinkBtn'), cls: 'tall', body: `<input type="search" class="lsearch" placeholder="${esc(t('chatLinkSearch'))}" autocomplete="off" autocapitalize="none">
      <div class="lres"><div class="boot small"><div class="spin"></div></div></div>`});
    const res = $('.lres', sh.el), q = $('.lsearch', sh.el);
    let rows = [];
    const draw = () => {
      const s = q.value.trim().toLowerCase(), hit = rows.filter(r => !s || r.find.includes(s)).slice(0, 40);
      res.innerHTML = hit.length ? `<div class="list">${hit.map(r => `<button type="button" class="row" data-i="${r.i}"><span class="mic">${r.k === 'bk' ? IC.book : IC.exp}</span>
        <div class="row-m"><b>${esc(r.a)}</b><small>${esc(r.b)}</small></div></button>`).join('')}</div>` : empty(t('chatLinkNone'));
    };
    q.addEventListener('input', draw);
    res.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const r = rows[+b.dataset.i]; sh.close(); done({k: r.k, v: r.v}); });
    const d0 = today();
    Promise.all([API.bookingsByCheckIn(addDays(d0, -90), addDays(d0, 180)), API.expensesByDate(addDays(d0, -120), d0)]).then(([bk, ex]) => {
      bk.sort((a, b) => Math.abs(parse(a.check_in) - parse(d0)) - Math.abs(parse(b.check_in) - parse(d0)));     // nächstliegende Buchungen zuerst
      rows = [...bk.map(b => ({k: 'bk', a: b.guest_name, b: `${propName(b.property_id)} · ${fmtShort(b.check_in)} – ${fmtDate(b.check_out)}`,
                               v: `${b.check_in.slice(0, 7)}|${b.property_id}|${cleanLabel(`${b.guest_name} · ${fmtDate(b.check_in)} → ${fmtDate(b.check_out)}`)}`})),
              ...ex.map(x => ({k: 'ex', a: x.title, b: `${propName(x.property_id)} · ${fmtDate(x.date)}`,
                               v: `${x.date.slice(0, 7)}|${x.property_id}|${cleanLabel(`${x.title} · ${fmtDate(x.date)}`)}`}))];
      rows.forEach((r, i) => { r.i = i; r.find = `${r.a} ${r.b}`.toLowerCase(); });
      draw();
    }).catch(e => { res.innerHTML = `<p class="msg">${esc(errText(e))}</p>`; });
  }

  /* ------------------------------------------------------------------ App-Sperre (PIN, nur auf diesem Handy) */
  const K_PIN = 'am_m_pin', MAX_TRIES = 5;
  const pinCfg = () => { try { return JSON.parse(ls(K_PIN) || 'null'); } catch (e) { return null; } };
  async function pinHash(salt, pin) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
    return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  function keypad({title, sub, length, onDone, footer}) {
    const el = document.createElement('div'); el.className = 'lockscr';
    el.innerHTML = `<div class="lk-in">${IC.lock}<h2>${esc(title)}</h2><p class="muted lk-sub">${esc(sub || '')}</p><div class="dots"></div>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join('')}
        <button type="button" data-ok class="small">${length ? '' : esc(t('pinNext'))}</button><button type="button" data-k="0">0</button><button type="button" data-del class="small" aria-label="${esc(t('pinDelete'))}">⌫</button></div>
      ${footer || ''}</div>`;
    document.body.appendChild(el);
    let val = '';
    const dots = $('.dots', el), max = length || 6;
    const draw = () => { dots.innerHTML = Array.from({length: max}, (_, i) => `<i class="${i < val.length ? 'on' : ''}"></i>`).join(''); };
    const done = async () => { const v = val; val = ''; const r = await onDone(v, api); if (r !== true) draw(); };
    const api = {el, close: () => el.remove(), say: text => { $('.lk-sub', el).textContent = text; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }};
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.k !== undefined && val.length < max) { val += b.dataset.k; draw(); if (length && val.length === length) done(); }
      else if (b.dataset.del !== undefined) { val = val.slice(0, -1); draw(); }
      else if (b.dataset.ok !== undefined && !length && val.length >= 4) done();
    });
    draw(); return api;
  }
  /* Face ID / Touch ID: das iPhone prüft den Besitzer (WebAuthn, „Benutzer geprüft“). Nur als bequemer Ersatz für die PIN auf diesem Handy. */
  const K_BIO = 'am_m_bio';
  const bioOk = () => !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const rnd = n => crypto.getRandomValues(new Uint8Array(n));
  async function bioSetup() {
    const cred = await navigator.credentials.create({publicKey: {challenge: rnd(32), rp: {name: 'AirManager Pro', id: location.hostname},
      user: {id: rnd(16), name: (API.user && API.user.email) || 'AirManager', displayName: (S.profile && S.profile.display_name) || 'AirManager'},
      pubKeyCredParams: [{type: 'public-key', alg: -7}, {type: 'public-key', alg: -257}],
      authenticatorSelection: {authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged'}, timeout: 60000, attestation: 'none'}});
    if (!cred) throw new Error('none');
    ls(K_BIO, b64u(cred.rawId));
  }
  async function bioCheck() {
    const id = ls(K_BIO); if (!id || !bioOk()) return false;
    const a = await navigator.credentials.get({publicKey: {challenge: rnd(32), rpId: location.hostname, userVerification: 'required', timeout: 60000,
      allowCredentials: [{type: 'public-key', id: unb64u(id), transports: ['internal']}]}});
    if (!a || b64u(a.rawId) !== id) return false;
    return (new Uint8Array(a.response.authenticatorData)[32] & 4) === 4;     // Bit „Benutzer geprüft“ (Face ID, Touch ID oder Gerätecode)
  }
  function lockNow() {
    const cfg = pinCfg(); if (!cfg || $('.lockscr')) return;
    const bio = !!ls(K_BIO) && bioOk();
    const k = keypad({title: t('pinEnter'), length: cfg.len,
      footer: `${bio ? `<button type="button" class="btn ghost" data-bio>${IC.face}${esc(t('bioUnlock'))}</button>` : ''}<button type="button" class="link" data-forgot>${esc(t('pinForgot'))}</button>`,
      onDone: async (v, api) => {
        if (await pinHash(cfg.salt, v) === cfg.hash) { ls('am_m_tries', null); api.close(); return true; }
        const left = MAX_TRIES - (Number(ls('am_m_tries') || 0) + 1); ls('am_m_tries', String(MAX_TRIES - left));
        if (left <= 0) { await forget(); api.close(); return true; }
        api.say(t('pinWrong', {n: left}));
      }});
    $('[data-forgot]', k.el).onclick = async () => { await forget(); k.close(); };
    if (bio) {
      let busy = false;
      const tryBio = async quiet => {
        if (busy) return; busy = true;
        try { if (await bioCheck()) { ls('am_m_tries', null); k.close(); } else if (!quiet) k.say(t('bioFail')); }
        catch (e) { if (!quiet) k.say(t('bioFail')); }
        busy = false;
      };
      $('[data-bio]', k.el).onclick = () => tryBio(false);
      tryBio(true);                                                         // gleich beim Öffnen fragen; lehnt das iPhone das ohne Tippen ab, bleibt der Knopf
    }
  }
  async function forget() { ls(K_PIN, null); ls(K_BIO, null); ls('am_m_tries', null); await pushQuietOff(); await API.signOut(); showLogin(); }
  function setPin(after) {
    let first = '';
    const k = keypad({title: t('appLock'), sub: t('pinNew'), onDone: async (v, api) => {
      if (!first) { first = v; api.say(t('pinRepeat')); api.el.classList.remove('shake'); return; }
      if (v !== first) { first = ''; api.say(t('pinMismatch') + ' ' + t('pinNew')); return; }
      const salt = API.uuid(); ls(K_PIN, JSON.stringify({salt, hash: await pinHash(salt, v), len: v.length})); api.close(); toast(t('saved'), 'ok'); after(); return true;
    }, footer: `<button type="button" class="link" data-cancel>${esc(t('cancel'))}</button>`});
    $('[data-cancel]', k.el).onclick = k.close;
  }
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (!API.user) return;
    if (hiddenAt && Date.now() - hiddenAt > 60000) lockNow();
    if (hiddenAt && Date.now() - hiddenAt > 20000 && $('#view') && !$('.sheet-w') && !(S.tab === 'chat' && S.peer)) render();
    if (perm('chat')) pollBadge();
    checkPending(); checkUpdate();
  });

  /* ------------------------------------------------------------------ Mitteilungen (Web Push). Am iPhone nur in der App vom Home-Bildschirm
     (ab iOS 16.4) und nur nach einem Tippen erlaubt. Die Anmeldung des Handys liegt in der Cloud (push_subscribe); verschickt wird von dort. */
  const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const keyBytes = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const pushSub = async () => { const reg = await navigator.serviceWorker.ready; return reg.pushManager.getSubscription(); };
  async function pushRefresh() {
    if (!pushOk()) { S.push = 'unsupported'; return; }
    if (Notification.permission === 'denied') { S.push = 'denied'; return; }
    try { S.push = (await pushSub()) && Notification.permission === 'granted' ? 'on' : 'off'; } catch (e) { S.push = 'off'; }
  }
  async function pushSave(sub) { const j = sub.toJSON(); await API.push.subscribe(j.endpoint, j.keys.p256dh, j.keys.auth, I.lang); }
  async function pushOn(permission) {
    if (await permission !== 'granted') throw {code: 'denied'};
    let st = await API.push.status();
    if (!st.configured) {
      if (!isAdmin()) throw {code: 'not_ready'};
      // einmalig: Dieses Handy erzeugt das Schlüsselpaar für Web Push und legt es in der Cloud ab (bleibt dort; ein vorhandenes wird nie ersetzt)
      const kp = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
      const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), priv = (await crypto.subtle.exportKey('jwk', kp.privateKey)).d;
      await API.push.setup(pub, priv);
      st = await API.push.status();
      if (!st.configured) throw {code: 'not_ready'};
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub) {                                                             // alte Anmeldung mit anderem Schlüssel: neu anmelden
      const old = sub.options && sub.options.applicationServerKey ? btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';
      if (old && old !== st.public_key) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: keyBytes(st.public_key)});
    await pushSave(sub);
  }
  async function pushOff() {
    const sub = await pushSub(); if (!sub) return;
    try { await API.push.unsubscribe(sub.endpoint); } catch (e) { /* offline: das Handy meldet sich trotzdem ab */ }
    await sub.unsubscribe();
  }
  const pushQuietOff = async () => { try { if (pushOk()) await pushOff(); } catch (e) { /* Abmelden geht immer */ } };
  const pushErr = e => t(e && e.code === 'denied' ? 'pushDenied' : e && e.code === 'not_ready' ? 'pushNotReady'
    : e && (e.code === 'PGRST202' || e.code === 'http_404') ? 'pushMissing' : e && e.kind === 'offline' ? 'offline' : 'pushFail');
  /* Monat für den Sprung aus einer Mitteilung: der in der Mitteilung genannte, sonst der Monat des zuletzt eingetragenen Eintrags */
  async function pushMonth(tab, ym) {
    if (tab !== 'bookings' && tab !== 'expenses') return;
    S.pid = '';                                                            // kein Wohnungsfilter: der neue Eintrag soll sichtbar sein
    if (/^\d{4}-\d{2}$/.test(ym || '')) { S.ym = ym; return; }
    try { S.ym = (await API.latestMonth(tab)) || ymNow(); } catch (e) { S.ym = ymNow(); }
  }
  async function openFromPush(tab, ym) {
    if (!$('#view')) return;
    $$('.sheet-w, .lb, .ask-w').forEach(x => x.remove());
    if (tab === 'admin') { if (isAdmin()) adminSheet('dev'); return; }
    if (!['today', 'bookings', 'expenses', 'chat', 'month'].includes(tab)) return;
    await pushMonth(tab, ym);
    if (tab === 'month') S.ym = ymNow();
    S.leftThread = false; go(tab);
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.go) openFromPush(e.data.go, e.data.ym); });

  /* ------------------------------------------------------------------ Einstellungen */
  function settings() {
    const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    const body = () => `<div class="me"><span class="avatar">${esc(((S.profile && S.profile.display_name) || '?').charAt(0).toUpperCase())}</span>
        <div><small>${esc(t('signedInAs'))}</small><b>${esc((S.profile && S.profile.display_name) || '')}</b><small>${esc(API.user.email)} · ${esc(t(ROLE[S.access.role] || 'roleManager'))}</small></div></div>
      ${isAdmin() ? `<button type="button" class="btn ghost" data-admin>${IC.shield}${esc(t('admin'))}${S.pending ? `<i class="dot">${S.pending}</i>` : ''}</button>` : ''}
      <div class="f"><span>${esc(t('language'))}</span>${seg('lang', I.LANGS.map(l => [l, I.names[l]]), I.lang)}</div>
      <div class="f"><span>${esc(t('appLock'))} · ${esc(t(pinCfg() ? 'lockIsOn' : 'lockIsOff'))}</span><p class="muted small">${esc(t('appLockHint'))}</p>
        <button type="button" class="btn ghost" data-pin>${IC.lock}${esc(t(pinCfg() ? 'lockOff' : 'lockOn'))}</button>
        ${!bioOk() ? '' : pinCfg() ? `<button type="button" class="btn ghost" data-bio>${IC.face}${esc(t(ls(K_BIO) ? 'bioOff' : 'bioOn'))}</button><p class="muted small">${esc(t('bioHint'))}</p>`
          : `<p class="muted small">${esc(t('bioNeedPin'))}</p>`}</div>
      <div class="f"><span>${esc(t('push'))} · ${esc(t(S.push === 'on' ? 'lockIsOn' : 'lockIsOff'))}</span>
        ${S.push === 'unsupported' ? `<p class="muted small">${esc(t('pushUnsupported'))}</p>` : S.push === 'denied' ? `<p class="muted small">${esc(t('pushDenied'))}</p>`
          : `<p class="muted small">${esc(t('pushHint'))}</p><button type="button" class="btn ghost" data-push>${IC.bell}${esc(t(S.push === 'on' ? 'pushTurnOff' : 'pushTurnOn'))}</button>`}</div>
      ${standalone ? '' : `<div class="f"><span>${esc(t('installTitle'))}</span><p class="muted small">${esc(t('installHint'))}</p></div>`}
      <button type="button" class="btn danger" data-out>${esc(t('signOut'))}</button>
      <p class="muted small center">${esc(t('version'))} ${esc(CFG.version)}<br>${esc(t('creator'))} · Brahim Ramaj</p>`;
    const sh = sheet({title: t('settings'), body: `<div class="form set">${body()}</div>`});
    const wire = () => {
      const el = sh.el, redo = () => { $('.set', el).innerHTML = body(); wire(); };
      $$('[data-seg="lang"] button', el).forEach(b => b.onclick = () => { I.lang = b.dataset.v; sh.close(); shell(); go(S.tab);
        if (S.push === 'on') pushSub().then(pushSave).catch(() => {}); });                 // Mitteilungen kommen in der gewählten Sprache
      $('[data-pin]', el).onclick = () => { if (pinCfg()) { ls(K_PIN, null); ls(K_BIO, null); redo(); } else setPin(redo); };
      const bio = $('[data-bio]', el);
      if (bio) bio.onclick = async () => {
        if (ls(K_BIO)) { ls(K_BIO, null); redo(); return; }
        bio.disabled = true;
        try { await bioSetup(); toast(t('saved'), 'ok'); } catch (e) { toast(t('bioSetupFail'), 'err'); }
        redo();
      };
      const adm = $('[data-admin]', el); if (adm) adm.onclick = () => { sh.close(); adminSheet('dev'); };
      const pb = $('[data-push]', el);
      if (pb) pb.onclick = async () => {
        const turnOn = S.push !== 'on';
        const permission = turnOn ? Notification.requestPermission() : null;      // sofort im Tippen fragen (das iPhone verlangt das)
        pb.disabled = true;
        try { if (turnOn) await pushOn(permission); else await pushOff(); toast(t('saved'), 'ok'); }
        catch (e) { toast(pushErr(e), 'err'); }
        await pushRefresh(); if (document.body.contains(el)) redo();
      };
      $('[data-out]', el).onclick = async () => { ls(K_PIN, null); ls(K_BIO, null); await pushQuietOff(); await API.signOut(); showLogin(); };
    };
    wire();
    const was = S.push;                                                     // Stand der Mitteilungen frisch lesen (kann im Handy geändert worden sein)
    pushRefresh().then(() => { if (S.push !== was && document.body.contains(sh.el)) { $('.set', sh.el).innerHTML = body(); wire(); } });
  }

  /* ------------------------------------------------------------------ Rückfrage (eigener Dialog, kein Browser-Dialog) */
  function ask(title, text, okLabel) {
    return new Promise(res => {
      const el = document.createElement('div'); el.className = 'ask-w';
      el.innerHTML = `<div class="ask" role="alertdialog" aria-modal="true"><h2>${esc(title)}</h2><p class="muted">${esc(text)}</p>
        <div class="ask-b"><button type="button" class="btn ghost" data-no>${esc(t('cancel'))}</button><button type="button" class="btn danger" data-yes>${esc(okLabel)}</button></div></div>`;
      document.body.appendChild(el);
      const done = v => { el.remove(); res(v); };
      $('[data-no]', el).onclick = () => done(false); $('[data-yes]', el).onclick = () => done(true);
    });
  }

  /* ------------------------------------------------------------------ Verwaltung (nur Administrator): Geräte freigeben/sperren, Benutzer, Rechte.
     Für alle anderen gibt es weder Knopf noch Daten – die Cloud lehnt deren Anfragen zusätzlich selbst ab. */
  const isAdmin = () => !!(S.access && S.access.role === 'admin');
  const PERM = {props_edit: 'pmPropsEdit', props_delete: 'pmPropsDelete', ical: 'pmIcal', inventory: 'pmInventory', book_edit: 'pmBookEdit', book_delete: 'pmBookDelete',
                invoices: 'pmInvoices', exp_edit: 'pmExpEdit', exp_delete: 'pmExpDelete', fixed: 'pmFixed', console: 'pmConsole', commission: 'pmCommission',
                reports: 'pmReports', tax: 'pmTax', exports: 'pmExports', care: 'pmCare', contacts: 'pmContacts', supplies: 'pmSupplies', chat: 'pmChat',
                audit: 'pmAudit', history: 'pmHistory', backup: 'pmBackup', restore: 'pmRestore'};
  const fmtWhen = s => s ? new Intl.DateTimeFormat(I.locale(), {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}).format(new Date(s)) : t('admNever');
  async function checkPending() {
    if (!isAdmin()) return;
    try { S.pending = (await API.admin.devices()).filter(d => !d.approved_at && !d.revoked_at).length; } catch (e) { return; }
    banner(); const av = $('.top .avatar'); if (av) av.classList.toggle('has-dot', !!S.pending);
  }
  function adminSheet(tab) {
    if (!isAdmin()) return;
    let cur = tab || 'dev', data = null;
    const sh = sheet({title: t('admin'), cls: 'tall', body: `<div class="adm">${seg('adm', [['dev', t('admDevices')], ['usr', t('admUsers')]], cur)}<div class="adm-b"></div></div>`});
    const box = $('.adm-b', sh.el);
    const devices = async () => {
      const list = await API.admin.devices(), me = API.deviceId(), rank = d => d.revoked_at ? 2 : d.approved_at ? 1 : 0;
      S.pending = list.filter(d => rank(d) === 0).length; banner();
      list.sort((a, b) => rank(a) - rank(b) || String(b.last_seen || '').localeCompare(String(a.last_seen || '')));
      data = {devices: list};
      return list.length ? `<div class="list">${list.map(d => `<div class="row static arow ${rank(d) === 2 ? 'dim2' : ''}"><div class="row-m"><b>${esc(d.name || t('admNoName'))}</b>
          <small>${esc(d.user || '—')}</small><small>${esc(t('admLastSeen', {d: fmtWhen(d.last_seen)}))}</small>
          <div class="tags">${tag(['open', 'st-checked_in', 'st-cancelled'][rank(d)], t(['admPending', 'admApproved', 'admRevoked'][rank(d)]))}${d.device_id === me ? tag('cat', t('admThisDevice')) : ''}</div></div>
          <div class="abtns">${rank(d) === 0 ? `<button type="button" class="btn sm" data-a="approve" data-id="${d.device_id}">${esc(t('admApprove'))}</button>` : ''}
            ${rank(d) !== 2 && d.device_id !== me ? `<button type="button" class="btn sm danger" data-a="revoke" data-id="${d.device_id}">${esc(t('admRevoke'))}</button>` : ''}</div></div>`).join('')}</div>` : empty(t('admNoDevices'));
    };
    const users = async () => {
      const [staff, ov] = await Promise.all([API.admin.staff(), API.admin.overview()]);
      data = {staff, keys: ov.keys || [], access: {}}; (ov.users || []).forEach(u => { data.access[u.user_id] = u; });
      return `<div class="list">${staff.map(u => { const self = u.user_id === API.user.id; return `<div class="row static arow ${u.active ? '' : 'dim2'}"><div class="row-m"><b>${esc(u.display_name)}${self ? ' · ' + esc(t('admYou')) : ''}</b>
          <small>${esc(u.email || '')}</small><div class="tags">${tag('st-confirmed', t(ROLE[u.role] || 'roleManager'))}${tag(u.active ? 'st-checked_in' : 'st-cancelled', t(u.active ? 'admActive' : 'admInactive'))}</div>
          ${data.access[u.user_id] ? `<button type="button" class="link" data-a="rights" data-id="${u.user_id}">${esc(t('admRightsBtn'))}${IC.right}</button>` : ''}</div>
          <div class="abtns">${self ? '' : `<button type="button" class="btn sm ${u.active ? 'danger' : ''}" data-a="${u.active ? 'deact' : 'act'}" data-id="${u.user_id}">${esc(t(u.active ? 'admDeact' : 'admActivate'))}</button>`}</div></div>`; }).join('')}</div>
        <p class="hint">${esc(t('admOnPc'))}</p>`;
    };
    const load = async () => {
      box.innerHTML = `<div class="boot small"><div class="spin"></div></div>`;
      try { const html = await (cur === 'dev' ? devices() : users()); box.innerHTML = html; }
      catch (e) { box.innerHTML = `<p class="msg">${esc(errText(e))}</p>`; }
    };
    wireSegs(sh.el);
    $$('[data-seg="adm"] button', sh.el).forEach(b => b.addEventListener('click', () => { cur = b.dataset.v; load(); }));
    box.addEventListener('click', async e => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      const a = b.dataset.a, id = b.dataset.id;
      try {
        if (a === 'approve') { b.disabled = true; await API.admin.approve(id); toast(t('admApprovedToast'), 'ok'); load(); }
        else if (a === 'revoke') {
          const d = data.devices.find(x => x.device_id === id);
          if (await ask(t('admRevokeQ'), t('admRevokeText', {name: (d && d.name) || t('admNoName')}), t('admRevoke'))) { await API.admin.revoke(id); toast(t('admRevokedToast'), 'ok'); load(); }
        }
        else if (a === 'act') { b.disabled = true; await API.admin.setActive(id, true); toast(t('saved'), 'ok'); load(); }
        else if (a === 'deact') {
          const u = data.staff.find(x => x.user_id === id);
          if (await ask(t('admDeactQ'), t('admDeactText', {name: (u && u.display_name) || ''}), t('admDeact'))) { await API.admin.setActive(id, false); toast(t('saved'), 'ok'); load(); }
        }
        else if (a === 'rights') rightsSheet(data.access[id], data.keys, load);
      } catch (err) { b.disabled = false; toast(err.code === 'last_admin' ? t('admLastAdmin') : errText(err), 'err'); }
    });
    load();
  }
  const check = (attr, on, label) => `<label class="chk"><input type="checkbox" ${attr} ${on ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  function rightsSheet(u, keys, reload) {
    const eff = u.effective || {}, own = u.properties || [];
    sheet({title: u.display_name, cls: 'tall', body: `<div class="form">
        <div class="f"><span>${esc(t('admProps'))}</span><div class="checks">${S.props.map(p => check(`data-prop="${p.id}"`, own.includes(p.id), p.name)).join('') || empty(t('noProps'))}</div></div>
        ${u.role === 'manager' ? `<div class="checks">${check('data-auto', u.auto_access, t('admAuto'))}</div>` : ''}
        <div class="f"><span>${esc(t('admRights'))}</span><div class="checks">${keys.map(k => check(`data-perm="${esc(k)}"`, eff[k], PERM[k] ? t(PERM[k]) : k)).join('')}</div></div></div>`,
      onSave: async ({el}) => {
        const perms = {}; $$('[data-perm]', el).forEach(x => { perms[x.dataset.perm] = x.checked; });
        const auto = $('[data-auto]', el);
        await API.admin.setAccess(u.user_id, $$('[data-prop]', el).filter(x => x.checked).map(x => x.dataset.prop), !!(auto && auto.checked), perms);
        toast(t('saved'), 'ok'); reload();
      }});
  }

  /* ------------------------------------------------------------------ Selbst-Update: Gibt es eine neuere Version, lädt die App sie von allein (kein erneutes Hinzufügen zum Home-Bildschirm). */
  async function checkUpdate() {
    try {
      const r = await fetch('version.json?ts=' + Date.now(), {cache: 'no-store'}); if (!r.ok) return;
      const v = (await r.json()).version;
      if (!v || v === CFG.version || $('.sheet-w') || $('.lockscr') || $('.ask-w')) return;
      if (sessionStorage.getItem('am_m_upd') === v) return;                 // je Version nur ein Versuch pro App-Start (keine Schleife)
      sessionStorage.setItem('am_m_upd', v);
      toast(t('updating'), 'ok'); setTimeout(() => location.reload(), 1200);
    } catch (e) { /* offline oder kein Speicher: beim nächsten Öffnen */ }
  }

  /* ------------------------------------------------------------------ Tippen (ein Zuhörer für alles) */
  app.addEventListener('click', async e => {
    const tab = e.target.closest('[data-tab]'); if (tab) { S.leftThread = false; go(tab.dataset.tab); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'settings') settings();
    else if (act === 'admin') adminSheet('dev');
    else if (act === 'refresh') { S.anaForce = true; try { S.props = await API.properties(); } catch (err) { /* die Ansicht zeigt den Fehler */ } render(); checkPending(); checkUpdate(); }
    else if (act === 'devcheck') { try { S.device = await API.registerDevice(t('devName')); banner(); render(); } catch (err) { toast(errText(err), 'err'); } }
    else if (act === 'm-prev') { S.ym = ymAdd(S.ym, -1); render(); }
    else if (act === 'm-next') { S.ym = ymAdd(S.ym, 1); render(); }
    else if (act === 'm-now') { S.ym = ymNow(); render(); }
    else if (act === 'new-booking') { if (S.props.length) bookingForm(null); else toast(t('noProps'), 'err'); }
    else if (act === 'new-expense') { if (S.props.length) expenseForm(null); else toast(t('noProps'), 'err'); }
    else if (act === 'booking') { try { const row = await API.booking(b.dataset.id); if (row && !row.deleted_at) bookingForm(row); else { toast(t('errGone'), 'err'); render(); } } catch (err) { toast(errText(err), 'err'); } }
    else if (act === 'expense') { const row = cache.expenses.find(x => x.id === b.dataset.id); if (row) expenseForm(row); }
    else if (act === 'peer') { S.peer = {user_id: b.dataset.id, display_name: b.dataset.name, role: b.dataset.role}; render(); }
    else if (act === 'chat-back') { S.peer = null; S.leftThread = true; clearInterval(S.chatTimer); document.body.classList.remove('in-thread'); render(); }
  });
  app.addEventListener('change', e => { if (e.target.matches('[data-filter]')) { S.pid = e.target.value; render(); } });

  /* Tastatur am iPhone: Das iPhone verkleinert die Seite nicht, sondern schiebt sie hoch. Die App folgt deshalb genau dem sichtbaren
     Bereich (Höhe UND Position), damit Eingabefeld und Verlauf immer direkt über der Tastatur stehen. */
  const vv = window.visualViewport;
  if (vv) {
    let base = 0;
    const fit = () => {
      const h = vv.height; if (h > base) base = h;
      const st = document.documentElement.style, kb = base - h > 140;
      st.setProperty('--vh', h + 'px'); st.setProperty('--vtop', vv.offsetTop + 'px');
      if (kb !== document.body.classList.contains('kb')) {
        document.body.classList.toggle('kb', kb);
        const m = $('#msgs'); if (m && kb) setTimeout(() => { m.scrollTop = m.scrollHeight; }, 60);
      }
    };
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
    window.addEventListener('orientationchange', () => { base = 0; setTimeout(fit, 350); });
    fit();
  }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  if (API.user) { start(); lockNow(); } else showLogin();
})();
