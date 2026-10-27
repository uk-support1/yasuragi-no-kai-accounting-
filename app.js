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
      if (raw) return C.migrate(Object.assign(base, JSON.parse(raw)));
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
  const ui = { rtab: 'main', type: 'out', cat: '', acct: '現金', from: '現金', to: '普通口座', date: C.todayStr(), amt: '', desc: '', note: '', fee: null, edit: null, listMonth: 'all', listCat: '', q: '' };

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

  /* ---------- 総会資料 ---------- */
  const fmtN = (n) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('ja-JP');
  function paperHtml(p) {
    const warn = p.warn.length ? `<div class="warnbox noprint">${p.warn.map((w) => '⚠ ' + esc(w)).join('<br>')}</div>` : '';
    const blocks = p.blocks.map((b) => {
      if (b.type === 'text') {
        return b.text ? `<p class="t" style="text-align:${b.align || 'left'}">${esc(b.text)}</p>` : '<p class="t">&nbsp;</p>';
      }
      const head = b.noHead ? '' : `<thead><tr>${b.cols.map((c) => `<th>${esc(c.h)}</th>`).join('')}</tr></thead>`;
      const rows = b.rows.map((r) => `<tr class="${r.b ? 'b' : ''} ${r.shade ? 'shade' : ''}">${r.c.map((v) =>
        v == null || v === '' ? '<td></td>' : typeof v === 'number' ? `<td class="n">${fmtN(v)}</td>` : `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
      return `${b.caption ? `<div class="cap">${esc(b.caption)}</div>` : ''}<div class="scroll ${b.cols.length >= 5 ? 'wide' : ''}"><table>${head}<tbody>${rows}</tbody></table></div>`;
    }).join('');
    return `<section class="paper" id="paper-${p.key}">
      <div class="ptools noprint"><button class="btn sm sub" data-act="copy" data-key="${p.key}">Word用にコピー</button></div>
      ${warn}<h1>${esc(p.title)}</h1>${p.sub ? `<div class="psub">${esc(p.sub)}</div>` : ''}${blocks}</section>`;
  }
  function vReport() {
    const P = Papers.build(S, S.fy);
    const nav = `<div class="seg noprint" style="margin-bottom:12px">${[['main', '総会資料'], ['prep', '準備入力'], ['detail', '内訳・照合']].map(([k, l]) => `<button data-act="rtab" data-v="${k}" class="${ui.rtab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    if (ui.rtab === 'prep') return nav + vPrep();
    const list = ui.rtab === 'detail' ? P.detail : P.main;
    const intro = ui.rtab === 'detail'
      ? ''
      : `<div class="card noprint"><h2>${S.fy}年度 総会資料</h2>
          <div class="muted">決算報告・会計監査報告・来年度予算案・市補助金実績報告を、入力済みの明細から自動で作ります。予算額・備考・日付は「準備入力」で入れます。</div>
          <button class="btn" data-act="xlsx">Excel（.xlsx）で全部出力</button>
          <button class="btn sub" data-act="print">印刷 / PDFにする</button>
          <div class="muted" style="margin-top:8px">各書類の「Word用にコピー」で、議案書（Word）に表を貼り付けられます。</div></div>`;
    return nav + intro + list.map(paperHtml).join('');
  }
  window.addEventListener('beforeprint', () => $$('details').forEach((d) => (d.open = true)));

  function copyPaper(key) {
    const el = $('#paper-' + key); if (!el) return;
    const clone = el.cloneNode(true);
    $$('.noprint', clone).forEach((n) => n.remove());
    clone.style.cssText = 'position:fixed;left:-9999px;top:0;background:#fff';
    document.body.appendChild(clone);
    const rg = document.createRange(); rg.selectNodeContents(clone);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg);
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
    sel.removeAllRanges(); clone.remove();
    toast(ok ? 'コピーしました。Wordに貼り付けてください' : 'コピーできませんでした');
  }

  /* ---------- 準備入力（予算・備考・日付・実残高） ---------- */
  function vPrep() {
    const fy = S.fy, yr = S.yearly[fy] || {};
    const lt = C.lineTotals(S, fy);
    const lines = [...C.lineNames(S, 'in').map((l) => ({ l, k: 'in' })), ...C.lineNames(S, 'out').map((l) => ({ l, k: 'out' }))];
    const bal = C.balances(S, fy).filter((b) => b.opening || b.in || b.out);
    return `
    <div class="card"><h2>日付</h2>
      <label class="f">会計監査を行った日</label><input type="date" data-yearly="auditDate" value="${esc(yr.auditDate || '')}">
      <label class="f">総会の開催日</label><input type="date" data-yearly="assemblyDate" value="${esc(yr.assemblyDate || '')}">
      <div class="muted" style="margin-top:6px">会計監査報告に使います。監事のお名前・会長名などは「設定」で入れます。</div>
    </div>
    <div class="card"><h2>期末の実残高（通帳・お財布）</h2>
      <div class="muted">年度末の通帳残高などを入れると「内訳・照合」で帳簿との差が分かります。</div>
      ${bal.map((a) => `<label class="f">${esc(a.name)}（帳簿 ${yen(a.closing)}）</label><input data-actual="${esc(a.name)}" inputmode="numeric" value="${a.actual == null ? '' : a.actual}" placeholder="未入力">`).join('')}
    </div>
    <div class="card muted">科目ごとに、今年度の予算額・決算の備考・来年度の予算額と摘要を入れます。備考は入力した明細から自動で下書きされます（直すとその内容が使われます）。来年度の予算額は、未入力なら今年度の予算額と同じ扱いです。</div>
    ${lines.map(({ l, k }) => {
      const b1 = S.budgets[fy] && S.budgets[fy][l] != null ? S.budgets[fy][l] : '';
      const b2 = S.budgets[fy + 1] && S.budgets[fy + 1][l] != null ? S.budgets[fy + 1][l] : '';
      const ph2 = C.nextBudget(S, fy, l);
      const n2 = S.notes[fy + 1] && S.notes[fy + 1][l] != null ? S.notes[fy + 1][l] : '';
      return `<div class="card"><div class="kv"><b>${esc(l)} <span class="muted">${k === 'in' ? '収入' : '支出'}</span></b><span class="muted">今年度 ${yen(lt[k][l] || 0)}円</span></div>
        <div class="two"><div><label class="f">今年度の予算額</label><input data-bud="${esc(l)}" inputmode="numeric" value="${b1}"></div>
        <div><label class="f">${fy + 1}年度の予算額</label><input data-bud2="${esc(l)}" inputmode="numeric" value="${b2}" placeholder="${ph2 == null ? '' : ph2}"></div></div>
        <label class="f">決算の備考</label><input data-rem="${esc(l)}" value="${esc(C.remarkOf(S, fy, l))}">
        <label class="f">${fy + 1}年度予算の摘要</label><input data-note2="${esc(l)}" value="${esc(n2)}" placeholder="${esc(C.nextNote(S, fy, l))}"></div>`;
    }).join('')}`;
  }

  /* ---------- 設定 ---------- */
  function vSettings() {
    const fy = S.fy, op = S.openings[fy] || {}, ex = S.excess[fy] || {}, info = S.info;
    const priorCats = S.cats.filter((c) => c.t !== 'move');
    const pr = S.prior[fy - 1] || {};
    const hasPrevEntries = S.entries.some((e) => C.inFy(e, fy - 1));
    const used = new Set(S.entries.map((e) => e.cat));
    const ii = (k, label, ph) => `<label class="f">${label}</label><input data-info="${k}" value="${esc(info[k] || '')}" ${ph ? `placeholder="${esc(ph)}"` : ''}>`;
    return `
    <div class="card"><h2>団体情報（総会資料・市補助金に使います）</h2>
      <label class="f">団体名</label><input data-set="org" value="${esc(S.org)}">
      ${ii('president', '会長のお名前')}${ii('signTitle', '決算報告の署名の肩書き', '例：会長兼会計')}
      ${ii('auditor1', '会計監事（1人目）')}${ii('auditor2', '会計監事（2人目）')}
      ${ii('address', '事務所所在地')}${ii('members', '構成人員', '例：27名')}
      ${ii('assemblyCount', '総会の回数', '例：1回')}${ii('regularCount', '定例会の回数', '例：10回')}${ii('attendees', '延べ出席人数', '例：90名')}
      ${ii('schedule', '開催日', '例：奇数月第2金曜日・偶数月第2日曜日')}${ii('bulletin', '会報', '例：毎月1回発行')}${ii('activities', '活動内容')}
      <label class="f">会費の単価（円・備考の「○名分」の自動計算に使います）</label><input data-set="feeUnit" inputmode="numeric" value="${S.feeUnit}">
      <label class="f">ゆうちょ振込手数料の初期値（円）</label><input data-set="fee" inputmode="numeric" value="${S.fee}">
    </div>
    <div class="card"><h2>${fy}年度の期首残高</h2>
      <div class="muted">空欄の場合は前年度の期末残高を自動で引き継ぎます。「繰越に含めない金額」は、不明金・預り金など、繰越金に入れずに別に管理している額です（前年度の設定を引き継ぎます）。</div>
      ${S.accounts.map((a) => `<label class="f">${esc(a)}${C.isReserveAcct(S, a) ? '（積立）' : ''}</label>
        <div class="two"><input data-open="${esc(a)}" inputmode="numeric" value="${op[a] != null && op[a] !== '' ? op[a] : ''}" placeholder="自動：${yen(C.openingOf(S, fy, a))}">
        <input data-excess="${esc(a)}" inputmode="numeric" value="${ex[a] != null && ex[a] !== '' ? ex[a] : ''}" placeholder="繰越に含めない：${yen(C.excessOf(S, fy, a))}"></div>`).join('')}
      <h3>積立口座（一般会計と別に決算する口座）</h3>
      ${S.accounts.map((a) => `<label class="row" style="margin:4px 0"><input type="checkbox" data-reserve="${esc(a)}" ${C.isReserveAcct(S, a) ? 'checked' : ''}><span>${esc(a)}</span></label>`).join('')}
    </div>
    <div class="card"><h2>${fy - 1}年度の決算（前年度比較用）</h2>
      <div class="muted">${hasPrevEntries ? '前年度の明細が入っているため、そちらから自動計算されます。' : '前年度の科目別の決算額。「内訳・照合」の前年度比較に使います。'}</div>
      ${hasPrevEntries ? '' : priorCats.map((c) => `<label class="f">${esc(c.n)}（${c.t === 'in' ? '収入' : '支出'}）</label><input data-prior="${esc(c.n)}" inputmode="numeric" value="${pr[c.n] != null && pr[c.n] !== '' ? pr[c.n] : ''}">`).join('')}
    </div>
    <div class="card"><h2>科目</h2>
      <div class="muted">「総会資料での科目名」を同じにすると、1行にまとめて表示します（例：交際費と慶弔費→交際・慶弔費）。「市補助金の区分」は市補助金の実績報告の振り分けです。</div>
      ${S.cats.map((c, i) => `<div style="border-top:1px solid var(--ln);padding:8px 0">
        <div class="kv"><span><b>${esc(c.n)}</b> <span class="muted">${{ in: '収入', out: '支出', move: '移動' }[c.t]}</span></span>${used.has(c.n) ? '<span class="muted">使用中</span>' : `<button class="btn sm sub" data-act="delcat" data-i="${i}">削除</button>`}</div>
        ${c.t === 'move' ? '' : `<div class="two"><input data-catline="${i}" value="${esc(c.line || '')}" placeholder="総会資料での科目名：${esc(c.n)}">
        ${c.t === 'out' ? `<select data-catsub="${i}">${C.SUBS.map((s) => `<option ${((c.sub && C.SUBS.includes(c.sub)) ? c.sub : 'その他') === s ? 'selected' : ''}>${s}</option>`).join('')}</select>` : '<span></span>'}</div>`}
        ${c.t === 'out' ? `<label class="f">総会資料で収入から差し引く先（売上−経費の差引表示）</label><select data-catnet="${i}"><option value="">差し引かない（支出として表示）</option>${C.lineNames(S, 'in').map((l) => `<option ${c.net === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}</div>`).join('')}
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
      case 'rtab': ui.rtab = v; render(); window.scrollTo(0, 0); break;
      case 'copy': copyPaper(t.dataset.key); break;
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
    else if (t.dataset.info) { S.info[t.dataset.info] = t.value.trim(); save(); toast('保存しました'); }
    else if (t.dataset.yearly) { (S.yearly[S.fy] = S.yearly[S.fy] || {})[t.dataset.yearly] = t.value; save(); toast('保存しました'); }
    else if (t.dataset.excess != null) { (S.excess[S.fy] = S.excess[S.fy] || {})[t.dataset.excess] = t.value.trim() === '' ? null : parseAmt(t.value); save(); render(); }
    else if (t.dataset.reserve != null) { const a = t.dataset.reserve; S.reserve = S.reserve.filter((x) => x !== a); if (t.checked) S.reserve.push(a); save(); render(); }
    else if (t.dataset.catline != null) { const c = S.cats[+t.dataset.catline], v = t.value.trim(); if (v && v !== c.n) c.line = v; else delete c.line; save(); toast('保存しました'); }
    else if (t.dataset.catnet != null) { const c = S.cats[+t.dataset.catnet]; if (t.value) c.net = t.value; else delete c.net; save(); toast('保存しました'); }
    else if (t.dataset.catsub != null) { S.cats[+t.dataset.catsub].sub = t.value; save(); toast('保存しました'); }
    else if (t.dataset.bud != null) { setMap(S.budgets, S.fy, t.dataset.bud, t.value.trim() === '' ? undefined : parseAmt(t.value)); save(); toast('保存しました'); }
    else if (t.dataset.bud2 != null) { setMap(S.budgets, S.fy + 1, t.dataset.bud2, t.value.trim() === '' ? undefined : parseAmt(t.value)); save(); toast('保存しました'); }
    else if (t.dataset.rem != null) { const line = t.dataset.rem; if (t.value === C.autoRemark(S, S.fy, line)) setMap(S.remarks, S.fy, line, undefined); else setMap(S.remarks, S.fy, line, t.value); save(); toast('保存しました'); }
    else if (t.dataset.note2 != null) { setMap(S.notes, S.fy + 1, t.dataset.note2, t.value); save(); toast('保存しました'); }
    else if (t.dataset.set) { S[t.dataset.set] = t.dataset.set === 'fee' ? parseAmt(t.value) : t.value.trim(); save(); toast('保存しました'); }
    else if (t.dataset.open != null) { (S.openings[S.fy] = S.openings[S.fy] || {})[t.dataset.open] = t.value.trim() === '' ? null : parseAmt(t.value); save(); render(); }
    else if (t.dataset.prior != null) { (S.prior[S.fy - 1] = S.prior[S.fy - 1] || {})[t.dataset.prior] = t.value.trim() === '' ? null : parseAmt(t.value); save(); toast('保存しました'); }
    else if (t.dataset.actual != null) { (S.actuals[S.fy] = S.actuals[S.fy] || {})[t.dataset.actual] = t.value.trim() === '' ? null : parseAmt(t.value); save(); render(); }
    else if (t.id === 'file-json' && t.files[0]) {
      try {
        const d = JSON.parse(await t.files[0].text());
        if (!Array.isArray(d.entries)) throw new Error('形式が違います');
        if (confirm(`バックアップ（${d.entries.length}件）で現在のデータを置き換えます。よろしいですか？`)) { S = C.migrate(Object.assign(C.defaultState(), d)); save(); render(); toast('復元しました'); }
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
          Object.keys(r.excess).forEach((k) => (S.excess[k] = Object.assign(S.excess[k] || {}, r.excess[k])));
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
  function setMap(obj, fy, key, val) { const m = (obj[fy] = obj[fy] || {}); if (val === undefined) delete m[key]; else m[key] = val; }

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

  /* ---------- Excel 出力（書類データから共通生成） ---------- */
  function addSheet(wb, p) {
    const NUM = '#,##0;[Red]-#,##0';
    const FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    const SHADE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    const thin = { style: 'thin', color: { argb: 'FF666666' } };
    const box = (c) => (c.border = { top: thin, bottom: thin, left: thin, right: thin });
    const ws = wb.addWorksheet(p.sheet);
    ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .5, right: .5, top: .6, bottom: .6, header: .3, footer: .3 } };
    ws.columns = p.widths.map((w) => ({ width: w }));
    const nc = p.widths.length, totalW = p.widths.reduce((a, b) => a + b, 0);
    let r = 1;
    const merged = (text, o) => {
      ws.mergeCells(r, 1, r, nc);
      const c = ws.getCell(r, 1); c.value = text;
      c.font = { bold: !!o.bold, size: o.size || 11 };
      c.alignment = { horizontal: o.align || 'left', vertical: 'top', wrapText: true };
      const lines = Math.max(1, Math.ceil((text.length * 2) / totalW));
      ws.getRow(r).height = Math.max(16, lines * (o.size || 11) * 1.5);
      r++;
    };
    merged(p.title, { bold: true, size: 14, align: 'center' });
    if (p.sub) merged(p.sub, { size: 10, align: 'center' });
    r++;
    for (const b of p.blocks) {
      if (b.type === 'text') {
        if (!b.text) { r++; continue; }
        merged(b.text, { size: b.size, align: b.align });
        continue;
      }
      if (b.caption) { ws.getCell(r, 1).value = b.caption; ws.getCell(r, 1).font = { bold: true }; r++; }
      if (!b.noHead) {
        b.cols.forEach((c, i) => { const x = ws.getCell(r, i + 1); x.value = c.h; x.font = { bold: true }; x.fill = FILL; x.alignment = { horizontal: 'center', vertical: 'middle' }; box(x); });
        r++;
      }
      for (const row of b.rows) {
        row.c.forEach((v, i) => {
          const x = ws.getCell(r, i + 1);
          x.value = v == null || v === '' ? null : v;
          if (typeof v === 'number') { x.numFmt = NUM; x.alignment = { horizontal: 'right', vertical: 'top' }; }
          else x.alignment = { vertical: 'top', wrapText: true };
          if (row.b) x.font = { bold: true };
          if (row.shade) x.fill = SHADE;
          box(x);
        });
        r++;
      }
      r++;
    }
    return ws;
  }
  async function exportXlsx() {
    toast('Excelを作成中…');
    const P = Papers.build(S, S.fy);
    const wb = new ExcelJS.Workbook();
    wb.creator = S.org; wb.created = new Date();
    [...P.main, ...P.detail].forEach((p) => addSheet(wb, p));
    wb.getWorksheet('総勘定').views = [{ state: 'frozen', ySplit: 3 }];
    const buf = await wb.xlsx.writeBuffer();
    await saveFile(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `yasuragi-kaikei-${S.fy}.xlsx`);
  }

  /* ---------- 起動 ---------- */
  render();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.__app = { get S() { return S; }, render, exportXlsx };
})();
