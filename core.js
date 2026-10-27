/* 会計ロジック（画面に依存しない部分）。ブラウザでも Node でも動く。 */
(function (root) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const DEFAULT_CATS = [
    { n: '会費', t: 'in' }, { n: '補助金', t: 'in' }, { n: '事業収入', t: 'in' }, { n: '雑収入', t: 'in' },
    { n: '会議費', t: 'out' }, { n: '研修費', t: 'out' }, { n: '通信費', t: 'out' }, { n: '交通費', t: 'out' },
    { n: '消耗品費', t: 'out' }, { n: '交際費', t: 'out' }, { n: '諸会費', t: 'out' }, { n: 'イベント費用', t: 'out' },
    { n: 'ゆうちょ手数料', t: 'out' }, { n: '雑費', t: 'out' },
    { n: '資金移動', t: 'move' },
  ];
  const DEFAULT_ACCTS = ['現金', '普通口座', '積立口座', 'ゆうちょ振込'];

  function fyOf(d) {
    const y = +d.slice(0, 4), m = +d.slice(5, 7);
    return m >= 4 ? y : y - 1;
  }
  function fyMonths(fy) {
    const a = [];
    for (let i = 0; i < 12; i++) {
      const m = ((3 + i) % 12) + 1;
      a.push((m >= 4 ? fy : fy + 1) + '-' + pad(m));
    }
    return a;
  }
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function defaultState() {
    return {
      v: 1, org: 'やすらぎの会', treasurer: '', fee: 165,
      accounts: DEFAULT_ACCTS.slice(), cats: DEFAULT_CATS.map((c) => ({ ...c })),
      entries: [], openings: {}, actuals: {}, prior: {}, checks: {},
      fy: fyOf(todayStr()),
    };
  }

  function catType(state, name) {
    const c = state.cats.find((x) => x.n === name);
    return c ? c.t : null;
  }
  const isMove = (state, e) => catType(state, e.cat) === 'move';
  const inFy = (e, fy) => fyOf(e.date) === fy;
  const sortEntries = (list) =>
    list.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));

  /* 科目別集計（資金移動は除く） */
  function categoryTotals(state, fy) {
    const inn = {}, out = {};
    for (const e of state.entries) {
      if (!inFy(e, fy) || isMove(state, e)) continue;
      const m = e.kind === 'in' ? inn : out;
      m[e.cat] = (m[e.cat] || 0) + e.amount;
    }
    return { in: inn, out };
  }

  function openingOf(state, fy, acct, depth = 0) {
    const o = state.openings[fy];
    if (o && o[acct] != null && o[acct] !== '') return +o[acct];
    if (depth > 30) return 0;
    const hasPrev =
      state.entries.some((e) => fyOf(e.date) < fy) || Object.keys(state.openings).some((k) => +k < fy);
    return hasPrev ? closingOf(state, fy - 1, acct, depth + 1) : 0;
  }
  function flows(state, fy, acct) {
    let i = 0, o = 0;
    for (const e of state.entries) {
      if (e.acct !== acct || !inFy(e, fy)) continue;
      if (e.kind === 'in') i += e.amount; else o += e.amount;
    }
    return { in: i, out: o };
  }
  function closingOf(state, fy, acct, depth = 0) {
    const f = flows(state, fy, acct);
    return openingOf(state, fy, acct, depth) + f.in - f.out;
  }

  function balances(state, fy) {
    return state.accounts.map((a) => {
      const f = flows(state, fy, a);
      const opening = openingOf(state, fy, a);
      const closing = opening + f.in - f.out;
      const actualRaw = state.actuals[fy] && state.actuals[fy][a];
      const actual = actualRaw == null || actualRaw === '' ? null : +actualRaw;
      return { name: a, opening, in: f.in, out: f.out, closing, actual, diff: actual == null ? null : actual - closing };
    });
  }

  /* 月別（収支は資金移動を除く／口座残高は全取引） */
  function monthly(state, fy) {
    const months = fyMonths(fy);
    const run = {};
    state.accounts.forEach((a) => (run[a] = openingOf(state, fy, a)));
    return months.map((ym) => {
      let inc = 0, exp = 0;
      const acct = {};
      state.accounts.forEach((a) => (acct[a] = { in: 0, out: 0 }));
      for (const e of state.entries) {
        if (e.date.slice(0, 7) !== ym) continue;
        if (acct[e.acct]) acct[e.acct][e.kind] += e.amount;
        if (!isMove(state, e)) { if (e.kind === 'in') inc += e.amount; else exp += e.amount; }
      }
      const bal = {};
      state.accounts.forEach((a) => { run[a] += acct[a].in - acct[a].out; bal[a] = run[a]; });
      return { ym, in: inc, out: exp, net: inc - exp, acct, bal, check: state.checks[ym] || null };
    });
  }

  /* 報告書データ（画面表示・Excel 出力で共通） */
  function buildReport(state, fy) {
    const cur = categoryTotals(state, fy);
    const hasPrevEntries = state.entries.some((e) => inFy(e, fy - 1));
    const prevCalc = hasPrevEntries ? categoryTotals(state, fy - 1) : null;
    const prior = state.prior[fy - 1] || null;
    const prevOf = (kind, cat) => {
      if (prevCalc) return prevCalc[kind][cat] || 0;
      if (prior && prior[cat] != null && prior[cat] !== '') return +prior[cat];
      return null;
    };
    const names = (kind, t) => {
      const base = state.cats.filter((c) => c.t === t).map((c) => c.n);
      const extra = new Set();
      [cur[kind], prevCalc && prevCalc[kind]].forEach((m) => m && Object.keys(m).forEach((k) => {
        if (!base.includes(k) && catType(state, k) !== 'move') extra.add(k);
      }));
      if (prior) Object.keys(prior).forEach((k) => { if (!base.includes(k) && catType(state, k) == null && prior[k] !== '') extra.add(k); });
      return base.concat([...extra]);
    };
    const rows = (kind, t) =>
      names(kind, t).map((cat) => {
        const c = cur[kind][cat] || 0, p = prevOf(kind, cat);
        return { cat, cur: c, prev: p, diff: p == null ? null : c - p };
      });
    const sum = (arr, k) => (arr.every((r) => r[k] == null) ? null : arr.reduce((s, r) => s + (r[k] || 0), 0));
    const incomeRows = rows('in', 'in'), expenseRows = rows('out', 'out');
    const totIn = { cur: sum(incomeRows, 'cur'), prev: sum(incomeRows, 'prev') };
    const totOut = { cur: sum(expenseRows, 'cur'), prev: sum(expenseRows, 'prev') };
    const bal = balances(state, fy);
    const opening = bal.reduce((s, b) => s + b.opening, 0);
    const closing = bal.reduce((s, b) => s + b.closing, 0);
    const details = {};
    for (const e of sortEntries(state.entries.filter((e) => inFy(e, fy)))) (details[e.cat] = details[e.cat] || []).push(e);
    return {
      fy, org: state.org, treasurer: state.treasurer,
      incomeRows, expenseRows, totIn, totOut,
      net: { cur: totIn.cur - totOut.cur, prev: totIn.prev == null || totOut.prev == null ? null : totIn.prev - totOut.prev },
      opening, closing, accounts: bal, months: monthly(state, fy), details,
      ledger: sortEntries(state.entries.filter((e) => inFy(e, fy))),
    };
  }

  /* ---------- 既存 Excel（総勘定シート）の取り込み ---------- */
  function cv(cell) {
    let v = cell && cell.value;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('result' in v) v = v.result;
      else if (v.richText) v = v.richText.map((r) => r.text).join('');
      else if (v.text) v = v.text;
    }
    return v == null ? null : v;
  }
  function num(v) {
    if (typeof v === 'number') return v;
    if (v == null || v === '') return 0;
    const n = parseFloat(String(v).replace(/[,，円\s]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function dateStr(v) {
    if (v instanceof Date) return v.getUTCFullYear() + '-' + pad(v.getUTCMonth() + 1) + '-' + pad(v.getUTCDate());
    if (typeof v === 'number') return dateStr(new Date(Math.round((v - 25569) * 86400000)));
    if (typeof v === 'string' && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(v)) {
      const [y, m, d] = v.split(/[-/]/);
      return y + '-' + pad(+m) + '-' + pad(parseInt(d, 10));
    }
    return null;
  }

  function importLegacy(wb, state) {
    const log = [];
    const ws = wb.getWorksheet('総勘定');
    if (!ws) throw new Error('「総勘定」シートが見つかりません');
    const entries = [];
    let splitN = 0;
    const cats = new Set(state.cats.map((c) => c.n));
    const newCats = [];
    const addCat = (n, kind) => { if (!cats.has(n)) { cats.add(n); newCats.push({ n, t: kind }); } };
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const date = dateStr(cv(row.getCell(1)));
      const cat = String(cv(row.getCell(2)) || '').trim();
      const desc = String(cv(row.getCell(3)) || '').trim();
      const inc = num(cv(row.getCell(4))), exp = num(cv(row.getCell(5)));
      const acct = String(cv(row.getCell(6)) || '').trim();
      const note = String(cv(row.getCell(8)) || '').trim();
      if (!date || (!inc && !exp)) continue;
      const a = acct || '現金';
      const c = cat || '雑費';
      if (inc) {
        // 収入なのに支出系の科目になっている行（入力ミス）は科目を直す
        let ic = c;
        const t = catType(state, c);
        if (t === 'out') {
          ic = /会費/.test(desc) ? '会費' : '雑収入';
          log.push(`${date} 「${desc}」収入${inc}円：科目が「${c}」でしたが「${ic}」に直しました`);
        }
        addCat(ic, 'in');
        entries.push({ id: uid(), date, cat: ic, desc, kind: 'in', amount: inc, acct: a, note });
      }
      if (exp) {
        // 収入と同じ行に入っていた支出（振込手数料）は別明細に分ける
        const split = !!inc;
        const ec = split ? (a === 'ゆうちょ振込' ? 'ゆうちょ手数料' : c) : c;
        addCat(ec, 'out');
        entries.push({ id: uid(), date, cat: ec, desc: split ? '振込手数料' : desc, kind: 'out', amount: exp, acct: a, note: split ? '' : note });
        if (split) splitN++;
      }
    }
    if (splitN) log.push(`${splitN}件：収入と同じ行に入っていた振込手数料を、別の明細（ゆうちょ手数料）に分けました`);
    const out = { entries, newCats, openings: {}, prior: {}, checks: {}, log };

    // 期首残高・現金チェック（月別収支 兼 現金チェック）
    const mw = wb.getWorksheet('月別収支 兼 現金チェック');
    let fy = null;
    if (entries.length) fy = Math.min(...entries.map((e) => fyOf(e.date)));
    if (mw && fy != null) {
      const cash = num(cv(mw.getCell('R2'))), yucho = num(cv(mw.getCell('U2')));
      out.openings[fy] = { 現金: cash, ゆうちょ振込: yucho };
      for (let r = 3; r <= 14; r++) {
        const amt = cv(mw.getCell('N' + r)), day = dateStr(cv(mw.getCell('O' + r))), q = dateStr(cv(mw.getCell('Q' + r)));
        if (typeof amt === 'number' && day && q) out.checks[q.slice(0, 7)] = { amount: amt, date: day };
      }
    }
    // 前年度の決算・預金残高（2025年会計チェック）
    const prev = wb.worksheets.find((s) => /会計チェック/.test(s.name));
    if (prev && fy != null) {
      let section = null;
      const p = {};
      const rowsCount = prev.rowCount;
      let balRow = null, hdr = null;
      for (let r = 1; r <= rowsCount; r++) {
        const a = String(cv(prev.getCell(r, 1)) || '').trim();
        if (a === '【収入】') section = 'in';
        else if (a === '【支出】') section = 'out';
        else if (a === '【収支】') section = null;
        else if (section && a && a !== '科目' && !/合計/.test(a)) {
          const b = cv(prev.getCell(r, 2));
          if (typeof b === 'number') p[a] = b; else if (b == null) p[a] = 0;
        }
        if (a === '実 期末') balRow = r;
        if (/積立/.test(String(cv(prev.getCell(r, 2)) || '')) && /普通/.test(String(cv(prev.getCell(r, 3)) || ''))) hdr = r;
      }
      if (Object.keys(p).length) out.prior[fy - 1] = p;
      if (balRow && hdr) {
        const o = out.openings[fy] || (out.openings[fy] = {});
        const map = { 積立: '積立口座', 普通: '普通口座' };
        for (let c = 2; c <= 5; c++) {
          const h = String(cv(prev.getCell(hdr, c)) || '');
          const v = cv(prev.getCell(balRow, c));
          for (const k in map) if (h.includes(k) && typeof v === 'number') o[map[k]] = v;
        }
      }
    }
    return out;
  }

  const api = {
    uid, pad, fyOf, fyMonths, todayStr, defaultState, catType, isMove, inFy, sortEntries,
    categoryTotals, openingOf, closingOf, balances, monthly, buildReport, importLegacy, DEFAULT_CATS, DEFAULT_ACCTS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
