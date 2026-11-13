/* ================= 顯示 ================= */
function renderSummary(){
  const c = R.counts;
  $('#stats').innerHTML = `
    <div class="stat add"><span class="lb">${t('stAdd')}</span><div class="n">${c.add}</div></div>
    <div class="stat del"><span class="lb">${t('stDel')}</span><div class="n">${c.del}</div></div>
    <div class="stat mod"><span class="lb">${t('stMod')}</span><div class="n">${c.mod}</div></div>
    <div class="stat same"><span class="lb">${t('stSame')}</span><div class="n">${c.same}</div></div>
    <div class="stat"><span class="lb">${t('totalRows')}</span><div class="n">${R.entries.length}</div></div>`;
  const cc = Object.entries(R.colCount).sort((a,b) => b[1]-a[1]);
  $('#colStat').innerHTML = cc.length
    ? t('colStatHead') + cc.map(([k,v]) => `<b>${esc(k)}</b> ×${v}`).join('　')
    : t('noMod');
}
function renderWarnings(){
  const w = [];
  for (const side of ['A','B']){
    const d = R.dups[side];
    if (!d.length) continue;
    const rows = d.reduce((s,x) => s + x.count, 0);
    w.push(`<details class="warn"><summary>${t('dupTitle', S[side].label, d.length, rows)}<span style="font-weight:400">　${t('expandDetail')}</span></summary>
      <div>${t('dupBody')}</div>
      <ul>${d.slice(0,200).map(x => `<li>${t('dupLi', esc(x.key || t('keyEmpty')), x.count, x.rns.slice(0,12).join(', '), x.rns.length>12 ? x.rns.length : 0)}</li>`).join('')}${d.length>200?`<li>${t('dupMoreGroups', d.length-200)}</li>`:''}</ul></details>`);
  }
  const tot = {A:S.A.rows.length, B:S.B.rows.length};
  const low = ['A','B'].filter(side => tot[side] && R.dups[side].reduce((n,x) => n + x.count, 0) / tot[side] > 0.2);
  if (low.length || R.byOrder)
    w.unshift(`<details class="warn err"><summary>${t('lowTitle')}<span style="font-weight:400">　${t('expandNote')}</span></summary>
      <div>${t('lowBody', low.map(x => S[x].label).join(t('joiner')) || t('someData'), R.byOrder)}</div></details>`);
  const onlyA = S.A.headers.filter(c => !S.B.headers.includes(c)), onlyB = S.B.headers.filter(c => !S.A.headers.includes(c));
  if (onlyA.length || onlyB.length)
    w.push(`<details class="warn"><summary>${t('colDiffTitle')}<span style="font-weight:400">　${t('expandDetail')}</span></summary>
      ${onlyA.length?`<div>${t('onlyInA')}${onlyA.map(c=>'<code>'+esc(c)+'</code>').join(' ')}</div>`:''}
      ${onlyB.length?`<div>${t('onlyInB')}${onlyB.map(c=>'<code>'+esc(c)+'</code>').join(' ')}</div>`:''}
      <div>${t('missingNote')}</div></details>`);
  $('#warns').innerHTML = w.join('');
}
function renderFilterChips(){
  const c = R.counts;
  $('#fchips').innerHTML =
    [['all',t('fAll'),R.entries.length],['add',t('stAdd'),c.add],['del',t('stDel'),c.del],['mod',t('stMod'),c.mod],['same',t('stSame'),c.same]]
    .map(([k,n,v]) => {
      const on = k === 'all' ? statusOn.size === 4 : statusOn.has(k);
      return `<button class="fchip ${k} ${on?'on':''}" data-s="${k}">${n} ${v}</button>`;
    }).join('');
}
$('#fchips').addEventListener('click', e => {
  const s = e.target.dataset && e.target.dataset.s; if (!s) return;
  if (s === 'all') statusOn = new Set(['add','del','mod','same']);
  else if (statusOn.size === 4) statusOn = new Set([s]);
  else { statusOn.has(s) ? statusOn.delete(s) : statusOn.add(s); if (!statusOn.size) statusOn = new Set(['add','del','mod','same']); }
  pageSize = 500; renderTable();
});
$('#q').addEventListener('input', () => { pageSize = 500; renderTable(); });

