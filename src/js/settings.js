/* ================= 欄位設定 ================= */
function syncColumns(){
  const a = S.A.headers || [], b = S.B.headers || [];
  COLS = [...a, ...b.filter(x => !a.includes(x))];
}
/* 依欄位名稱找常見的識別欄位；找不到時用資料挑出「最能區分每一列」的欄位組合 */
const KEY_NAME_RE = [/^line\s*(no|number|#)?\.?$/i, /ident.?code|item.?code|part.?(no|number)|^item$|^sku$|^id$/i, /^size/i, /編號|料號|品號|代碼|代號/];
function suggestKey(){
  const named = COLS.filter(c => KEY_NAME_RE.some(re => re.test(c)));
  if (named.length) return named;
  const rows = S.B.rows, n = rows.length;
  const cand = COLS.filter(c => S.A.headers.includes(c) && S.B.headers.includes(c));
  let chosen = [], cur = rows.map(() => '');
  for (let step = 0; step < 4; step++){
    let best = null, bestD = -1;
    for (const c of cand){
      if (chosen.includes(c)) continue;
      const set = new Set();
      for (let i = 0; i < n; i++) set.add(cur[i] + '\u0001' + nval(rows[i], c));
      if (set.size > bestD){ bestD = set.size; best = c; }
    }
    if (!best) break;
    const before = new Set(cur).size;
    if (bestD <= before && chosen.length) break;
    chosen.push(best);
    cur = rows.map((r,i) => cur[i] + '\u0001' + nval(r, best));
    if (bestD >= n * 0.999) break;
  }
  return chosen.length ? chosen : (COLS.length ? [COLS[0]] : []);
}
const sampleCache = new Map();
function sampleOf(c){
  if (sampleCache.has(c)) return sampleCache.get(c);
  let v = '';
  for (const slot of [S.B, S.A]){
    for (let i = 0; i < Math.min(slot.rows.length, 500) && !v; i++) v = cellStr(slot.rows[i].v[c]).trim();
    if (v) break;
  }
  sampleCache.set(c, v); return v;
}
/* 防呆：勾了「數量」的欄位一定要比對，否則算不出差值 */
const isCmp = c => !draft.key.has(c) && (draft.cmp.has(c) || draft.qty.has(c));
function syncCmpBox(c){
  const cb = document.querySelector(`#cfgTable input[data-k="cmp"][data-c="${CSS.escape(c)}"]`);
  if (!cb) return;
  cb.checked = isCmp(c);
  cb.disabled = draft.key.has(c) || draft.qty.has(c);
  cb.title = !draft.key.has(c) && draft.qty.has(c) ? t('tipQtyLock') : '';
}
const sameSet = (x, y) => x.size === y.size && [...x].every(v => y.has(v));
function renderCfg(){
  $('#cfgCard').hidden = !(S.A.rows && S.B.rows);
  if ($('#cfgCard').hidden) return;
  const wrap = $('#cfgTable'), top = wrap.scrollTop;
  const q = normText(colFilter);
  const list = COLS.filter(c => !q || normText(c).includes(q));
  const mini = k => `<span class="mini"><a data-act="all" data-k="${k}">${t('all')}</a><a data-act="none" data-k="${k}">${t('none')}</a></span>`;
  const rows = list.map(c => {
    const onlyA = !S.B.headers.includes(c), onlyB = !S.A.headers.includes(c);
    const key = draft.key.has(c);
    return `<tr class="${key?'iskey':''}" data-row="${esc(c)}">
      <td class="nm l">${esc(c)}${onlyA?`<span class="tag">${t('onlyA')}</span>`:''}${onlyB?`<span class="tag">${t('onlyB')}</span>`:''}</td>
      <td class="smp l" title="${esc(sampleOf(c))}">${esc(sampleOf(c))}</td>
      <td><input type="checkbox" data-k="key" data-c="${esc(c)}" ${key?'checked':''}></td>
      <td><input type="checkbox" data-k="cmp" data-c="${esc(c)}" ${isCmp(c)?'checked':''} ${key||draft.qty.has(c)?'disabled':''} title="${!key&&draft.qty.has(c)?esc(t('tipQtyLock')):''}"></td>
      <td><input type="checkbox" data-k="qty" data-c="${esc(c)}" ${draft.qty.has(c)?'checked':''}></td></tr>`;
  }).join('');
  wrap.innerHTML = `<table class="cfgt"><thead><tr><th class="l">${t('thCol')}</th><th class="l">${t('thSample')}</th>
    <th>${t('thKey')}${mini('key')}</th><th>${t('thCmp')}${mini('cmp')}</th><th>${t('thQty')}${mini('qty')}</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5" class="ph">${t('noCols')}</td></tr>`}</tbody></table>`;
  wrap.scrollTop = top;
  updateCfgStatus();
}
/* 只更新狀態列與「尚未套用」提示，不重畫表格（保留捲動位置） */
function updateCfgStatus(){
  const ks = COLS.filter(c => draft.key.has(c));
  const nc = COLS.filter(isCmp).length, nq = COLS.filter(c => draft.qty.has(c)).length;
  $('#cfgStatus').innerHTML =
    t('status', ks.length, ks.map(esc).join(' + '), nc, nq) +
    (ks.length && !nc ? `<br><span style="color:var(--mod-t)">${t('warnNoCmp')}</span>` : '');
  $('#btnApply').disabled = !ks.length;
  const dirty = !applied || !(sameSet(applied.key, draft.key) && sameSet(applied.cmp, draft.cmp) && sameSet(applied.qty, draft.qty));
  $('#pend').textContent = !(S.A.rows && S.B.rows) ? '' : (!applied ? t('pendNone') : (dirty ? t('pendDirty') : ''));
}
$('#cfgTable').addEventListener('change', e => {
  const t = e.target; if (!t.dataset || !t.dataset.k) return;
  const c = t.dataset.c;
  t.checked ? draft[t.dataset.k].add(c) : draft[t.dataset.k].delete(c);
  if (t.dataset.k === 'qty' && t.checked) draft.cmp.add(c);   // 數量 → 一併勾選比對
  if (t.dataset.k === 'key') t.closest('tr').classList.toggle('iskey', t.checked);
  syncCmpBox(c);
  updateCfgStatus();
});
$('#cfgTable').addEventListener('click', e => {
  const a = e.target.closest('a[data-act]'); if (!a) return;
  const k = a.dataset.k, q = normText(colFilter);
  for (const c of COLS.filter(c => !q || normText(c).includes(q))){
    if (a.dataset.act === 'all'){
      if (k !== 'cmp' || !draft.key.has(c)) draft[k].add(c);
      if (k === 'qty' && !draft.key.has(c)) draft.cmp.add(c);          // 數量 → 一併勾選比對
    } else if (!(k === 'cmp' && draft.qty.has(c))) draft[k].delete(c);  // 有勾數量的欄位不能取消比對
  }
  renderCfg();
});
$('#colFilter').addEventListener('input', e => { colFilter = e.target.value; renderCfg(); });
$('#btnSuggest').addEventListener('click', () => {
  draft.key = new Set(suggestKey()); renderCfg();
});
$('#btnReset').addEventListener('click', () => {
  draft.key.clear(); draft.cmp.clear(); draft.qty.clear(); renderCfg();
});
['optHideEmpty','optOnlyDiff'].forEach(id => $('#'+id).addEventListener('change', renderTable));
$('#btnApply').addEventListener('click', applyConfig);

/* 載入 / 變更檔案後：清掉舊結果，讓使用者重新設定並按「套用」 */
function refresh(){
  syncColumns();
  sampleCache.clear();
  applied = null; R = null;
  $('#sumCard').hidden = $('#resCard').hidden = true;
  $('#warns').innerHTML = '';
  renderCfg();
}
function applyConfig(){
  if (!(S.A.rows && S.B.rows)) return;
  const keyCols = COLS.filter(c => draft.key.has(c));
  if (!keyCols.length){ showMsg(() => t('errNeedKey'), true); return; }
  const miss = () => [...keyCols.filter(c => !S.A.headers.includes(c)).map(c => `<code>${esc(c)}</code>${t('notInA')}`),
                      ...keyCols.filter(c => !S.B.headers.includes(c)).map(c => `<code>${esc(c)}</code>${t('notInB')}`)];
  if (miss().length){ showMsg(() => t('errMissKey', miss().join(t('joiner'))), true); return; }
  showMsg('');
  withBusy(t('comparing'), async () => {
    applied = {key:new Set(draft.key), cmp:new Set([...draft.cmp, ...[...draft.qty].filter(c => !draft.key.has(c))]), qty:new Set(draft.qty)};
    await runCompare();
    updateCfgStatus();
    $('#sumCard').scrollIntoView({behavior:'smooth', block:'start'});
  }).catch(err => {
    applied = null; R = null; $('#sumCard').hidden = $('#resCard').hidden = true; updateCfgStatus();
    showMsg(() => t('errCompare', esc(err.message || err)), true);
  });
}

