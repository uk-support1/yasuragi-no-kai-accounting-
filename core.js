/* 会計ロジック（画面に依存しない部分）。ブラウザでも Node でも動く。 */
(function (root) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // line: 総会資料で表示する科目名（省略時は科目名）／ sub: 市補助金の区分（事務費・事業費・その他・対象外）
  // net: 総会資料では、その収入科目から差し引いて表示する（例：イベント費用を事業収入から差引）
  const DEFAULT_CATS = [
    { n: '会費', t: 'in' }, { n: '補助金', t: 'in' }, { n: '事業収入', t: 'in' }, { n: '雑収入', t: 'in' },
    { n: '会議費', t: 'out', sub: '事務費' }, { n: '研修費', t: 'out', sub: '事業費' }, { n: '通信費', t: 'out', sub: '事務費' },
    { n: '交通費', t: 'out', sub: '事業費' }, { n: '消耗品費', t: 'out', sub: '事務費' },
    { n: '交際費', t: 'out', line: '交際・慶弔費', sub: 'その他' }, { n: '慶弔費', t: 'out', line: '交際・慶弔費', sub: '対象外' },
    { n: '諸会費', t: 'out', sub: 'その他' }, { n: 'イベント費用', t: 'out', sub: '事業費', net: '事業収入' },
    { n: 'ゆうちょ手数料', t: 'out', line: '振込手数料', sub: '事務費' }, { n: '雑費', t: 'out', sub: 'その他' }, { n: '予備費', t: 'out', sub: 'その他' },
    { n: '資金移動', t: 'move' },
  ];
  const SUBS = ['事務費', '事業費', 'その他', '対象外'];
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
      v: 3, org: 'やすらぎの会', treasurer: '', fee: 165, feeUnit: 3000,
      accounts: DEFAULT_ACCTS.slice(), cats: DEFAULT_CATS.map((c) => ({ ...c })),
      entries: [], openings: {}, actuals: {}, prior: {}, checks: {},
      reserve: ['積立口座'], excess: {}, budgets: {}, remarks: {}, notes: {}, yearly: {},
      info: { president: '', signTitle: '会長兼会計', address: '', members: '', assemblyCount: '', regularCount: '', attendees: '', schedule: '', bulletin: '', activities: '', auditor1: '', auditor2: '' },
      fy: fyOf(todayStr()),
    };
  }

  function catType(state, name) {
    const c = state.cats.find((x) => x.n === name);
    return c ? c.t : null;
  }
  const isMove = (state, e) => catType(state, e.cat) === 'move';
  const isReserveAcct = (state, a) => (state.reserve || []).includes(a);
  const lineOf = (state, name) => { const c = state.cats.find((x) => x.n === name); return (c && c.line) || name; };
  const inFy = (e, fy) => fyOf(e.date) === fy;
  const sortEntries = (list) =>
    list.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));

  /* 科目別集計（資金移動は除く） */
  function categoryTotals(state, fy) {
    const inn = {}, out = {};
    for (const e of state.entries) {
      if (!inFy(e, fy) || isMove(state, e) || isReserveAcct(state, e.acct)) continue;
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
      return { name: a, opening, in: f.in, out: f.out, closing, actual, diff: actual == null ? null : actual - closing, reserve: isReserveAcct(state, a), excess: excessOf(state, fy, a) };
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
        if (!isMove(state, e) && !isReserveAcct(state, e.acct)) { if (e.kind === 'in') inc += e.amount; else exp += e.amount; }
      }
      const bal = {};
      state.accounts.forEach((a) => { run[a] += acct[a].in - acct[a].out; bal[a] = run[a]; });
      return { ym, in: inc, out: exp, net: inc - exp, acct, bal, check: state.checks[ym] || null };
    });
  }

  /* ---------- 一般会計の繰越・積立口座・総会資料用の集計 ---------- */
  // 繰越に含めない金額（不明金・預り金など）。前年度の設定を引き継ぐ
  function excessOf(state, fy, acct, depth = 0) {
    const o = state.excess && state.excess[fy];
    if (o && o[acct] != null && o[acct] !== '') return +o[acct];
    if (depth > 30) return 0;
    if (!Object.keys(state.excess || {}).some((k) => +k < fy)) return 0;
    return excessOf(state, fy - 1, acct, depth + 1);
  }
  function carry(state, fy) {
    let o = 0, c = 0;
    for (const a of state.accounts) {
      if (isReserveAcct(state, a)) continue;
      const ex = excessOf(state, fy, a);
      o += openingOf(state, fy, a) - ex;
      c += closingOf(state, fy, a) - ex;
    }
    return { opening: o, closing: c };
  }
  function reserveSummary(state, fy) {
    const r = { has: false, opening: 0, toReserve: 0, fromReserve: 0, interest: 0, otherOut: 0, closing: 0 };
    for (const a of state.accounts) if (isReserveAcct(state, a)) { r.has = true; r.opening += openingOf(state, fy, a); }
    for (const e of state.entries) {
      if (!inFy(e, fy) || !isReserveAcct(state, e.acct)) continue;
      const mv = isMove(state, e);
      if (e.kind === 'in') { if (mv) r.toReserve += e.amount; else r.interest += e.amount; }
      else if (mv) r.fromReserve += e.amount; else r.otherOut += e.amount;
    }
    r.closing = r.opening + r.toReserve + r.interest - r.fromReserve - r.otherOut;
    return r;
  }
  function lineNames(state, t) {
    const seen = [];
    for (const c of state.cats) { if (c.t !== t || c.net) continue; const l = c.line || c.n; if (!seen.includes(l)) seen.push(l); }
    return seen;
  }
  function lineTotals(state, fy) {
    const t = categoryTotals(state, fy), r = { in: {}, out: {} };
    for (const k of ['in', 'out']) for (const cat in t[k]) {
      const c = state.cats.find((x) => x.n === cat);
      if (k === 'out' && c && c.net) { r.in[c.net] = (r.in[c.net] || 0) - t.out[cat]; continue; }
      const l = lineOf(state, cat); r[k][l] = (r[k][l] || 0) + t[k][cat];
    }
    return r;
  }
  function autoRemark(state, fy, line) {
    const netCats = state.cats.filter((c) => c.net === line).map((c) => c.n);
    const all = state.entries.filter((e) => inFy(e, fy) && !isReserveAcct(state, e.acct) && !isMove(state, e) && (lineOf(state, e.cat) === line || netCats.includes(e.cat)));
    const es = all.filter((e) => !netCats.includes(e.cat));
    if (!es.length) return '';
    const unit = +state.feeUnit || 0;
    if (line === '会費' && unit > 0) {
      const s = es.filter((e) => e.kind === 'in').reduce((a, e) => a + e.amount, 0);
      if (s && s % unit === 0) return `会費${s / unit}名分 ＠${unit.toLocaleString('ja-JP')}`;
    }
    const by = new Map();
    for (const e of es) {
      const k = (e.desc || e.cat).replace(/^[\d０-９]+\/[\d０-９]+[（(][^）)]*[）)]\s*/, '').replace(/[（(][^）)]*[）)]/g, '').replace(/※.*$/, '').replace(/\s+/g, ' ').trim() || e.cat;
      by.set(k, (by.get(k) || 0) + e.amount);
    }
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]);
    const txt = top.slice(0, 3).map(([k]) => (k.length > 14 ? k.slice(0, 14) + '…' : k)).join('、') + (top.length > 3 ? ' 他' : '');
    const cost = all.filter((e) => netCats.includes(e.cat)).reduce((a, e) => a + (e.kind === 'out' ? e.amount : -e.amount), 0);
    if (!cost) return txt;
    const gross = es.reduce((a, e) => a + (e.kind === 'in' ? e.amount : -e.amount), 0);
    return `${txt}（売上${gross.toLocaleString('ja-JP')}円−経費${cost.toLocaleString('ja-JP')}円の差引）`;
  }
  const remarkOf = (state, fy, line) => { const m = state.remarks[fy]; return m && m[line] != null ? m[line] : autoRemark(state, fy, line); };
  const numOrNull = (v) => (v == null || v === '' ? null : +v);
  const budgetOf = (state, fy, line) => numOrNull(state.budgets[fy] && state.budgets[fy][line]);
  const sumK = (rows, k) => rows.reduce((s, r) => s + (r[k] || 0), 0);

  /* 決算報告（第2号議案）：予算額・決算額・比較増減・備考 */
  function settlement(state, fy) {
    const lt = lineTotals(state, fy), rs = reserveSummary(state, fy), cr = carry(state, fy);
    const mk = (kind, t) => {
      const names = lineNames(state, t);
      Object.keys(lt[kind]).forEach((n) => { if (!names.includes(n)) names.push(n); });
      return names.map((line) => ({ line, budget: budgetOf(state, fy, line), actual: lt[kind][line] || 0, remark: remarkOf(state, fy, line) }))
        .filter((r) => r.actual || r.budget);
    };
    const inc = mk('in', 'in'), exp = mk('out', 'out');
    if (rs.fromReserve) inc.push({ line: '積立口座より繰入', budget: null, actual: rs.fromReserve, remark: remarkOf(state, fy, '積立口座より繰入') });
    if (rs.toReserve) exp.push({ line: '積立口座へ繰入', budget: null, actual: rs.toReserve, remark: remarkOf(state, fy, '積立口座へ繰入') });
    const incSub = { budget: sumK(inc, 'budget'), actual: sumK(inc, 'actual') };
    const expSub = { budget: sumK(exp, 'budget'), actual: sumK(exp, 'actual') };
    const incTotal = { budget: incSub.budget + cr.opening, actual: incSub.actual + cr.opening };
    const next = { budget: incTotal.budget - expSub.budget, actual: cr.closing };
    const expTotal = { budget: expSub.budget + next.budget, actual: expSub.actual + next.actual };
    const accounts = state.accounts.filter((a) => !isReserveAcct(state, a)).map((a) => {
      const ex = excessOf(state, fy, a);
      return { name: a, excess: ex, amount: closingOf(state, fy, a) - ex };
    }).filter((a) => a.amount || a.excess);
    return { fy, inc, exp, incSub, expSub, opening: cr.opening, incTotal, next, expTotal, gap: incTotal.actual - expTotal.actual, reserve: rs, accounts };
  }

  // 来年度の予算額・摘要。未入力なら今年度の値を初期値として使う
  function nextBudget(state, fy, line) {
    const b = numOrNull(state.budgets[fy + 1] && state.budgets[fy + 1][line]);
    return b != null ? b : numOrNull(state.budgets[fy] && state.budgets[fy][line]);
  }
  function nextNote(state, fy, line) {
    const m = state.notes[fy + 1]; if (m && m[line] != null) return m[line];
    const p = state.notes[fy]; return p && p[line] != null ? p[line] : '';
  }

  /* 来年度の予算案（第4号議案） */
  function budgetPlan(state, fy) {
    const nf = fy + 1, lt = lineTotals(state, fy), cr = carry(state, fy);
    const eff = (line) => nextBudget(state, fy, line);
    const note = (line) => nextNote(state, fy, line);
    const mk = (kind, t) => {
      const names = lineNames(state, t);
      Object.keys(lt[kind]).forEach((n) => { if (!names.includes(n)) names.push(n); });
      return names.map((line) => ({ line, budget: eff(line), note: note(line), prev: lt[kind][line] || 0 })).filter((r) => r.budget != null || r.prev);
    };
    const inc = mk('in', 'in'), exp = mk('out', 'out');
    const incSub = sumK(inc, 'budget'), expSub = sumK(exp, 'budget');
    const incTotal = incSub + cr.closing, next = incTotal - expSub;
    return { fy: nf, inc, exp, incSub, carry: cr.closing, incTotal, expSub, next, expTotal: expSub + next };
  }

  /* 市補助金 実績報告 */
  function subsidy(state, fy) {
    const t = categoryTotals(state, fy), lt = lineTotals(state, fy), st = settlement(state, fy);
    const sub = {}, names = {};
    SUBS.forEach((k) => { sub[k] = 0; names[k] = []; });
    let B = 0;
    for (const cat in t.out) {
      const c = state.cats.find((x) => x.n === cat);
      if (c && c.net) continue;
      const k = c && c.sub && SUBS.includes(c.sub) ? c.sub : 'その他';
      sub[k] += t.out[cat]; B += t.out[cat];
      if (t.out[cat]) names[k].push(cat);
    }
    const city = lt.in['補助金'] || 0, self = (lt.in['会費'] || 0) + (lt.in['事業収入'] || 0);
    const A = st.incTotal.actual;
    return {
      A, national: 0, prefecture: 0, city, self, carryIn: st.opening, other: A - city - self - st.opening,
      B, target: B - sub['対象外'], sub, names, next: st.next.actual,
      selfNote: [lt.in['会費'] ? `会費${lt.in['会費'].toLocaleString('ja-JP')}` : '', lt.in['事業収入'] ? `事業収入${lt.in['事業収入'].toLocaleString('ja-JP')}` : ''].filter(Boolean).join('、'),
    };
  }

  function migrate(s) {
    const d = defaultState();
    for (const k of ['reserve', 'excess', 'budgets', 'remarks', 'notes', 'yearly', 'info']) if (s[k] == null) s[k] = d[k];
    if (s.feeUnit == null) s.feeUnit = 3000;
    if (!s.v || s.v < 3) {
      for (const dc of DEFAULT_CATS) {
        const c = s.cats.find((x) => x.n === dc.n);
        if (!c) s.cats.push({ ...dc });
        else for (const k of ['line', 'sub', 'net']) if (dc[k] && c[k] == null) c[k] = dc[k];
      }
      s.v = 3;
    }
    return s;
  }

  /* 報告書データ（前年度比較・内訳用） */
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
    const cr = carry(state, fy);
    const opening = cr.opening, closing = cr.closing;
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
    const out = { entries, newCats, openings: {}, excess: {}, prior: {}, checks: {}, log };

    // 期首残高・現金チェック（月別収支 兼 現金チェック）
    const mw = wb.getWorksheet('月別収支 兼 現金チェック');
    let fy = null;
    if (entries.length) fy = Math.min(...entries.map((e) => fyOf(e.date)));
    if (mw && fy != null) {
      const cash = num(cv(mw.getCell('R2'))), yucho = num(cv(mw.getCell('U2')));
      out.openings[fy] = { 現金: cash, ゆうちょ振込: yucho };
      out.excess[fy] = { ゆうちょ振込: yucho };
      log.push(`ゆうちょの期首残高 ${yucho.toLocaleString('ja-JP')}円 は「過剰分」として、繰越金に含めない扱いにしました（元のExcelと同じ考え方）`);
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
    SUBS, isReserveAcct, lineOf, excessOf, carry, reserveSummary, lineNames, lineTotals, autoRemark, remarkOf, settlement, budgetPlan, nextBudget, nextNote, subsidy, migrate,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
