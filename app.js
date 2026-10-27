(function () {
  'use strict';
  const C = window.Core;
  const KEY = 'yasuragi-accounting-v1';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const yen = (n) => (n == null ? '—' : (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('ja-JP'));
  const md = (d) => +d.slice(5, 7) + '/' + +d.slice(8, 10);

  /* ---------- 保存 ---------- */
  function load() {
    const base = C.defaultState();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(base, JSON.parse(raw));
    } catch (e) { /* 読めなければ初期状態 */ }
    return base;
  }
  let S = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('保存できませんでした（容量不足の可能性）'); }
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

  let tab = 'input';
  const ui = { type: 'out', cat: '', acct: '現金', from: '現金', to: '普通口座', date: C.todayStr(), amt: '', desc: '', note: '', fee: null, edit: null, listMonth: 'all', listCat: '', q: '' };

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- 年度セレクタ ---------- */
  function renderFy() {
    const set = new Set([S.fy, C.fyOf(C.todayStr()), C.fyOf(C.todayStr()) + 1]);
    S.entries.forEach((e) => set.add(C.fyOf(e.date)));
    Object.keys(S.openings).forEach((k) => set.add(+k));
    const sel = $('#fySel');
    sel.innerHTML = [...set].sort().map((y) => `<option value="${y}" ${y === S.fy ? 'selected' : ''}>${y}年度</option>`).join('');
  }
  $('#fySel').addEventListener('change', (e) => { S.fy = +e.target.value; save(); ui.listMonth = 'all'; render(); });

  /* ---------- タブ ---------- */
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    syncForm(); tab = b.dataset.tab;
    $$('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
    if (tab !== 'input') ui.edit = null;
    render(); window.scrollTo(0, 0);
  });

  function render() {
    renderFy();
    const v = $('#view');
    v.innerHTML = { input: vInput, list: vList, month: vMonth, report: vReport, settings: vSettings }[tab]();
  }

  /* ---------- 入力 ---------- */
  function catsFor(type) {
    if (ui.edit) return S.cats.map((c) => c.n);
    return S.cats.filter((c) => c.t === type).map((c) => c.n);
  }
  function syncForm() {
    const g = (id) => { const el = $('#' + id); return el ? el.value : null; };
    if (g('f-date') != null) ui.date = g('f-date');
    if (g('f-amt') != null) ui.amt = g('f-amt');
    if (g('f-desc') != null) ui.desc = g('f-desc');
    if (g('f-note') != null) ui.note = g('f-note');
    if (g('f-fee') != null) ui.fee = g('f-fee');
    if (g('f-from') != null) ui.from = g('f-from');
    if (g('f-to') != null) ui.to = g('f-to');
  }
  function vInput() {
    const type = ui.type;
    const cats = catsFor(type === 'move' ? 'move' : type);
    if (type !== 'move' && !cats.includes(ui.cat)) ui.cat = cats[0] || '';
    const recent = S.entries.slice(-6).reverse();
    const descs = [...new Set(S.entries.filter((e) => e.cat === ui.cat).map((e) => e.desc).filter(Boolean).reverse())].slice(0, 30);
    const showFee = type === 'in' && ui.acct === 'ゆうちょ振込' && !ui.edit;
    const accSel = (id, val) => `<select id="${id}">${S.accounts.map((a) => `<option ${a === val ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>`;
    return `
    <div class="card">
      <h2>${ui.edit ? '明細を修正' : '入力'}</h2>
      <div class="seg">
        <button data-act="type" data-v="out" class="out ${type === 'out' ? 'on' : ''}">支出</button>
        <button data-act="type" data-v="in" class="in ${type === 'in' ? 'on' : ''}">収入</button>
        ${ui.edit ? '' : `<button data-act="type" data-v="move" class="${type === 'move' ? 'on' : ''}">口座間移動</button>`}
      </div>
      <label class="f">日付</label>
      <input type="date" id="f-date" value="${esc(ui.date)}">
      <div class="quick"><button data-act="today">今日</button><button data-act="yesterday">昨日</button></div>
      <label class="f">金額（円）</label>
      <input class="amt" id="f-amt" inputmode="numeric" pattern="[0-9]*" placeholder="0" value="${esc(ui.amt)}">
      ${type === 'move' ? `
        <div class="row"><div><label class="f">移動元</label>${accSel('f-from', ui.from)}</div><div><label class="f">移動先</label>${accSel('f-to', ui.to)}</div></div>`
      : `
        <label class="f">科目</label>
        <div class="chips">${cats.map((c) => `<button data-act="cat" data-v="${esc(c)}" class="${c === ui.cat ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>
        <label class="f">入出金口座</label>
        <div class="chips">${S.accounts.map((a) => `<button data-act="acct" data-v="${esc(a)}" class="${a === ui.acct ? 'on' : ''}">${esc(a)}</button>`).join('')}</div>`}
      <label class="f">摘要</label>
      <input id="f-desc" list="desclist" placeholder="例：7/17 例会会場費" value="${esc(ui.desc)}" autocomplete="off">
      <datalist id="desclist">${descs.map((d) => `<option value="${esc(d)}">`).join('')}</datalist>
      <label class="f">メモ（任意：購入先・氏名など）</label>
      <input id="f-note" value="${esc(ui.note)}">
      ${showFee ? `<label class="f">振込手数料（円・不要なら 0）</label><input id="f-fee" inputmode="numeric" value="${esc(ui.fee == null ? S.fee : ui.fee)}">` : ''}
      <button class="btn" data-act="save">${ui.edit ? '修正を保存' : '保存'}</button>
      ${ui.edit ? `<button class="btn del" data-act="delete">この明細を削除</button><button class="btn sub" data-act="cancel">やめる</button>` : ''}
    </div>
    ${ui.edit ? '' : `<div class="card"><h2>最近の入力</h2>${recent.length ? recent.map(itemHtml).join('') : '<div class="muted">まだありません</div>'}</div>`}`;
  }
  function itemHtml(e) {
    return `<div class="item" data-act="edit" data-id="${e.id}">
      <div class="l"><div class="d">${md(e.date)}・${esc(e.cat)}・${esc(e.acct)}</div><div class="t">${esc(e.desc) || '（摘要なし）'}</div></div>
      <div class="a ${e.kind}">${e.kind === 'in' ? '+' : '−'}${yen(e.amount)}</div></div>`;
  }
  function parseAmt(s) { const n = parseInt(String(s).replace(/[,，\s円]/g, '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248)), 10); return isNaN(n) ? 0 : n; }
  function moveCat() { let c = S.cats.find((x) => x.t === 'move'); if (!c) { c = { n: '資金移動', t: 'move' }; S.cats.push(c); } return c.n; }

  function saveEntry() {
    syncForm();
    const amount = parseAmt(ui.amt);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ui.date)) return toast('日付を入れてください');
    if (amount <= 0) return toast('金額を入れてください');
    if (ui.type === 'move') {
      if (ui.from === ui.to) return toast('移動元と移動先が同じです');
      const cat = moveCat();
      const desc = ui.desc || `${ui.from}→${ui.to}`;
      S.entries.push({ id: C.uid(), date: ui.date, cat, desc, kind: 'out', amount, acct: ui.from, note: ui.note });
      S.entries.push({ id: C.uid(), date: ui.date, cat, desc, kind: 'in', amount, acct: ui.to, note: ui.note });
    } else if (ui.edit) {
      const e = S.entries.find((x) => x.id === ui.edit);
      Object.assign(e, { date: ui.date, cat: ui.cat, desc: ui.desc, kind: ui.type, amount, acct: ui.acct, note: ui.note });
    } else {
      if (!ui.cat) return toast('科目を選んでください');
      S.entries.push({ id: C.uid(), date: ui.date, cat: ui.cat, desc: ui.desc, kind: ui.type, amount, acct: ui.acct, note: ui.note });
      const fee = parseAmt(ui.fee == null ? S.fee : ui.fee);
      if (ui.type === 'in' && ui.acct === 'ゆうちょ振込' && fee > 0) {
        S.entries.push({ id: C.uid(), date: ui.date, cat: 'ゆうちょ手数料', desc: '振込手数料', kind: 'out', amount: fee, acct: ui.acct, note: '' });
      }
    }
    const wasEdit = !!ui.edit;
    ui.edit = null; ui.amt = ''; ui.desc = ''; ui.note = ''; ui.fee = null;
    save(); toast(wasEdit ? '修正しました' : '保存しました'); render();
    if (wasEdit) { tab = 'list'; $$('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === 'list')); render(); }
  }
  function startEdit(id) {
    const e = S.entries.find((x) => x.id === id); if (!e) return;
    ui.edit = id; ui.type = e.kind; ui.cat = e.cat; ui.acct = e.acct; ui.date = e.date; ui.amt = String(e.amount); ui.desc = e.desc; ui.note = e.note || '';
    tab = 'input'; $$('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === 'input')); render(); window.scrollTo(0, 0);
  }

  /* ---------- 一覧 ---------- */
  function vList() {
    const months = C.fyMonths(S.fy);
    let list = S.entries.filter((e) => C.inFy(e, S.fy));
    if (ui.listMonth !== 'all') list = list.filter((e) => e.date.startsWith(ui.listMonth));
    if (ui.listCat) list = list.filter((e) => e.cat === ui.listCat);
    if (ui.q) list = list.filter((e) => (e.desc + e.note + e.cat).includes(ui.q));
    list = C.sortEntries(list).reverse();
    const inn = list.filter((e) => e.kind === 'in' && !C.isMove(S, e)).reduce((s, e) => s + e.amount, 0);
    const out = list.filter((e) => e.kind === 'out' && !C.isMove(S, e)).reduce((s, e) => s + e.amount, 0);
    return `
    <div class="card">
      <div class="row">
        <select id="l-month"><option value="all">全期間</option>${months.map((m) => `<option value="${m}" ${ui.listMonth === m ? 'selected' : ''}>${+m.slice(5)}月</option>`).join('')}</select>
        <select id="l-cat"><option value="">全科目</option>${S.cats.map((c) => `<option ${ui.listCat === c.n ? 'selected' : ''}>${esc(c.n)}</option>`).join('')}</select>
      </div>
      <input id="l-q" placeholder="摘要・メモで検索" value="${esc(ui.q)}" style="margin-top:8px">
      <div class="kv" style="margin-top:10px"><span>収入 <b class="in">${yen(inn)}</b></span><span>支出 <b class="out">${yen(out)}</b></span><span>${list.length}件</span></div>
    </div>
    <div class="card">${list.length ? list.map(itemHtml).join('') : '<div class="muted">該当なし</div>'}</div>`;
  }

  /* ---------- 月次・現金チェック ---------- */
  function vMonth() {
    const ms = C.monthly(S, S.fy);
    const today = C.todayStr().slice(0, 7);
    return `<div class="card muted">毎月の現金チェック：お財布の金額を入れると、帳簿上の現金残高との差を表示します。差が出たら原因が分からなくても、その時点の金額を記録しておきます。</div>` +
      ms.map((m) => {
        const empty = !m.in && !m.out && !m.check && m.ym > today;
        const cash = m.bal['現金'];
        const diff = m.check ? m.check.amount - cash : null;
        return `<div class="card" style="${empty ? 'opacity:.55' : ''}">
          <div class="kv"><b>${m.ym.slice(0, 4)}年${+m.ym.slice(5)}月</b><span>収支 <b class="${m.net < 0 ? 'out' : 'in'}">${yen(m.net)}</b></span></div>
          <div class="kv"><span class="in">収入 ${yen(m.in)}</span><span class="out">支出 ${yen(m.out)}</span></div>
          ${S.accounts.includes('現金') ? `
          <div class="kv"><span>現金の帳簿残高（月末）</span><b>${yen(cash)}</b></div>
          <div class="row"><input data-check="${m.ym}" inputmode="numeric" placeholder="お財布の金額" value="${m.check ? m.check.amount : ''}">
          <input type="date" data-checkdate="${m.ym}" value="${m.check ? m.check.date : ''}"></div>
          ${diff == null ? '' : `<div class="kv"><span>差異</span><span class="badge ${diff ? 'ng' : ''}">${diff ? yen(diff) + '円（要確認）' : '一致'}</span></div>`}` : ''}
          <details><summary class="muted">口座別の月末残高</summary>${S.accounts.map((a) => `<div class="kv"><span>${esc(a)}</span><span>${yen(m.bal[a])}</span></div>`).join('')}</details>
        </div>`;
      }).join('');
  }
  function saveCheck(ym) {
    const a = $(`[data-check="${ym}"]`).value.trim(), d = $(`[data-checkdate="${ym}"]`).value;
    if (!a) delete S.checks[ym];
    else S.checks[ym] = { amount: parseAmt(a), date: d || C.todayStr() };
    save(); render();
  }

  /* ---------- 報告書 ---------- */
  function reportHtml(R) {
    const row = (r) => `<tr><td>${esc(r.cat)}</td><td>${yen(r.cur)}</td><td>${yen(r.prev)}</td><td>${yen(r.diff)}</td></tr>`;
    const d = (a, b) => (a == null || b == null ? null : a - b);
    return `<div class="report">
      <h1>${esc(R.org)}　${R.fy}年度 会計報告</h1>
      <div class="sub">${R.fy}年4月1日〜${R.fy + 1}年3月31日${R.treasurer ? '　会計担当：' + esc(R.treasurer) : ''}</div>
      <h3>収支計算書</h3>
      <table><tr><th>科目</th><th>${R.fy}年度</th><th>${R.fy - 1}年度</th><th>増減</th></tr>
        <tr class="sum"><td colspan="4" style="text-align:left">収入の部</td></tr>${R.incomeRows.map(row).join('')}
        <tr class="sum"><td>収入合計</td><td>${yen(R.totIn.cur)}</td><td>${yen(R.totIn.prev)}</td><td>${yen(d(R.totIn.cur, R.totIn.prev))}</td></tr>
        <tr class="sum"><td colspan="4" style="text-align:left">支出の部</td></tr>${R.expenseRows.map(row).join('')}
        <tr class="sum"><td>支出合計</td><td>${yen(R.totOut.cur)}</td><td>${yen(R.totOut.prev)}</td><td>${yen(d(R.totOut.cur, R.totOut.prev))}</td></tr>
        <tr class="sum"><td>当期収支差額</td><td>${yen(R.net.cur)}</td><td>${yen(R.net.prev)}</td><td>${yen(d(R.net.cur, R.net.prev))}</td></tr>
        <tr><td>前期繰越金</td><td>${yen(R.opening)}</td><td></td><td></td></tr>
        <tr class="sum"><td>次期繰越金</td><td>${yen(R.closing)}</td><td></td><td></td></tr></table>
      <h3>預貯金・現金残高</h3>
      <div class="scroll"><table><tr><th>口座</th><th>期首</th><th>収入</th><th>支出</th><th>期末(帳簿)</th><th>実残高</th><th>差異</th></tr>
        ${R.accounts.map((a) => `<tr><td>${esc(a.name)}</td><td>${yen(a.opening)}</td><td>${yen(a.in)}</td><td>${yen(a.out)}</td><td>${yen(a.closing)}</td><td>${yen(a.actual)}</td><td class="${a.diff ? 'warn' : ''}">${yen(a.diff)}</td></tr>`).join('')}
        <tr class="sum"><td>合計</td><td>${yen(R.opening)}</td><td>${yen(R.accounts.reduce((s, a) => s + a.in, 0))}</td><td>${yen(R.accounts.reduce((s, a) => s + a.out, 0))}</td><td>${yen(R.closing)}</td><td></td><td></td></tr></table></div>
      <div class="muted">※口座間移動は収支に含めず、残高にのみ反映しています。</div>
      <h3>月別収支</h3>
      <table><tr><th>月</th><th>収入</th><th>支出</th><th>収支</th></tr>
        ${R.months.map((m) => `<tr><td>${+m.ym.slice(5)}月</td><td>${yen(m.in)}</td><td>${yen(m.out)}</td><td>${yen(m.net)}</td></tr>`).join('')}
        <tr class="sum"><td>合計</td><td>${yen(R.totIn.cur)}</td><td>${yen(R.totOut.cur)}</td><td>${yen(R.net.cur)}</td></tr></table>
      <h3>科目別明細</h3>
      ${Object.keys(R.details).map((cat) => {
        const l = R.details[cat];
        const si = l.filter((e) => e.kind === 'in').reduce((s, e) => s + e.amount, 0), so = l.filter((e) => e.kind === 'out').reduce((s, e) => s + e.amount, 0);
        return `<details><summary><b>${esc(cat)}</b>　<span class="muted">${l.length}件　${si ? '収入 ' + yen(si) : ''}${so ? '　支出 ' + yen(so) : ''}</span></summary>
          <table>${l.map((e) => `<tr><td>${md(e.date)}</td><td style="text-align:left">${esc(e.desc)}</td><td>${e.kind === 'in' ? yen(e.amount) : ''}</td><td>${e.kind === 'out' ? yen(e.amount) : ''}</td></tr>`).join('')}</table></details>`;
      }).join('')}
    </div>`;
  }
  function vReport() {
    const R = C.buildReport(S, S.fy);
    const bal = R.accounts;
    return `<div class="card noprint">
      <h2>決算報告の資料を出力</h2>
      <button class="btn" data-act="xlsx">Excel（.xlsx）で出力</button>
      <button class="btn sub" data-act="print">印刷 / PDFにする</button>
      <h3>期末の実残高（通帳・お財布）</h3>
      <div class="muted">年度末の通帳残高などを入れると、帳簿との差異が報告書に載ります。</div>
      ${bal.map((a) => `<label class="f">${esc(a.name)}（帳簿 ${yen(a.closing)}）</label><input data-actual="${esc(a.name)}" inputmode="numeric" value="${a.actual == null ? '' : a.actual}" placeholder="未入力">`).join('')}
    </div>
    <div class="card">${reportHtml(R)}</div>`;
  }
  window.addEventListener('beforeprint', () => $$('details').forEach((d) => (d.open = true)));

  /* ---------- 設定 ---------- */
  function vSettings() {
    const fy = S.fy, op = S.openings[fy] || {};
    const priorCats = S.cats.filter((c) => c.t !== 'move');
    const pr = S.prior[fy - 1] || {};
    const hasPrevEntries = S.entries.some((e) => C.inFy(e, fy - 1));
    const used = new Set(S.entries.map((e) => e.cat));
    return `
    <div class="card"><h2>基本情報</h2>
      <label class="f">団体名</label><input data-set="org" value="${esc(S.org)}">
      <label class="f">会計担当（報告書に表示）</label><input data-set="treasurer" value="${esc(S.treasurer)}">
      <label class="f">ゆうちょ振込手数料の初期値（円）</label><input data-set="fee" inputmode="numeric" value="${S.fee}">
    </div>
    <div class="card"><h2>${fy}年度の期首残高</h2>
      <div class="muted">空欄の場合は前年度の期末残高を自動で引き継ぎます。</div>
      ${S.accounts.map((a) => `<label class="f">${esc(a)}</label><input data-open="${esc(a)}" inputmode="numeric" value="${op[a] != null && op[a] !== '' ? op[a] : ''}" placeholder="自動：${yen(C.openingOf(S, fy, a))}">`).join('')}
    </div>
    <div class="card"><h2>${fy - 1}年度の決算（前年度比較用）</h2>
      <div class="muted">${hasPrevEntries ? '前年度の明細が入っているため、そちらから自動計算されます。' : '前年度の科目別の決算額。報告書の「前年度」欄に使います。'}</div>
      ${hasPrevEntries ? '' : priorCats.map((c) => `<label class="f">${esc(c.n)}（${c.t === 'in' ? '収入' : '支出'}）</label><input data-prior="${esc(c.n)}" inputmode="numeric" value="${pr[c.n] != null && pr[c.n] !== '' ? pr[c.n] : ''}">`).join('')}
    </div>
    <div class="card"><h2>科目</h2>
      ${S.cats.map((c, i) => `<div class="kv"><span>${esc(c.n)} <span class="muted">${{ in: '収入', out: '支出', move: '移動' }[c.t]}</span></span>${used.has(c.n) ? '<span class="muted">使用中</span>' : `<button class="btn sm sub" data-act="delcat" data-i="${i}">削除</button>`}</div>`).join('')}
      <div class="row" style="margin-top:8px"><input id="nc-name" placeholder="新しい科目名"><select id="nc-type"><option value="out">支出</option><option value="in">収入</option></select></div>
      <button class="btn sub" data-act="addcat">科目を追加</button>
    </div>
    <div class="card"><h2>データの取り込み・バックアップ</h2>
      <div class="muted">データはこの端末のブラウザ内にだけ保存されます（サーバーには送りません）。機種変更やブラウザのデータ消去に備えて、定期的にバックアップを保存してください。</div>
      <button class="btn" data-act="backup">バックアップを保存（.json）</button>
      <button class="btn sub" data-act="pickjson">バックアップから復元</button>
      <button class="btn sub" data-act="pickxlsx">今のExcel（総勘定）から取り込み</button>
      <input type="file" id="file-json" accept=".json,application/json" hidden>
      <input type="file" id="file-xlsx" accept=".xlsx" hidden>
      <button class="btn del" data-act="wipe">すべてのデータを削除</button>
    </div>`;
  }

  /* ---------- クリック処理 ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]'); if (!t) return;
    const a = t.dataset.act, v = t.dataset.v;
    if (['type', 'cat', 'acct', 'today', 'yesterday'].includes(a)) syncForm();
    switch (a) {
      case 'type': ui.type = v; ui.cat = ''; render(); break;
      case 'cat': ui.cat = v; render(); break;
      case 'acct': ui.acct = v; render(); break;
      case 'today': ui.date = C.todayStr(); render(); break;
      case 'yesterday': { const d = new Date(); d.setDate(d.getDate() - 1); ui.date = d.getFullYear() + '-' + C.pad(d.getMonth() + 1) + '-' + C.pad(d.getDate()); render(); break; }
      case 'save': saveEntry(); break;
      case 'cancel': ui.edit = null; ui.amt = ui.desc = ui.note = ''; render(); break;
      case 'edit': startEdit(t.dataset.id); break;
      case 'delete':
        if (confirm('この明細を削除します。よろしいですか？')) {
          S.entries = S.entries.filter((x) => x.id !== ui.edit); ui.edit = null; ui.amt = ui.desc = ui.note = '';
          save(); toast('削除しました'); render();
        }
        break;
      case 'xlsx': exportXlsx().catch((err) => { console.error(err); toast('Excel出力に失敗しました'); }); break;
      case 'print': window.print(); break;
      case 'addcat': {
        const n = $('#nc-name').value.trim(); if (!n) return toast('科目名を入れてください');
        if (S.cats.some((c) => c.n === n)) return toast('同じ名前の科目があります');
        S.cats.push({ n, t: $('#nc-type').value }); save(); render(); break;
      }
      case 'delcat': S.cats.splice(+t.dataset.i, 1); save(); render(); break;
      case 'backup': saveFile(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }), `yasuragi-kaikei-backup-${C.todayStr()}.json`); break;
      case 'pickjson': $('#file-json').click(); break;
      case 'pickxlsx': $('#file-xlsx').click(); break;
      case 'wipe':
        if (confirm('保存されているデータをすべて削除します。元に戻せません。よろしいですか？') && confirm('本当に削除しますか？（バックアップは保存済みですか？）')) {
          S = C.defaultState(); save(); render(); toast('削除しました');
        }
        break;
    }
  });
  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.id === 'l-month') { ui.listMonth = t.value; render(); }
    else if (t.id === 'l-cat') { ui.listCat = t.value; render(); }
    else if (t.dataset.check) saveCheck(t.dataset.check);
    else if (t.dataset.checkdate) { if ($(`[data-check="${t.dataset.checkdate}"]`).value.trim()) saveCheck(t.dataset.checkdate); }
    else if (t.dataset.set) { S[t.dataset.set] = t.dataset.set === 'fee' ? parseAmt(t.value) : t.value.trim(); save(); toast('保存しました'); }
    else if (t.dataset.open != null) { (S.openings[S.fy] = S.openings[S.fy] || {})[t.dataset.open] = t.value.trim() === '' ? null : parseAmt(t.value); save(); render(); }
    else if (t.dataset.prior != null) { (S.prior[S.fy - 1] = S.prior[S.fy - 1] || {})[t.dataset.prior] = t.value.trim() === '' ? null : parseAmt(t.value); save(); toast('保存しました'); }
    else if (t.dataset.actual != null) { (S.actuals[S.fy] = S.actuals[S.fy] || {})[t.dataset.actual] = t.value.trim() === '' ? null : parseAmt(t.value); save(); render(); }
    else if (t.id === 'file-json' && t.files[0]) {
      try {
        const d = JSON.parse(await t.files[0].text());
        if (!Array.isArray(d.entries)) throw new Error('形式が違います');
        if (confirm(`バックアップ（${d.entries.length}件）で現在のデータを置き換えます。よろしいですか？`)) { S = Object.assign(C.defaultState(), d); save(); render(); toast('復元しました'); }
      } catch (err) { toast('読み込めませんでした：' + err.message); }
      t.value = '';
    } else if (t.id === 'file-xlsx' && t.files[0]) {
      try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await t.files[0].arrayBuffer());
        const r = C.importLegacy(wb, S);
        const msg = `${r.entries.length}件の明細を取り込みます。\n` + (S.entries.length ? `現在の${S.entries.length}件は置き換えられます。\n` : '') + (r.log.length ? `\n【自動で整えた内容】\n` + r.log.join('\n') : '');
        if (confirm(msg + '\nよろしいですか？')) {
          S.entries = r.entries;
          r.newCats.forEach((c) => S.cats.push(c));
          Object.keys(r.openings).forEach((k) => (S.openings[k] = Object.assign(S.openings[k] || {}, r.openings[k])));
          Object.keys(r.prior).forEach((k) => (S.prior[k] = r.prior[k]));
          Object.assign(S.checks, r.checks);
          S.fy = C.fyOf(r.entries[0].date); save(); render(); toast('取り込みました。期首残高などを設定で確認してください');
        }
      } catch (err) { console.error(err); toast('取り込めませんでした：' + err.message); }
      t.value = '';
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'l-q') { ui.q = e.target.value; clearTimeout(input.t); input.t = setTimeout(() => { render(); const q = $('#l-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 300); }
  });
  const input = {};

  /* ---------- ファイル保存 ---------- */
  async function saveFile(blob, name) {
    const f = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f], title: name }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  /* ---------- Excel 出力 ---------- */
  async function exportXlsx() {
    toast('Excelを作成中…');
    const R = C.buildReport(S, S.fy);
    const wb = new ExcelJS.Workbook();
    wb.creator = R.org; wb.created = new Date();
    const NUM = '#,##0;[Red]-#,##0', FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F1ED' } };
    const thin = { style: 'thin', color: { argb: 'FFBBBBBB' } };
    const box = (c) => (c.border = { top: thin, bottom: thin, left: thin, right: thin });
    const page = (ws) => { ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .5, right: .5, top: .6, bottom: .6, header: .3, footer: .3 } }; };
    const head = (ws, r, labels) => { labels.forEach((l, i) => { const c = ws.getCell(r, i + 1); c.value = l; c.font = { bold: true }; c.fill = FILL; c.alignment = { horizontal: 'center' }; box(c); }); };
    const asDate = (s) => new Date(s + 'T00:00:00Z');

    // 1. 収支計算書
    let ws = wb.addWorksheet('収支計算書'); page(ws);
    ws.columns = [{ width: 24 }, { width: 16 }, { width: 16 }, { width: 14 }];
    ws.mergeCells('A1:D1'); ws.getCell('A1').value = `${R.org}　${R.fy}年度 収支計算書`; ws.getCell('A1').font = { bold: true, size: 15 }; ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.mergeCells('A2:D2'); ws.getCell('A2').value = `${R.fy}年4月1日〜${R.fy + 1}年3月31日${R.treasurer ? '　会計担当：' + R.treasurer : ''}`; ws.getCell('A2').alignment = { horizontal: 'center' };
    head(ws, 4, ['科目', `${R.fy}年度`, `${R.fy - 1}年度`, '増減']);
    let r = 5;
    const sect = (label) => { ws.mergeCells(r, 1, r, 4); const c = ws.getCell(r, 1); c.value = label; c.font = { bold: true }; r++; };
    const catRows = (rows) => {
      const first = r;
      rows.forEach((x) => {
        ws.getCell(r, 1).value = x.cat; ws.getCell(r, 2).value = x.cur; ws.getCell(r, 3).value = x.prev;
        ws.getCell(r, 4).value = x.prev == null ? null : { formula: `B${r}-C${r}`, result: x.diff };
        for (let i = 1; i <= 4; i++) { box(ws.getCell(r, i)); if (i > 1) ws.getCell(r, i).numFmt = NUM; }
        r++;
      });
      return [first, r - 1];
    };
    const total = (label, [a, b], t) => {
      ws.getCell(r, 1).value = label;
      ws.getCell(r, 2).value = { formula: `SUM(B${a}:B${b})`, result: t.cur };
      ws.getCell(r, 3).value = t.prev == null ? null : { formula: `SUM(C${a}:C${b})`, result: t.prev };
      ws.getCell(r, 4).value = t.prev == null ? null : { formula: `B${r}-C${r}`, result: t.cur - t.prev };
      for (let i = 1; i <= 4; i++) { const c = ws.getCell(r, i); c.font = { bold: true }; c.fill = FILL; box(c); if (i > 1) c.numFmt = NUM; }
      return r++;
    };
    sect('【収入の部】'); const ri = catRows(R.incomeRows); const rIn = total('収入合計', ri, R.totIn);
    sect('【支出の部】'); const re = catRows(R.expenseRows); const rOut = total('支出合計', re, R.totOut);
    ws.getCell(r, 1).value = '当期収支差額'; ws.getCell(r, 2).value = { formula: `B${rIn}-B${rOut}`, result: R.net.cur };
    if (R.net.prev != null) ws.getCell(r, 3).value = { formula: `C${rIn}-C${rOut}`, result: R.net.prev };
    for (let i = 1; i <= 4; i++) { const c = ws.getCell(r, i); c.font = { bold: true }; box(c); c.numFmt = NUM; } const rNet = r++;
    ws.getCell(r, 1).value = '前期繰越金'; ws.getCell(r, 2).value = R.opening; for (let i = 1; i <= 4; i++) { box(ws.getCell(r, i)); ws.getCell(r, i).numFmt = NUM; } const rOpen = r++;
    ws.getCell(r, 1).value = '次期繰越金'; ws.getCell(r, 2).value = { formula: `B${rOpen}+B${rNet}`, result: R.closing };
    for (let i = 1; i <= 4; i++) { const c = ws.getCell(r, i); c.font = { bold: true }; c.fill = FILL; box(c); c.numFmt = NUM; }
    ws.getCell(r + 2, 1).value = '※口座間の資金移動は収支に含めていません。'; ws.getCell(r + 2, 1).font = { color: { argb: 'FF666666' }, size: 9 };

    // 2. 残高照合
    ws = wb.addWorksheet('預貯金・現金残高'); page(ws);
    ws.columns = [{ width: 16 }, ...Array(6).fill({ width: 15 })];
    ws.mergeCells('A1:G1'); ws.getCell('A1').value = `${R.fy}年度 預貯金・現金残高（${R.fy + 1}年3月31日現在）`; ws.getCell('A1').font = { bold: true, size: 14 };
    head(ws, 3, ['口座', '期首残高', '収入', '支出', '期末残高(帳簿)', '実残高', '差異']);
    R.accounts.forEach((a, i) => {
      const rr = 4 + i;
      ws.getCell(rr, 1).value = a.name; ws.getCell(rr, 2).value = a.opening; ws.getCell(rr, 3).value = a.in; ws.getCell(rr, 4).value = a.out;
      ws.getCell(rr, 5).value = { formula: `B${rr}+C${rr}-D${rr}`, result: a.closing };
      ws.getCell(rr, 6).value = a.actual;
      ws.getCell(rr, 7).value = a.actual == null ? null : { formula: `F${rr}-E${rr}`, result: a.diff };
      for (let c = 1; c <= 7; c++) { box(ws.getCell(rr, c)); if (c > 1) ws.getCell(rr, c).numFmt = NUM; }
    });
    const tr = 4 + R.accounts.length;
    ws.getCell(tr, 1).value = '合計';
    for (let c = 2; c <= 5; c++) { const L = 'ABCDEFG'[c - 1]; ws.getCell(tr, c).value = { formula: `SUM(${L}4:${L}${tr - 1})`, result: [0, R.opening, R.accounts.reduce((s, a) => s + a.in, 0), R.accounts.reduce((s, a) => s + a.out, 0), R.closing][c - 1] }; }
    for (let c = 1; c <= 7; c++) { const x = ws.getCell(tr, c); x.font = { bold: true }; x.fill = FILL; box(x); if (c > 1) x.numFmt = NUM; }

    // 3. 月別
    ws = wb.addWorksheet('月別収支'); page(ws);
    ws.columns = [{ width: 8 }, { width: 13 }, { width: 13 }, { width: 13 }, ...S.accounts.map(() => ({ width: 14 })), { width: 13 }, { width: 12 }, { width: 11 }];
    ws.getCell('A1').value = `${R.fy}年度 月別収支・現金チェック`; ws.getCell('A1').font = { bold: true, size: 14 };
    head(ws, 3, ['月', '収入', '支出', '収支', ...S.accounts.map((a) => a + ' 月末残高'), 'お財布金額', 'チェック日', '差異']);
    R.months.forEach((m, i) => {
      const rr = 4 + i, cashIdx = S.accounts.indexOf('現金');
      ws.getCell(rr, 1).value = +m.ym.slice(5) + '月'; ws.getCell(rr, 2).value = m.in; ws.getCell(rr, 3).value = m.out;
      ws.getCell(rr, 4).value = { formula: `B${rr}-C${rr}`, result: m.net };
      S.accounts.forEach((a, k) => (ws.getCell(rr, 5 + k).value = m.bal[a]));
      const base = 5 + S.accounts.length;
      if (m.check) {
        ws.getCell(rr, base).value = m.check.amount; ws.getCell(rr, base + 1).value = asDate(m.check.date); ws.getCell(rr, base + 1).numFmt = 'yyyy/mm/dd';
        if (cashIdx >= 0) ws.getCell(rr, base + 2).value = { formula: `${ws.getCell(rr, base).address}-${ws.getCell(rr, 5 + cashIdx).address}`, result: m.check.amount - m.bal['現金'] };
      }
      for (let c = 1; c <= base + 2; c++) { box(ws.getCell(rr, c)); if (c !== 1 && c !== base + 1) ws.getCell(rr, c).numFmt = NUM; }
    });
    const mr = 16; ws.getCell(mr, 1).value = '合計';
    ['B', 'C', 'D'].forEach((L) => (ws.getCell(`${L}${mr}`).value = { formula: `SUM(${L}4:${L}15)`, result: { B: R.totIn.cur, C: R.totOut.cur, D: R.net.cur }[L] }));
    for (let c = 1; c <= 4; c++) { const x = ws.getCell(mr, c); x.font = { bold: true }; x.fill = FILL; box(x); if (c > 1) x.numFmt = NUM; }

    // 4. 科目別明細
    ws = wb.addWorksheet('科目別明細'); page(ws);
    ws.columns = [{ width: 12 }, { width: 44 }, { width: 13 }, { width: 13 }, { width: 14 }, { width: 28 }];
    ws.getCell('A1').value = `${R.fy}年度 科目別明細`; ws.getCell('A1').font = { bold: true, size: 14 };
    let q = 3;
    Object.keys(R.details).forEach((cat) => {
      const l = R.details[cat];
      ws.getCell(q, 1).value = '■ ' + cat; ws.getCell(q, 1).font = { bold: true, size: 12 }; q++;
      head(ws, q++, ['日付', '摘要', '収入', '支出', '口座', 'メモ']);
      const first = q;
      l.forEach((e) => {
        ws.getCell(q, 1).value = asDate(e.date); ws.getCell(q, 1).numFmt = 'yyyy/mm/dd';
        ws.getCell(q, 2).value = e.desc; ws.getCell(q, 3).value = e.kind === 'in' ? e.amount : null; ws.getCell(q, 4).value = e.kind === 'out' ? e.amount : null;
        ws.getCell(q, 5).value = e.acct; ws.getCell(q, 6).value = e.note;
        for (let c = 1; c <= 6; c++) { box(ws.getCell(q, c)); if (c === 3 || c === 4) ws.getCell(q, c).numFmt = NUM; }
        q++;
      });
      ws.getCell(q, 2).value = '小計';
      ws.getCell(q, 3).value = { formula: `SUM(C${first}:C${q - 1})`, result: l.filter((e) => e.kind === 'in').reduce((s, e) => s + e.amount, 0) };
      ws.getCell(q, 4).value = { formula: `SUM(D${first}:D${q - 1})`, result: l.filter((e) => e.kind === 'out').reduce((s, e) => s + e.amount, 0) };
      for (let c = 1; c <= 6; c++) { const x = ws.getCell(q, c); x.font = { bold: true }; x.fill = FILL; box(x); if (c === 3 || c === 4) x.numFmt = NUM; }
      q += 2;
    });

    // 5. 総勘定
    ws = wb.addWorksheet('総勘定'); page(ws);
    ws.columns = [{ width: 12 }, { width: 14 }, { width: 44 }, { width: 13 }, { width: 13 }, { width: 14 }, { width: 28 }];
    head(ws, 1, ['日付', '科目', '摘要', '収入', '支出', '入出金口座', 'メモ']);
    R.ledger.forEach((e, i) => {
      const rr = 2 + i;
      ws.getCell(rr, 1).value = asDate(e.date); ws.getCell(rr, 1).numFmt = 'yyyy/mm/dd';
      ws.getCell(rr, 2).value = e.cat; ws.getCell(rr, 3).value = e.desc;
      ws.getCell(rr, 4).value = e.kind === 'in' ? e.amount : null; ws.getCell(rr, 5).value = e.kind === 'out' ? e.amount : null;
      ws.getCell(rr, 6).value = e.acct; ws.getCell(rr, 7).value = e.note;
      for (let c = 1; c <= 7; c++) { box(ws.getCell(rr, c)); if (c === 4 || c === 5) ws.getCell(rr, c).numFmt = NUM; }
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const buf = await wb.xlsx.writeBuffer();
    await saveFile(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `yasuragi-kaikei-houkoku-${R.fy}.xlsx`);
  }

  /* ---------- 起動 ---------- */
  render();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.__app = { get S() { return S; }, render, exportXlsx };
})();