function filteredEntries(){
  const terms = normText($('#q').value).split(' ').filter(Boolean);
  let list = R.entries.filter(e => statusOn.has(e.status) && terms.every(t => e.hay.includes(t)));
  const col = dFilter.col, m = dFilter.mode;
  if (col && m !== 'all'){
    const ok = {inc: d => d !== null && d > 0, dec: d => d !== null && d < 0,
                chg: d => d !== null && d !== 0, zero: d => d === 0};
    list = list.filter(e => ok[m](e.deltas[col] === undefined ? null : e.deltas[col]));
  }
  if (dSort.dir && dSort.col){
    const c = dSort.col, dir = dSort.dir;
    const val = e => e.deltas[c] === undefined ? null : e.deltas[c];
    list = list.map((e,i) => [e,i]).sort((x,y) => {
      const a = val(x[0]), b = val(y[0]);
      if (a === null && b === null) return x[1]-y[1];
      if (a === null) return 1; if (b === null) return -1;
      return (a-b)*dir || x[1]-y[1];
    }).map(x => x[0]);
  }
  return list;
}
function computeDispCols(vis){
  const out = [];
  for (const c of vis){
    out.push({label:c, col:c, delta:false});
    if (R.qtyCols.includes(c)) out.push({label:t('hDelta', c), col:c, delta:true});
  }
  return out;
}
function deltaCell(e, c){
  if (e.status === 'add' || e.status === 'del') return '<td class="dlt na">—</td>';
  const d = e.deltas[c];
  if (d === null || d === undefined) return '<td class="dlt na"></td>';
  return `<td class="dlt ${d > 0 ? 'pos' : d < 0 ? 'neg' : 'zero'}">${d === 0 ? '0' : fmtDelta(d)}</td>`;
}
const D_MODES = () => [['all',t('fAll')],['inc',t('dInc')],['dec',t('dDec')],['chg',t('dChg')],['zero',t('dZero')]];
function renderDeltaTool(){
  if ($('#dtool').hidden) return;
  $('#dmodes').innerHTML = D_MODES().map(([k,n]) => `<button class="fchip all ${dFilter.mode===k?'on':''}" data-d="${k}">${n}</button>`).join('');
  const c = dFilter.col; let sum = 0, inc = 0, dec = 0;
  for (const e of shown){ const d = e.deltas[c]; if (d == null) continue; sum += d; if (d > 0) inc++; else if (d < 0) dec++; }
  $('#dsum').textContent = t('dSum', fmtDelta(sum), inc, dec);
}
$('#dmodes').addEventListener('click', e => {
  const m = e.target.dataset && e.target.dataset.d; if (!m) return;
  dFilter.mode = m; pageSize = 500; renderTable();
});
$('#dcol').addEventListener('change', e => { dFilter.col = e.target.value; pageSize = 500; renderTable(); });
$('#tw').addEventListener('click', e => {
  const th = e.target.closest('th[data-sort]'); if (!th) return;
  const c = th.dataset.sort;
  dSort = dSort.col === c ? {col:c, dir: dSort.dir === -1 ? 1 : (dSort.dir === 1 ? 0 : -1)} : {col:c, dir:-1};
  renderTable();
});
function computeVisCols(list){
  let cols = COLS.slice();
  if ($('#optHideEmpty').checked)
    cols = cols.filter(c => R.entries.some(e => (e.a && cellStr(e.a.v[c]).trim()) || (e.b && cellStr(e.b.v[c]).trim())));
  if ($('#optOnlyDiff').checked)
    cols = cols.filter(c => R.keyCols.includes(c) || R.colCount[c]);
  return cols;
}
function cellHTML(e, c){
  const ch = e.changes.find(x => x.col === c);
  const val = (e.b || e.a).v[c];
  if (!ch) return `<td>${esc(cellStr(val))}</td>`;
  const emp = `<span class="empty">${t('empty')}</span>`;
  const o = ch.oldV.trim() === '' ? emp : esc(ch.oldV), n = ch.newV.trim() === '' ? emp : esc(ch.newV);
  return `<td class="chg" title="${esc(t('oldNew', ch.oldV, ch.newV))}"><span class="o">${o}</span><span class="arrow">→</span><span class="nv">${n}</span></td>`;
}
function renderTable(){
  if (!R) return;
  renderFilterChips();
  shown = filteredEntries();
  visCols = computeVisCols(shown);
  dispCols = computeDispCols(visCols);
  $('#cnt').textContent = t('showing', shown.length, R.entries.length);
  $('#btnExport').disabled = !R.entries.length;
  renderDeltaTool();
  const head = `<tr><th class="cat">${t('hStatus')}</th><th>${t('hChanged')}</th><th>${t('hRowA')}</th><th>${t('hRowB')}</th>${dispCols.map(d => d.delta
    ? `<th class="dth" data-sort="${esc(d.col)}" title="${t('sortTip')}">${esc(d.label)} ${dSort.col===d.col ? (dSort.dir===-1?'▼':dSort.dir===1?'▲':'⇅') : '⇅'}</th>`
    : `<th class="${R.keyCols.includes(d.col)?'key':''}">${esc(d.label)}</th>`).join('')}</tr>`;
  const part = shown.slice(0, pageSize);
  const body = part.map(e => `<tr class="${e.status}"><td class="cat">${STATUS()[e.status]}</td>
    <td>${esc(e.changes.map(x=>x.col).join(', '))}</td><td class="rn">${e.a?e.a.rn:''}</td><td class="rn">${e.b?e.b.rn:''}</td>
    ${dispCols.map(d => d.delta ? deltaCell(e, d.col) : cellHTML(e, d.col)).join('')}</tr>`).join('');
  $('#tw').innerHTML = shown.length
    ? `<table><thead>${head}</thead><tbody>${body}</tbody></table>` +
      (shown.length > pageSize ? `<div class="more"><button class="fchip" id="btnMore">${t('loadMore', shown.length-pageSize)}</button></div>` : '')
    : `<div class="ph">${t('noRows')}</div>`;
  const m = $('#btnMore'); if (m) m.onclick = () => { pageSize += 500; renderTable(); };
}

