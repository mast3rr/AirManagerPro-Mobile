/* Abrechnung wie am Computer – dieselbe Rechnung, dieselbe Cent-Rundung (Tests vergleichen beide):
     overview(...)  = services/earnings.month_overview   (Seite „Analysen“: Monat oder gesamte Zeit, alle oder eine Wohnung)
     lifetime(...)  = services/earnings.lifetime          (je Person und Jahr: verdient, ausgezahlt, Guthaben inkl. Vorjahre)
   Eigentum/Provision: services/ownership.py (Art "ownership"), Auszahlungen: services/payouts.py (Art "payout", Schlüssel "JJJJ|e-mail").
   Alle Beträge in Cent (ganze Zahlen); Prozente in Hundertstel (30 % = 3000). */
(function (root) {
  'use strict';
  const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,120}\.[^@\s]{2,24}$/, OWNER_MARK = /^\[\[owner:([^|\]\n]*)\|([^\]\n]*)\]\]\n?/;

  /* Dezimalwert (Zahl oder Text) -> Hundertstel, kaufmännisch gerundet (wie Decimal(str(v)).quantize(0.01, ROUND_HALF_UP)) */
  function hund(v) {
    const m = /^\s*([+-]?)(\d*)(?:\.(\d*))?\s*$/.exec(String(v));
    if (!m || (m[2] === '' && !m[3])) return NaN;
    const frac = (m[3] || '').padEnd(3, '0'), n = Number(m[2] || '0') * 100 + Number(frac.slice(0, 2)) + (Number(frac[2]) >= 5 ? 1 : 0);
    return m[1] === '-' ? -n : n;
  }
  const divRound = (n, d) => { const s = n < 0 ? -1 : 1, a = Math.abs(n); return s * Math.floor((a * 2 + d) / (2 * d)); };   // ROUND_HALF_UP
  const pctOf = (cents, p100) => divRound(cents * p100, 10000);                                                           // Betrag × Prozent

  /* ownership.clean: nur gültige Einträge zählen (sonst gilt der Standard) */
  function clean(d) {
    if (!d || typeof d !== 'object') return null;
    const owners = d.owners;
    if (!Array.isArray(owners) || owners.length < 1 || owners.length > 8) return null;
    const out = [], seen = new Set(); let total = 0;
    for (const o of owners) {
      if (!o || typeof o !== 'object') return null;
      const email = String(o.email || '').trim().toLowerCase();
      if (!EMAIL.test(email) || seen.has(email)) return null;
      const p = hund(o.pct);
      if (!(p > 0 && p <= 10000)) return null;
      seen.add(email); total += p;
      out.push({email, name: String(o.name || '').trim().slice(0, 80), p});
    }
    if (total !== 10000) return null;
    let mg = null;
    if (d.manager) {
      const email = String(d.manager.email || '').trim().toLowerCase();
      if (!EMAIL.test(email)) return null;
      mg = {email, name: String(d.manager.name || '').trim().slice(0, 80)};
    }
    const r = hund(d.rate);
    if (!(r >= 0 && r <= 10000)) return null;
    return {owners: out, manager: mg, rate: r};
  }
  const okey = o => { const e = (o.email || '').trim().toLowerCase(); if (e) return e; const n = (o.name || '').trim().toLowerCase(); return n ? 'n:' + n : ''; };

  function payoutEntries(docs, year) {                                   // payouts.entries(year): {email: [{date, cents}]}
    const out = {};
    for (const k of Object.keys(docs || {})) {
      const i = k.indexOf('|'), y = i < 0 ? k : k.slice(0, i), email = i < 0 ? '' : k.slice(i + 1);
      if (y !== String(year) || !email) continue;
      const d = docs[k], ents = d && Array.isArray(d.entries) ? d.entries : [];
      const ok = [];
      for (const e of ents) {
        if (!e || typeof e !== 'object' || !e.id) continue;
        const day = String(e.date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        const dt = new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
        if (dt.getMonth() !== +day.slice(5, 7) - 1 || dt.getDate() !== +day.slice(8, 10)) continue;
        if (+day.slice(0, 4) < 2000 || +day.slice(0, 4) > 2100) continue;
        const a = hund(e.amount);
        if (!Number.isFinite(a) || a === 0 || Math.abs(a) > 1e9) continue;
        ok.push({date: day, cents: a});
      }
      out[email] = ok;
    }
    return out;
  }
  const payoutYears = docs => [...new Set(Object.keys(docs || {}).map(k => k.split('|')[0]).filter(y => /^\d+$/.test(y)))].map(Number).sort((a, b) => a - b);

  /* Gemeinsamer Aufbau aus den Rohdaten */
  function setup(D) {
    const o = D.opts || {}, role = (D.access && D.access.role) || 'admin';
    const priv = new Set((D.access && D.access.private_properties) || []);
    const custom = {};
    for (const [pid, data] of Object.entries(D.ownership || {})) { const c = clean(data); if (c) custom[pid] = c; }
    const props = (D.props || []).slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const me = role === 'owner' ? String(D.me || '').toLowerCase() : String(o.ownerEmail || '').toLowerCase();
    const defaultCfg = p => {
      if (o.mode === 'admin') return {owners: [{email: String(o.ownerEmail || '').toLowerCase(), name: '', p: 10000}], manager: null, rate: o.rate};
      const m = OWNER_MARK.exec((p && p.description) || '');
      return {owners: [{email: m ? m[2] : '', name: m ? m[1] : '', p: 10000}], manager: {email: o.managerEmail || '', name: ''}, rate: o.rate};
    };
    const defaultFor = p => {
      if (priv.has(p.id) || role === 'owner') {
        let owners = (((D.access && D.access.owners) || {})[p.id] || []).filter(x => x && typeof x === 'object' && EMAIL.test(String(x.email || '')))
          .map(x => ({email: String(x.email).toLowerCase(), name: String(x.name || '')}));
        if (!owners.length && role === 'owner') owners = [{email: me, name: ''}];
        if (owners.length) {
          const n = owners.length, each = Math.round(10000 / n), ps = owners.map(() => each);
          ps[n - 1] = 10000 - each * (n - 1);
          return {owners: owners.map((x, i) => ({...x, p: ps[i]})), manager: null, rate: 0};
        }
      }
      return defaultCfg(p);
    };
    const cfgOf = p => custom[p.id] || defaultFor(p);
    const weight = p => {                                                  // ownership.business_terms(): Anteil des Hauptkontos
      if (custom[p.id]) return custom[p.id].owners.filter(x => x.email === me).reduce((s, x) => s + x.p, 0);
      if (priv.has(p.id)) return role === 'owner' ? 10000 : 0;
      if (role === 'owner') return 10000;
      return o.mode === 'admin' ? 10000 : 0;
    };
    const names = o.names || {};
    const nameFor = (email, stored) => stored || names[email] || email;
    const months = (list, col) => {                                        // {JJJJ-MM: {Unterkunft: Cent}}
      const out = {};
      for (const r of list || []) { const m = String(r[col]).slice(0, 7); const per = out[m] || (out[m] = {}); per[r.property_id] = (per[r.property_id] || 0) + hund(r.amount); }
      return out;
    };
    return {props, cfgOf, weight, me, nameFor, rev: months(D.bookings, 'check_in'), exp: months(D.expenses, 'date')};
  }
  const flags = p => { p.noacct = p.email.startsWith('n:'); };

  /* earnings.month_overview */
  function overview(D, {year, month, pid, whole}) {
    const S = setup(D);
    const lo = whole ? '1900-01' : `${year}-${String(month).padStart(2, '0')}`;
    const inRange = m => whole || m === lo;
    const sum = by => { const out = {}; for (const [m, per] of Object.entries(by)) if (inRange(m)) for (const [k, v] of Object.entries(per)) out[k] = (out[k] || 0) + v; return out; };
    const rev = sum(S.rev), exp = sum(S.exp), nb = {};
    for (const b of D.bookings || []) if (inRange(String(b.check_in).slice(0, 7))) nb[b.property_id] = (nb[b.property_id] || 0) + 1;
    const rows = [], people = {};
    const person = (email, name) => people[email] || (people[email] = {email, name, commission: 0, profit: 0});
    for (const p of S.props) {
      if (pid ? p.id !== pid : !(S.weight(p) > 0)) continue;
      const g = rev[p.id] || 0, x = exp[p.id] || 0;
      if (!g && !x) continue;
      const c = S.cfgOf(p);
      let comm = 0;
      if (whole) { for (const per of Object.values(S.rev)) comm += pctOf(per[p.id] || 0, c.rate); } else comm = pctOf(g, c.rate);
      const profit = g - comm - x, mg = c.manager || {};
      if (comm) person(mg.email || '', mg.name || '').commission += comm;
      const shares = []; let left = profit;
      c.owners.forEach((o, i) => {
        const part = i < c.owners.length - 1 ? pctOf(profit, o.p) : left;
        left -= part;
        const k = okey(o);
        shares.push({name: S.nameFor(k, o.name), email: k, pct: o.p / 100, amount: part});
        person(k, o.name || '').profit += part;
      });
      rows.push({id: p.id, name: p.name, bookings: nb[p.id] || 0, gross: g, rate: c.rate / 100, commission: comm, expenses: x, profit, shares});
    }
    const ys = whole ? payoutYears(D.payouts) : (month === 12 ? [year, year + 1] : [year]);
    const out = Object.values(people);
    for (const p of out) {
      p.name = p.email ? S.nameFor(p.email, p.name) : '';
      flags(p); p.total = p.commission + p.profit; p.me = p.email === S.me;
      let paid = 0;
      for (const y of ys) for (const e of payoutEntries(D.payouts, y)[p.email] || []) if (whole || e.date.slice(0, 7) === lo) paid += e.cents;
      p.paid = paid;
    }
    const tot = {gross: 0, commission: 0, expenses: 0, profit: 0, bookings: 0};
    for (const r of rows) for (const k in tot) tot[k] += r[k];
    out.sort((a, b) => (a.me === b.me ? (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0) : a.me ? -1 : 1));
    return {rows, total: tot, people: out, has_data: rows.length > 0};
  }

  /* earnings.earnings(year, carry=False) – nur was lifetime braucht: je Person verdient und ausgezahlt im Jahr */
  function yearTotals(S, D, year) {
    const people = {};
    const person = (email, name) => { const p = people[email] || (people[email] = {email, name: '', commission: 0, profit: 0}); if (name && !p.name) p.name = name; return p; };
    for (const p of S.props) {
      const G = Array(12).fill(0), X = Array(12).fill(0);
      for (let i = 0; i < 12; i++) { const m = `${year}-${String(i + 1).padStart(2, '0')}`; G[i] = (S.rev[m] || {})[p.id] || 0; X[i] = (S.exp[m] || {})[p.id] || 0; }
      if (!G.some(Boolean) && !X.some(Boolean)) continue;
      const c = S.cfgOf(p), comm = G.map(g => pctOf(g, c.rate)), profit = G.map((g, i) => g - comm[i] - X[i]);
      if (c.rate > 0 && comm.some(Boolean)) { const mg = c.manager || {}; person(mg.email || '', mg.name || '').commission += comm.reduce((a, b) => a + b, 0); }
      let left = profit.slice();
      c.owners.forEach((o, i) => {
        const part = i < c.owners.length - 1 ? profit.map(pf => pctOf(pf, o.p)) : left.slice();
        left = left.map((a, j) => a - part[j]);
        person(okey(o), o.name || '').profit += part.reduce((a, b) => a + b, 0);
      });
    }
    const ents = payoutEntries(D.payouts, year);
    for (const email of Object.keys(ents)) if (!people[email] && email) person(email, '');
    for (const p of Object.values(people)) {
      p.name = p.email ? S.nameFor(p.email, p.name) : '';
      p.total = p.commission + p.profit;
      p.withdrawn = (ents[p.email] || []).reduce((s, e) => s + e.cents, 0);
    }
    return Object.values(people);
  }

  /* earnings.lifetime: je Person alle Jahre – verdient, ausgezahlt, Guthaben (laufend und gesamt) */
  function lifetime(D, thisYear) {
    const S = setup(D);
    const ys = new Set([thisYear]);
    for (const b of D.bookings || []) ys.add(+String(b.check_in).slice(0, 4));
    for (const e of D.expenses || []) ys.add(+String(e.date).slice(0, 4));
    const first = Math.min(...ys), last = Math.max(...ys), people = {};
    for (let y = first; y <= last; y++) {
      for (const p of yearTotals(S, D, y)) {
        const q = people[p.email] || (people[p.email] = {email: p.email, name: p.name, rows: []});
        q.name = q.name || p.name;
        q.rows.push({year: y, commission: p.commission, profit: p.profit, earned: p.total, withdrawn: p.withdrawn});
      }
    }
    const out = [];
    for (const q of Object.values(people)) {
      let run = 0;
      for (const r of q.rows) { run += r.earned - r.withdrawn; r.balance = run; }
      q.rows = q.rows.filter(r => r.earned || r.withdrawn);
      for (const k of ['earned', 'withdrawn', 'commission', 'profit']) q[k] = q.rows.reduce((s, r) => s + r[k], 0);
      q.balance = q.earned - q.withdrawn; flags(q); q.me = q.email === S.me;
      if (q.rows.length) out.push(q);
    }
    return out.sort((a, b) => (a.email === '') - (b.email === '') || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0));
  }

  const api = {overview, lifetime, hund};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AM_STATEMENT = api;
})(typeof window !== 'undefined' ? window : globalThis);
