/* Verbindung zur Cloud (Supabase): Anmeldung, Lesen (durch die Rechte in der Datenbank geschützt), Schreiben über apply_operation
   (derselbe Weg wie am Computer: Versionsprüfung, nie stilles Überschreiben), Belege, Chat. Keine Fremd-Bibliothek. */
(function () {
  const C = window.AM_CONFIG, BASE = C.url.replace(/\/+$/, '');
  const K_SES = 'am_m_session', K_DEV = 'am_m_device';
  const ls = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)); } catch (e) { return null; } };

  class ApiError extends Error {
    constructor(kind, code, message) { super(message || code || kind); this.kind = kind; this.code = code || ''; }
  }

  let session = null;
  try { session = JSON.parse(ls(K_SES) || 'null'); } catch (e) { session = null; }
  let onSignedOut = () => {};
  const keep = s => { session = s; ls(K_SES, s ? JSON.stringify(s) : null); };

  const uuid = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
  const deviceId = () => { let d = ls(K_DEV); if (!/^[0-9a-f-]{36}$/.test(d || '')) { d = uuid(); ls(K_DEV, d); } return d; };

  async function raw(path, opt = {}) {
    const headers = {apikey: C.key, ...(opt.headers || {})};
    if (opt.auth !== false && session) headers.Authorization = 'Bearer ' + session.access_token;
    let r;
    try { r = await fetch(BASE + path, {method: opt.method || 'GET', headers, body: opt.body, cache: 'no-store'}); }
    catch (e) { throw new ApiError('offline', 'network'); }
    return r;
  }
  const body = async r => { const tx = await r.text(); try { return tx ? JSON.parse(tx) : null; } catch (e) { return null; } };

  function take(d) {
    if (!d || !d.access_token || !d.user) throw new ApiError('server', 'bad_session');
    keep({access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
          user: {id: d.user.id, email: d.user.email || ''}});
  }

  async function signIn(email, password) {
    const r = await raw('/auth/v1/token?grant_type=password', {method: 'POST', auth: false, headers: {'Content-Type': 'application/json'},
                                                               body: JSON.stringify({email, password})});
    const d = await body(r);
    if (r.status === 429) throw new ApiError('rejected', 'too_many');
    if (!r.ok) throw new ApiError(r.status >= 500 ? 'server' : 'rejected', r.status >= 500 ? 'server' : 'bad_login');
    take(d);
  }

  let refreshing = null;
  function refresh() {
    if (!refreshing) refreshing = (async () => {
      if (!session || !session.refresh_token) throw new ApiError('auth', 'no_session');
      const r = await raw('/auth/v1/token?grant_type=refresh_token', {method: 'POST', auth: false, headers: {'Content-Type': 'application/json'},
                                                                    body: JSON.stringify({refresh_token: session.refresh_token})});
      if (r.status >= 500 || r.status === 429) throw new ApiError('server', 'busy');
      if (!r.ok) { signedOut(); throw new ApiError('auth', 'expired'); }
      take(await body(r));
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  function signedOut() { keep(null); onSignedOut(); }
  async function signOut() {
    try { if (session) await raw('/auth/v1/logout?scope=local', {method: 'POST'}); } catch (e) { /* offline: lokal abmelden reicht */ }
    keep(null);
  }

  /* Anfrage mit gültiger Anmeldung; läuft sie ab, wird sie einmal erneuert und die Anfrage wiederholt. */
  async function call(path, opt = {}) {
    if (!session) { signedOut(); throw new ApiError('auth', 'no_session'); }
    if (session.expires_at - Date.now() / 1000 < 60) await refresh();
    let r = await raw(path, opt);
    if (r.status === 401) { await refresh(); r = await raw(path, opt); }
    if (r.status === 401 || r.status === 403) throw new ApiError('rejected', 'access_denied');
    return r;
  }

  async function rpc(fn, params) {
    const r = await call('/rest/v1/rpc/' + fn, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(params || {})});
    const d = await body(r);
    if (!r.ok) throw new ApiError(r.status >= 500 ? 'server' : 'rejected', (d && d.code) || 'http_' + r.status, d && d.message);
    if (d && d.status === 'REJECTED') throw new ApiError(d.retryable ? 'server' : 'rejected', d.code, d.message);
    return d || {};
  }

  async function select(table, query) {
    const r = await call(`/rest/v1/${table}?${query}`);
    const d = await body(r);
    if (!r.ok) throw new ApiError(r.status >= 500 ? 'server' : 'rejected', (d && d.code) || 'http_' + r.status);
    return d || [];
  }

  /* ---- Lesen */
  const P_COLS = 'id,name,city,units,status', B_COLS = 'id,property_id,guest_name,check_in,check_out,amount,status,notes,version',
        E_COLS = 'id,property_id,title,category,amount,date,receipt_number,paid_by,status,itemized_positions,version';
  const properties = () => select('properties', `select=${P_COLS}&deleted_at=is.null&order=name.asc`);
  const bookingsByCheckIn = (from, to) => select('bookings', `select=${B_COLS}&deleted_at=is.null&check_in=gte.${from}&check_in=lte.${to}&order=check_in.asc,guest_name.asc`);
  /* Buchungen, die den Zeitraum berühren (für „Heute“): Anreise <= to und Abreise >= from */
  const bookingsTouching = (from, to) => select('bookings', `select=${B_COLS}&deleted_at=is.null&status=neq.cancelled&check_in=lte.${to}&check_out=gte.${from}&order=check_in.asc`);
  /* Überschneidung wie am Computer: Anreise < neue Abreise und Abreise > neue Anreise */
  const bookingsOverlapping = (pid, ci, co) => select('bookings', `select=id&deleted_at=is.null&status=neq.cancelled&property_id=eq.${pid}&check_in=lt.${co}&check_out=gt.${ci}`);
  const expensesByDate = (from, to) => select('expenses', `select=${E_COLS}&deleted_at=is.null&date=gte.${from}&date=lte.${to}&order=date.desc,title.asc`);
  /* Alle Zeilen einer Abfrage, seitenweise (die Cloud liefert höchstens 1000 auf einmal) */
  async function selectAll(table, query) {
    const out = [];
    for (let off = 0; ; off += 1000) {
      const page = await select(table, `${query}&order=id.asc&limit=1000&offset=${off}`);
      out.push(...page);
      if (page.length < 1000) return out;
    }
  }
  const docs = async kind => { const d = await rpc('docs_list', {p_kind: kind}), out = {}; for (const x of d.docs || []) out[x.key] = x.data; return out; };
  /* Rohdaten für die Abrechnung (mobile/statement.js): alle Buchungen (ohne Stornos), alle Ausgaben, Eigentum, Auszahlungen */
  const statementData = () => Promise.all([
    select('properties', 'select=id,name,description&deleted_at=is.null'),
    selectAll('bookings', 'select=property_id,check_in,amount&deleted_at=is.null&status=neq.cancelled'),
    selectAll('expenses', 'select=property_id,date,amount&deleted_at=is.null'),
    docs('ownership'), docs('payout')]).then(([props, bookings, expenses, ownership, payouts]) => ({props, bookings, expenses, ownership, payouts}));
  /* Monat des zuletzt eingetragenen Eintrags (für den Sprung aus einer Mitteilung, die keinen Monat nennt) */
  const latestMonth = async kind => {
    const r = kind === 'bookings' ? await select('bookings', 'select=check_in&deleted_at=is.null&order=created_at.desc&limit=1')
                                  : await select('expenses', 'select=date&deleted_at=is.null&order=created_at.desc&limit=1');
    const d = r[0] && (r[0].check_in || r[0].date);
    return d ? String(d).slice(0, 7) : '';
  };
  const one = async (table, cols, id) => (await select(table, `select=${cols}&id=eq.${id}`))[0] || null;
  const booking = id => one('bookings', B_COLS + ',deleted_at', id);
  const expense = id => one('expenses', E_COLS + ',deleted_at', id);

  /* ---- Gerät */
  async function registerDevice(name) {
    try { const d = await rpc('register_device', {p_device_id: deviceId(), p_name: name}); return d.pending ? 'pending' : 'ok'; }
    catch (e) { if (e.code === 'device_revoked' || e.code === 'device_unavailable') return 'revoked'; throw e; }
  }

  /* ---- Schreiben: eine Operation, vom Server geprüft. Bei einem Unterschied (CONFLICT) wird nichts überschrieben. */
  async function apply(entity, id, operation, baseVersion, fields) {
    const d = await rpc('apply_operation', {p_op_id: uuid(), p_device_id: deviceId(), p_entity_type: entity, p_entity_id: id,
                                            p_operation: operation, p_base_version: baseVersion, p_payload: {schema: 1, fields}});
    if (d.status === 'CONFLICT') throw new ApiError('rejected', 'conflict');
    if (d.status !== 'ACCEPTED') throw new ApiError('server', 'unexpected');
    return d;
  }

  /* ---- Belege (Bucket „files“, Pfad wie am Computer: expense/<id>/<sha256>.jpg) */
  const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
  async function uploadReceipt(expenseId, blob) {
    const buf = await blob.arrayBuffer(), sha = hex(await crypto.subtle.digest('SHA-256', buf));
    const path = `expense/${expenseId}/${sha}.jpg`;
    const r = await call(`/storage/v1/object/files/${path}`, {method: 'POST', body: blob,
                         headers: {'Content-Type': 'image/jpeg', 'x-upsert': 'false', 'cache-control': 'max-age=31536000'}});
    if (!r.ok) {
      const d = await body(r), txt = JSON.stringify(d || '');
      if (!(r.status === 409 || /Duplicate|already exists/i.test(txt))) throw new ApiError(r.status >= 500 ? 'server' : 'rejected', 'upload');
    }
    const m = await call('/rest/v1/files', {method: 'POST', headers: {'Content-Type': 'application/json', Prefer: 'return=minimal'},
                         body: JSON.stringify({entity_type: 'expense', entity_id: expenseId, sha256: sha, mime: 'image/jpeg', size: blob.size,
                                               storage_path: path, created_by: session.user.id})});
    if (!m.ok && m.status !== 409) throw new ApiError(m.status >= 500 ? 'server' : 'rejected', 'upload_meta');
  }
  const receiptsOf = ids => ids.length ? select('files', `select=entity_id,mime,storage_path,created_at&entity_type=eq.expense&entity_id=in.(${ids.join(',')})&order=created_at.desc`) : Promise.resolve([]);
  async function fileBlob(path) {
    const r = await call(`/storage/v1/object/authenticated/files/${path}`);
    if (!r.ok) throw new ApiError(r.status >= 500 ? 'server' : 'rejected', 'download');
    return r.blob();
  }

  window.AM_API = {
    ApiError, uuid, deviceId,
    get user() { return session ? session.user : null; },
    set onSignedOut(fn) { onSignedOut = fn; },
    signIn, signOut, registerDevice,
    access: () => rpc('my_access', {}),
    profile: async () => (await select('profiles', `select=display_name,role,active&id=eq.${session.user.id}`))[0] || null,
    properties, bookingsByCheckIn, bookingsTouching, bookingsOverlapping, expensesByDate, booking, expense,
    apply, uploadReceipt, receiptsOf, fileBlob, statementData, latestMonth,
    push: {                                                                  // Mitteilungen (Migration 0023)
      status: () => rpc('push_status', {}),
      setup: (pub, priv) => rpc('push_setup', {p_url: BASE + '/functions/v1/push', p_public: pub, p_private: priv}),
      subscribe: (endpoint, p256dh, auth, lang) => rpc('push_subscribe', {p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_lang: lang}),
      unsubscribe: endpoint => rpc('push_unsubscribe', {p_endpoint: endpoint}),
    },
    admin: {                                                                 // nur Administratoren; die Cloud prüft das selbst
      devices: async () => (await rpc('list_devices', {})).devices || [],
      approve: id => rpc('approve_device', {p_device_id: id}),
      revoke: id => rpc('revoke_device', {p_device_id: id}),
      staff: async () => (await rpc('list_staff', {})).users || [],
      setActive: (id, active) => rpc('set_user_active', {p_user_id: id, p_active: active}),
      overview: () => rpc('access_overview', {}),
      setAccess: (id, properties, auto, permissions) => rpc('set_user_access', {p_user_id: id, p_properties: properties, p_auto_access: auto, p_permissions: permissions}),
    },
    chat: {
      contacts: () => rpc('chat_contacts', {}),
      history: peer => rpc('chat_history', {p_peer: peer, p_limit: 100}),
      post: (peer, text) => rpc('chat_post', {p_peer: peer, p_body: text, p_kind: 'text'}),
      postFile: (peer, name, type, b64, text) => rpc('chat_post', {p_peer: peer, p_body: text || '', p_kind: 'file', p_att_name: name, p_att_type: type, p_att_data: b64}),
      nudge: peer => rpc('chat_post', {p_peer: peer, p_body: '', p_kind: 'nudge'}),
      read: peer => rpc('chat_read', {p_peer: peer}),
      badge: () => rpc('chat_badge', {}),
      file: id => rpc('chat_file', {p_message_id: id}),
    },
  };
})();
