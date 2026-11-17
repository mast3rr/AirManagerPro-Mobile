/* Beleg-Text in Angaben zerlegen: Titel, Datum, Belegnummer, Einzelposten, Summe.
   Gleiche Regeln wie am Computer (services/scanner.py, parse_receipt), dazu albanische Wörter. Geld in Cent (ganze Zahlen). */
(function (root) {
  'use strict';
  // Betrag mit genau zwei Nachkommastellen, davor/danach keine weitere Ziffer (ohne „Lookbehind“, das ältere iPhones nicht kennen)
  const AMT = /(^|[^\d.,])(\d{1,3}(?:[. ]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?!\d)/g;
  const WORD = '(^|[^a-zà-ÿ])', END = '(?=$|[^a-zà-ÿ])';
  const TOTAL = new RegExp(WORD + '(total|summe|gesamt|gesamtbetrag|zu zahlen|amount due|endbetrag|totali|shuma|gjithsej|p[ëe]r pages[ëe])' + END, 'i');
  const SKIP = new RegExp(WORD + '(mwst|ust|steuer|netto|brutto|zwischensumme|subtotal|r[üu]e?ckgeld|gegeben|bar|visa|mastercard|karte|ec|change|tax|vat|iban|bic|tvsh|kusuri|kesh|n[ëe]ntotali)' + END, 'i');
  const DATE = /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/;
  const NUMBER = /(?:beleg|rechnung|bon|receipt|invoice|fatura|kuponi)\s*-?\s*(?:nr\.?|no\.?|nummer|number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/]{2,})/i;

  function cents(s) {
    s = s.replace(/ /g, '');
    if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (s.includes(',')) s = s.replace(',', '.');
    return Math.round(parseFloat(s) * 100);
  }
  function amounts(line) {
    const out = []; AMT.lastIndex = 0;
    for (let m; (m = AMT.exec(line));) { const start = m.index + m[1].length; out.push({text: m[2], start, end: start + m[2].length}); AMT.lastIndex = start + m[2].length; }
    return out;
  }
  function item(line) {
    const found = amounts(line); if (!found.length) return null;
    const last = found[found.length - 1], total = cents(last.text);
    let head = line.slice(0, last.start), qty = 1;
    if (found.length >= 2) {                                              // „Name 2 x 12,50 25,00“
      const prev = found[found.length - 2], unit = cents(prev.text);
      if (unit > 0) { const q = total / unit; if (q >= 1 && Math.abs(q - Math.round(q)) < 0.01) { qty = Math.round(q); head = line.slice(0, prev.start).replace(/\s*\d+\s*[xX×]\s*$/, ''); } }
    }
    const m = /^\s*(\d+)\s*[xX×]\s+(.+)$/.exec(head);                       // „2 x Name 25,00“
    if (m && qty === 1) { qty = parseInt(m[1], 10); head = m[2]; }
    head = head.replace(/\s*[xX×]\s*$/, '').replace(/^[ .:\-€\t]+|[ .:\-€\t]+$/g, '') || 'Item';
    if (total <= 0 || qty <= 0) return null;
    return {title: head.slice(0, 80), qty, unit_price: Math.round(total / qty), amount: total};
  }
  function parse(text) {
    const lines = String(text || '').split(/\r?\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const items = []; let total = null, date = null, number = '', title = '';
    for (const l of lines) {
      const dm = DATE.exec(l);
      if (dm && !date) {
        const y = +dm[3], mo = +dm[2], d = +dm[1], dt = new Date(y, mo - 1, d);
        if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
      const nm = NUMBER.exec(l); if (nm && !number) number = nm[1];
      if (dm) continue;
      if (TOTAL.test(l)) { const a = amounts(l); if (a.length) { const v = cents(a[a.length - 1].text); total = total === null || v > total ? v : total; continue; } }
      if (SKIP.test(l)) continue;
      const it = item(l);
      if (it) items.push(it);
      else if (!title && /[A-Za-zÀ-ÿ]{3,}/.test(l) && l.length <= 60) title = l;
    }
    if (total === null && items.length) total = items.reduce((s, i) => s + i.amount, 0);
    return {title, date, receipt_number: number, items, total: total || 0};
  }
  const api = {parse};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AM_RECEIPT = api;
})(typeof window !== 'undefined' ? window : globalThis);
