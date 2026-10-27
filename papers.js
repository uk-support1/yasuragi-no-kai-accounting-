/* 総会資料などの「書類」データを作る（画面・Excel出力で共通。画面に依存しない） */
(function (root) {
  'use strict';
  const C = root.Core || require('./core.js');
  const era = (fy) => fy - 2018; // 令和

  function rdate(s) {
    if (!s) return '令和　年　月　日';
    const [y, m, d] = s.split('-').map(Number);
    return `令和${y - 2018}年${m}月${d}日`;
  }
  const slash = (d) => d.replace(/-/g, '/');
  const pos = (n) => (n > 0 ? n : 0);

  /* paper = { key, sheet, title, sub, widths:[文字数], blocks:[ {type:'table', caption, cols:[{h,n}], rows:[{c:[], b, shade}], noHead} | {type:'text', text, align, size} ], warn:[] }
     行の値：数値は金額、文字列は文章、null は空欄 */
  function build(S, fy) {
    const r = era(fy), info = S.info || {}, yr = (S.yearly && S.yearly[fy]) || {};
    const st = C.settlement(S, fy), bp = C.budgetPlan(S, fy), sb = C.subsidy(S, fy), R = C.buildReport(S, fy);
    const dInc = (b, a) => (b == null ? null : a - b);
    const dExp = (b, a) => (b == null ? null : b - a);
    const noBudget = !S.budgets[fy] || !Object.keys(S.budgets[fy]).some((k) => S.budgets[fy][k] !== '' && S.budgets[fy][k] != null);

    /* 1. 決算報告（第2号議案） */
    const settle = {
      key: 'settle', sheet: '決算報告', widths: [22, 14, 14, 14, 44],
      title: `第2号議案　${fy}年度（令和${r}）　${S.org}　収支決算報告`,
      sub: `（令和${r}年4月1日〜令和${r + 1}年3月31日）　（単位：円）`,
      warn: [],
      blocks: [
        { type: 'table', caption: '収入の部', cols: [{ h: '科目' }, { h: '予算額', n: 1 }, { h: '決算額', n: 1 }, { h: '比較増減', n: 1 }, { h: '備考' }],
          rows: [
            ...st.inc.map((x) => ({ c: [x.line, x.budget, x.actual, dInc(x.budget, x.actual), x.remark] })),
            { c: ['小計', st.incSub.budget, st.incSub.actual, st.incSub.actual - st.incSub.budget, '当年度の収入計'], b: 1 },
            { c: ['前年度より繰越', st.opening, st.opening, 0, ''] },
            { c: ['収入合計', st.incTotal.budget, st.incTotal.actual, st.incTotal.actual - st.incTotal.budget, ''], b: 1, shade: 1 },
          ] },
        { type: 'table', caption: '支出の部', cols: [{ h: '科目' }, { h: '予算額', n: 1 }, { h: '決算額', n: 1 }, { h: '比較増減', n: 1 }, { h: '備考' }],
          rows: [
            ...st.exp.map((x) => ({ c: [x.line, x.budget, x.actual, dExp(x.budget, x.actual), x.remark] })),
            { c: ['小計', st.expSub.budget, st.expSub.actual, st.expSub.budget - st.expSub.actual, '当年度の支出計'], b: 1 },
            { c: ['次年度へ繰越', st.next.budget, st.next.actual, st.next.budget - st.next.actual, ''] },
            { c: ['支出合計', st.expTotal.budget, st.expTotal.actual, st.expTotal.budget - st.expTotal.actual, ''], b: 1, shade: 1 },
          ] },
        { type: 'table', cols: [{ h: '残高（次年度への繰越）' }, { h: '決算額', n: 1 }],
          rows: [
            ...st.accounts.map((a) => ({ c: [a.name + (a.excess ? `（過剰分${a.excess.toLocaleString('ja-JP')}円を除く）` : ''), a.amount] })),
            { c: ['次年度への繰越', st.next.actual], b: 1 },
          ] },
        ...(st.reserve.has && (st.reserve.opening || st.reserve.closing) ? [{
          type: 'table', cols: [{ h: '積立口座決算' }, { h: '金額', n: 1 }],
          rows: [
            { c: [`令和${r}年度期初残高`, st.reserve.opening] },
            { c: ['一般会計に繰り出し', st.reserve.fromReserve] },
            ...(st.reserve.toReserve ? [{ c: ['一般会計から繰入', st.reserve.toReserve] }] : []),
            { c: ['預金利息', st.reserve.interest] },
            ...(st.reserve.otherOut ? [{ c: ['その他の支出', st.reserve.otherOut] }] : []),
            { c: [`令和${r}年度期末残高`, st.reserve.closing], b: 1 },
          ] }] : []),
        { type: 'text', text: '上記のとおりご報告いたします。', size: 11 },
        { type: 'text', text: `${S.org}${info.signTitle || ''}　${info.president || ''}`, align: 'right', size: 11 },
      ],
    };
    if (st.gap) settle.warn.push(`収入合計と支出合計が ${st.gap.toLocaleString('ja-JP')}円 ずれています。口座の期首残高・「繰越に含めない金額」・明細を確認してください。`);
    if (noBudget) settle.warn.push('今年度の予算額が未入力です（「準備」で入力すると、予算額と比較増減が入ります）。');

    /* 2. 会計監査報告 */
    const audit = {
      key: 'audit', sheet: '会計監査報告', widths: [70],
      title: `令和${r}年度　会計監査報告`, sub: '', warn: [],
      blocks: [
        { type: 'text', text: '', size: 11 },
        { type: 'text', text: `　${rdate(yr.auditDate)}、令和${r}年度${S.org}会計を監査した結果、収入・支出並びに帳簿、領収書等が適切に処理されていることを認め、ここにご報告いたします。`, size: 11 },
        { type: 'text', text: '', size: 11 },
        { type: 'text', text: rdate(yr.assemblyDate), align: 'right', size: 11 },
        { type: 'text', text: `会計監事　　${info.auditor1 || '　　　　　　'}`, align: 'right', size: 11 },
        { type: 'text', text: `会計監事　　${info.auditor2 || '　　　　　　'}`, align: 'right', size: 11 },
      ],
    };
    if (!yr.auditDate || !yr.assemblyDate || !info.auditor1) audit.warn.push('監査日・総会の日付・監事のお名前が未入力の部分は空欄で出ます（「準備」「設定」で入力できます）。');

    /* 3. 予算案（第4号議案） */
    const budget = {
      key: 'budget', sheet: '予算案', widths: [22, 14, 56],
      title: `第4号議案　令和${r + 1}年度（${fy + 1}年度）　${S.org}　収支予算（案）`,
      sub: `【令和${r + 1}年4月1日〜令和${r + 2}年3月31日】　（単位：円）`, warn: [],
      blocks: [
        { type: 'table', caption: '収入の部', cols: [{ h: '科目' }, { h: '予算額', n: 1 }, { h: '摘要' }],
          rows: [
            ...bp.inc.map((x) => ({ c: [x.line, x.budget == null ? 0 : x.budget, x.note] })),
            { c: ['小計', bp.incSub, '当年度の収入計'], b: 1 },
            { c: ['前年度より繰越', bp.carry, ''] },
            { c: ['収入合計', bp.incTotal, ''], b: 1, shade: 1 },
          ] },
        { type: 'table', caption: '支出の部', cols: [{ h: '科目' }, { h: '予算額', n: 1 }, { h: '摘要' }],
          rows: [
            ...bp.exp.map((x) => ({ c: [x.line, x.budget == null ? 0 : x.budget, x.note] })),
            { c: ['小計', bp.expSub, '当年度の支出計'], b: 1 },
            { c: ['次年度への繰越', bp.next, ''] },
            { c: ['支出合計', bp.expTotal, ''], b: 1, shade: 1 },
          ] },
        { type: 'text', text: `令和${r + 1}年度収支予算について上記の通り提案します。`, size: 11 },
        { type: 'text', text: `${S.org}会長　${info.president || ''}`, align: 'right', size: 11 },
      ],
    };
    if (bp.next < 0) budget.warn.push('次年度への繰越がマイナスです（支出予算が収入予算を上回っています）。');
    if (!bp.inc.some((x) => x.budget)) budget.warn.push('来年度の予算額が未入力です（「準備」で入力してください。今年度の予算額を初期値に使います）。');

    /* 4. 市補助金 実績報告 */
    const nm = (k) => sb.names[k].join('・');
    const subsidyP = {
      key: 'subsidy', sheet: '市補助金実績報告', widths: [26, 16, 46],
      title: '市補助金用　実績報告', sub: `${fy}年度（令和${r}年4月1日〜令和${r + 1}年3月31日）　（単位：円）`, warn: [],
      blocks: [
        { type: 'table', cols: [{ h: '区分' }, { h: '金額（円）', n: 1 }, { h: '備考' }],
          rows: [
            { c: ['年間収入額A', sb.A, ''], b: 1 }, { c: ['国補助等額', sb.national, ''] }, { c: ['県補助等額', sb.prefecture, ''] },
            { c: ['市補助等額', sb.city, '（市・社協の内訳を入力）'] }, { c: ['会費等自主財源', sb.self, sb.selfNote] },
            { c: ['前年度繰越金', sb.carryIn, ''] }, { c: ['その他の収入', sb.other, ''] },
          ] },
        { type: 'table', cols: [{ h: '区分' }, { h: '金額（円）', n: 1 }, { h: '備考' }],
          rows: [
            { c: ['年間支出額B', sb.B, ''], b: 1 }, { c: ['補助等対象事業費', sb.target, ''] },
            { c: ['事務費（経常）', sb.sub['事務費'], nm('事務費')] }, { c: ['事務費（臨時）', 0, ''] },
            { c: ['事業費（経常）', sb.sub['事業費'], nm('事業費')] }, { c: ['事業費（臨時）', 0, ''] },
            { c: ['その他の支出', sb.sub['その他'], nm('その他')] }, { c: ['補助等対象外事業費', sb.sub['対象外'], nm('対象外')] },
          ] },
        { type: 'table', cols: [{ h: '項目' }, { h: '金額（円）', n: 1 }],
          rows: [{ c: ['翌年度への繰越額', sb.next] }, { c: ['補助金等返納額', 0] }] },
        { type: 'table', cols: [{ h: '項目' }, { h: '内容' }],
          rows: [
            { c: ['団体名', S.org] }, { c: ['事務所所在地', info.address || ''] },
            { c: ['代表者', info.president ? `会長 ${info.president}` : ''] }, { c: ['構成人員', info.members || ''] },
          ] },
        { type: 'table', cols: [{ h: '項目' }, { h: '内容' }],
          rows: [
            { c: ['総会', info.assemblyCount || ''] }, { c: ['定例会', info.regularCount || ''] }, { c: ['延べ出席人数', info.attendees || ''] },
            { c: ['開催日', info.schedule || ''] }, { c: ['会報', info.bulletin || ''] }, { c: ['活動内容', info.activities || ''] },
          ] },
      ],
    };
    subsidyP.warn.push('区分の振り分けは「設定 → 科目」で変えられます。交通費を事務費にするか事業費にするかなど、提出先の指示に合わせて確認してください。');

    /* 内訳・照合 */
    const compare = {
      key: 'compare', sheet: '前年度比較', widths: [24, 16, 16, 14],
      title: `${fy}年度 収支計算書（前年度比較）`, sub: `${fy}年4月1日〜${fy + 1}年3月31日`, warn: [],
      blocks: [{
        type: 'table', cols: [{ h: '科目' }, { h: `${fy}年度`, n: 1 }, { h: `${fy - 1}年度`, n: 1 }, { h: '増減', n: 1 }],
        rows: [
          ...R.incomeRows.map((x) => ({ c: [x.cat, x.cur, x.prev, x.diff] })),
          { c: ['収入合計', R.totIn.cur, R.totIn.prev, R.totIn.prev == null ? null : R.totIn.cur - R.totIn.prev], b: 1, shade: 1 },
          ...R.expenseRows.map((x) => ({ c: [x.cat, x.cur, x.prev, x.diff] })),
          { c: ['支出合計', R.totOut.cur, R.totOut.prev, R.totOut.prev == null ? null : R.totOut.cur - R.totOut.prev], b: 1, shade: 1 },
          { c: ['当期収支差額', R.net.cur, R.net.prev, R.net.prev == null ? null : R.net.cur - R.net.prev], b: 1 },
        ],
      }, { type: 'text', text: '※口座間の資金移動・積立口座の動きは収支に含めていません。', size: 9 }],
    };
    const bal = R.accounts;
    const balance = {
      key: 'balance', sheet: '預貯金・現金残高', widths: [16, 14, 14, 14, 16, 14, 12, 16],
      title: `${fy}年度 預貯金・現金残高`, sub: `${fy + 1}年3月31日現在　（実残高は「準備」で入力）`, warn: [],
      blocks: [{
        type: 'table', cols: [{ h: '口座' }, { h: '期首', n: 1 }, { h: '収入', n: 1 }, { h: '支出', n: 1 }, { h: '期末(帳簿)', n: 1 }, { h: '実残高', n: 1 }, { h: '差異', n: 1 }, { h: '繰越に含めない', n: 1 }],
        rows: [
          ...bal.map((a) => ({ c: [a.name + (a.reserve ? '（積立）' : ''), a.opening, a.in, a.out, a.closing, a.actual, a.diff, a.excess || null] })),
          { c: ['合計', bal.reduce((s, a) => s + a.opening, 0), bal.reduce((s, a) => s + a.in, 0), bal.reduce((s, a) => s + a.out, 0), bal.reduce((s, a) => s + a.closing, 0), null, null, null], b: 1, shade: 1 },
        ],
      }, { type: 'text', text: `一般会計の繰越金：期首 ${R.opening.toLocaleString('ja-JP')}円 → 期末 ${R.closing.toLocaleString('ja-JP')}円（積立口座と「繰越に含めない金額」を除く）`, size: 9 }],
    };
    const monthlyP = {
      key: 'monthly', sheet: '月別収支', widths: [8, 13, 13, 13, 16, 14, 13, 12],
      title: `${fy}年度 月別収支・現金チェック`, sub: '', warn: [],
      blocks: [{
        type: 'table', cols: [{ h: '月' }, { h: '収入', n: 1 }, { h: '支出', n: 1 }, { h: '収支', n: 1 }, { h: '現金帳簿残高', n: 1 }, { h: 'お財布金額', n: 1 }, { h: 'チェック日' }, { h: '差異', n: 1 }],
        rows: [
          ...R.months.map((m) => ({ c: [`${+m.ym.slice(5)}月`, m.in, m.out, m.net, m.bal['現金'] == null ? null : m.bal['現金'], m.check ? m.check.amount : null, m.check ? slash(m.check.date) : '', m.check && m.bal['現金'] != null ? m.check.amount - m.bal['現金'] : null] })),
          { c: ['合計', R.totIn.cur, R.totOut.cur, R.net.cur, null, null, '', null], b: 1, shade: 1 },
        ],
      }],
    };
    const detailsP = {
      key: 'details', sheet: '科目別明細', widths: [12, 44, 13, 13, 14, 28], title: `${fy}年度 科目別明細`, sub: '', warn: [],
      blocks: Object.keys(R.details).map((cat) => {
        const l = R.details[cat];
        return {
          type: 'table', caption: cat, cols: [{ h: '日付' }, { h: '摘要' }, { h: '収入', n: 1 }, { h: '支出', n: 1 }, { h: '口座' }, { h: 'メモ' }],
          rows: [
            ...l.map((e) => ({ c: [slash(e.date), e.desc, e.kind === 'in' ? e.amount : null, e.kind === 'out' ? e.amount : null, e.acct, e.note || ''] })),
            { c: ['', '小計', l.filter((e) => e.kind === 'in').reduce((s, e) => s + e.amount, 0), l.filter((e) => e.kind === 'out').reduce((s, e) => s + e.amount, 0), '', ''], b: 1, shade: 1 },
          ],
        };
      }),
    };
    const ledgerP = {
      key: 'ledger', sheet: '総勘定', widths: [12, 14, 44, 13, 13, 14, 28], title: `${fy}年度 総勘定（全明細）`, sub: '', warn: [],
      blocks: [{
        type: 'table', cols: [{ h: '日付' }, { h: '科目' }, { h: '摘要' }, { h: '収入', n: 1 }, { h: '支出', n: 1 }, { h: '口座' }, { h: 'メモ' }],
        rows: R.ledger.map((e) => ({ c: [slash(e.date), e.cat, e.desc, e.kind === 'in' ? e.amount : null, e.kind === 'out' ? e.amount : null, e.acct, e.note || ''] })),
      }],
    };
    return { main: [settle, audit, budget, subsidyP], detail: [compare, balance, monthlyP, detailsP, ledgerP] };
  }

  const api = { build, rdate, era };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Papers = api;
})(typeof window !== 'undefined' ? window : globalThis);
