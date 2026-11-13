/* ================= 讀檔 ================= */
function renderSlotStatic(slot){
  $('#dropTxt'+slot.id).innerHTML = `<b>${esc(slot.label)}</b><br>${t('dropHint')}<br><small>${t('dropFmt')}</small>`;
  $('#shLbl'+slot.id).textContent = t('sheetLbl');
  $('#hrPre'+slot.id).textContent = t('hrPre');
  $('#hrPost'+slot.id).textContent = t('hrPost');
  renderMeta(slot);
}
function renderMeta(slot){
  const el = $('#meta'+slot.id);
  if (!slot.rows && !slot.hrOut){ el.textContent = ''; return; }
  el.textContent = slot.hrOut ? t('hrOut')
    : t('meta', slot.rows.length, slot.headers.length, slot.headers.slice(0,6).join(' / ') + (slot.headers.length>6?' …':''));
}
function buildSlotUI(slot){
  const el = document.createElement('div');
  el.innerHTML = `
    <label class="drop" id="drop${slot.id}">
      <input type="file" accept=".xlsx,.xlsm,.xlsb,.xls,.ods,.csv" id="file${slot.id}">
      <span id="dropTxt${slot.id}"></span>
    </label>
    <div class="finfo" id="info${slot.id}" hidden>
      <span id="fname${slot.id}" style="font-weight:600"></span>
      <label><span id="shLbl${slot.id}"></span> <select id="sheet${slot.id}"></select></label>
      <label><span id="hrPre${slot.id}"></span> <input type="number" min="1" id="hr${slot.id}"> <span id="hrPost${slot.id}"></span></label>
    </div>
    <div class="meta" id="meta${slot.id}"></div>`;
  $('#files').appendChild(el);
  renderSlotStatic(slot);
  const inp = $('#file'+slot.id), drop = $('#drop'+slot.id);
  inp.addEventListener('change', () => inp.files[0] && loadFile(slot, inp.files[0]));
  ['dragenter','dragover'].forEach(e => drop.addEventListener(e, ev => {ev.preventDefault(); drop.classList.add('over');}));
  ['dragleave','drop'].forEach(e => drop.addEventListener(e, ev => {ev.preventDefault(); drop.classList.remove('over');}));
  drop.addEventListener('drop', ev => { const f = ev.dataTransfer.files[0]; if (f) loadFile(slot, f); });
  $('#sheet'+slot.id).addEventListener('change', e => {
    slot.sheet = e.target.value;
    withBusy(t('readSheet'), async () => {
      const sh = await runJob('sheet', { slot: slot.id, sheet: slot.sheet });
      slot.aoa = sh.aoa; slot.off = sh.off;
      parseSlot(slot, true); refresh();
    }).catch(err => showMsg(() => t('errParse', esc(slot.name), esc(err.message||err)), true));
  });
  $('#hr'+slot.id).addEventListener('change', e => { slot.hr = Math.max(1, parseInt(e.target.value)||1); withBusy(t('readData'), () => { parseSlot(slot, false); refresh(); }); });
}
/* 訊息以「產生文字的函式」保存，切換語言時才能用新語言重新產生；傳入空值＝清除 */
let msgState = null;
function renderMsg(){
  $('#msg').innerHTML = msgState ? `<div class="warn ${msgState.err?'err':''}">${msgState.fn()}</div>` : '';
}
function showMsg(fn, err){ msgState = fn ? {fn, err} : null; renderMsg(); }
/* 載入前先看檔案開頭：zip(PK)、舊版 xls(D0CF11E0) 或純文字（csv / xml / 以 xls 命名的 html）才放行 */
function looksLikeExcel(buf, name){
  const u8 = new Uint8Array(buf, 0, Math.min(buf.byteLength, 2048));
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (u8.length < 4) return false;
  const isZip = u8[0] === 0x50 && u8[1] === 0x4B;
  const isOle = u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0;
  if (isZip) return ['xlsx','xlsm','xlsb','ods'].includes(ext);
  if (isOle) return ['xls','xlsb'].includes(ext);
  if (!['csv','xml','fods','xls'].includes(ext)) return false;
  let bad = 0;                                    // 純文字：不可含 NUL 或大量控制字元
  for (const c of u8) if (c === 0 || (c < 9) || (c > 13 && c < 32)) bad++;
  return bad === 0;
}
async function loadFile(slot, file){
  showBusy(t('readFile', file.name));
  try{
    await nextPaint();
    let buf;
    try{ buf = await file.arrayBuffer(); }
    catch(e){ showMsg(() => t('errRead', esc(file.name)), true); return; }
    if (!looksLikeExcel(buf, file.name)){ showMsg(() => t('errNotExcel', esc(file.name)), true); return; }
    const { sheetNames } = await runJob('read', { slot: slot.id, buf });
    if (!sheetNames.length){ const er = new Error('no sheets'); er.key = 'errNoSheet'; throw er; }
    const other = slot.id === 'A' ? S.B : S.A;
    const sheet = (other.sheetNames && sheetNames.includes(other.sheet)) ? other.sheet : sheetNames[0];
    const sh = await runJob('sheet', { slot: slot.id, sheet });
    slot.sheetNames = sheetNames; slot.name = file.name; slot.sheet = sheet; slot.aoa = sh.aoa; slot.off = sh.off;
    $('#sheet'+slot.id).innerHTML = sheetNames.map(n => `<option>${esc(n)}</option>`).join('');
    $('#sheet'+slot.id).value = slot.sheet;
    $('#fname'+slot.id).textContent = file.name;
    $('#info'+slot.id).hidden = false;
    showMsg('');
    parseSlot(slot, true);
    refresh();
  }catch(e){
    showMsg(() => t('errParse', esc(file.name), esc(e.key ? t(e.key) : (e.message||e))), true);
  }finally{ hideBusy(); }
}
function detectHeader(aoa){
  const lim = Math.min(aoa.length, 30);
  const cnt = i => aoa[i].filter(c => cellStr(c).trim() !== '').length;
  let mx = 0;
  for (let i=0;i<lim;i++) mx = Math.max(mx, cnt(i));
  for (let i=0;i<lim;i++) if (mx && cnt(i) >= mx*0.8) return i;
  return 0;
}
function parseSlot(slot, autoHeader){
  if (autoHeader) slot.hr = slot.aoa.length ? detectHeader(slot.aoa) + slot.off + 1 : 1;
  $('#hr'+slot.id).value = slot.hr;
  const hi = slot.hr - slot.off - 1;
  const hrow = slot.aoa[hi];
  slot.hrOut = !hrow;
  if (!hrow){ slot.headers = []; slot.rows = []; renderMeta(slot); return; }
  const seen = new Map();
  slot.headers = hrow.map((h,i) => {
    let n = cellStr(h).normalize('NFKC').trim() || ('Col'+(i+1));
    if (seen.has(n)){ const k = seen.get(n)+1; seen.set(n,k); n = n+'_'+k; } else seen.set(n,1);
    return n;
  });
  slot.rows = [];
  for (let i=hi+1;i<slot.aoa.length;i++){
    const r = slot.aoa[i];
    if (r.every(c => cellStr(c).trim() === '')) continue;
    const v = {};
    slot.headers.forEach((h,j) => v[h] = r[j] === undefined ? '' : r[j]);
    slot.rows.push({rn: i + slot.off + 1, v, idx: slot.rows.length});
  }
  renderMeta(slot);
}

