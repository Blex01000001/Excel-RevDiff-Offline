/* ================= 背景執行（Web Worker） =================
   讀檔、解析工作表、比對都在 Worker 裡跑，頁面不會凍結。Worker 的程式碼由下列函式的原始碼
   （Function.prototype.toString）加上內嵌的 SheetJS 組成，所以整個工具仍是單一 HTML 檔。
   若 Worker 無法建立或啟動失敗，會自動退回在主執行緒執行（同一組函式，只是會卡住畫面）。
   ！compare() 會用到的函式必須都列在 workerSource() 的清單裡，且不可使用 t()、$()、S 等主執行緒才有的東西。
   - compare() 回傳精簡結果（以 ai / bi 列索引取代列物件），runCompare() 才還原；顯示用的文字在主執行緒以 t() 產生。
   - 不要拆成外部 worker 檔、不要把 SheetJS 改回主執行緒直接載入、不要移除備援（runJobLocal）。
   - SheetJS 放在 template.html 裡 id="sheetjs-src" 的純文字 script 區塊（type="text/plain"），由 build.py 填入。 */
function jobDispatch(books, type, payload){
  if (type === 'read'){
    const wb = XLSX.read(new Uint8Array(payload.buf), {type:'array', cellDates:true});
    books[payload.slot] = wb;
    return {sheetNames: wb.SheetNames};
  }
  if (type === 'sheet'){
    const ws = books[payload.slot].Sheets[payload.sheet];
    if (!ws || !ws['!ref']) return {off:0, aoa:[]};
    return {off: XLSX.utils.decode_range(ws['!ref']).s.r,
            aoa: XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:'', blankrows:true})};
  }
  if (type === 'compare') return compareJob(payload);
  throw new Error('unknown job: ' + type);
}
/* 回傳精簡版結果：以「列索引」取代列物件，避免把整份資料再複製回主執行緒 */
function compareJob(pl){
  const r = compare(pl.A, pl.B, pl.keyCols, pl.cmpCols, new Set(pl.qty));
  r.entries = r.entries.map(en => ({status:en.status, ai:en.a ? en.a.idx : -1, bi:en.b ? en.b.idx : -1,
                                    changes:en.changes, deltas:en.deltas, hay:en.hay}));
  return r;
}
function workerMain(){
  const books = {};
  self.onmessage = e => {
    const m = e.data;
    try{ self.postMessage({id:m.id, ok:true, result:jobDispatch(books, m.type, m.payload)}); }
    catch(err){ self.postMessage({id:m.id, ok:false, error:String((err && err.message) || err), key:err && err.key}); }
  };
}
function workerSource(){
  const lib = document.getElementById('sheetjs-src').textContent;
  const fns = [cellStr, normText, numOf, norm, parseNum, fmtDelta, nval, rowKey, keyLabel, diffRows,
               pairGroup, groupBy, compare, compareJob, jobDispatch].map(f => f.toString()).join('\n');
  return lib + '\n;const NUM_RE = ' + NUM_RE.toString() + ';const GREEDY_LIMIT = ' + GREEDY_LIMIT + ';\n' +
         fns + '\n(' + workerMain.toString() + ')();';
}
let worker = null, workerFailed = false, jobSeq = 0;
const pendingJobs = new Map(), localBooks = {};
function getWorker(){
  if (workerFailed) return null;
  if (worker) return worker;
  try{
    worker = new Worker(URL.createObjectURL(new Blob([workerSource()], {type:'text/javascript'})));
    worker.onmessage = e => {
      const m = e.data, p = pendingJobs.get(m.id); if (!p) return;
      pendingJobs.delete(m.id);
      if (m.ok) p.resolve(m.result); else p.reject(Object.assign(new Error(m.error), {key:m.key}));
    };
    worker.onerror = ev => {
      if (ev.preventDefault) ev.preventDefault();
      workerFailed = true; worker = null;
      for (const p of pendingJobs.values()) p.reject(Object.assign(new Error('worker failed'), {fallback:true}));
      pendingJobs.clear();
    };
  }catch(e){ workerFailed = true; worker = null; }
  return worker;
}
function runJobLocal(type, payload){
  if (typeof XLSX === 'undefined'){   // 備援：在主執行緒載入內嵌的 SheetJS
    const el = document.createElement('script');
    el.textContent = document.getElementById('sheetjs-src').textContent;
    document.head.appendChild(el);
  }
  return jobDispatch(localBooks, type, payload);
}
async function runJob(type, payload){
  const w = getWorker();
  if (w){
    try{
      return await new Promise((resolve, reject) => {
        const id = ++jobSeq; pendingJobs.set(id, {resolve, reject});
        w.postMessage({id, type, payload});
      });
    }catch(e){ if (!e.fallback) throw e; }
  }
  await nextPaint();
  return runJobLocal(type, payload);
}

async function runCompare(){
  const keyCols = COLS.filter(c => applied.key.has(c));
  const cmpCols = COLS.filter(c => !applied.key.has(c) && applied.cmp.has(c));
  const strip = slot => slot.rows.map(r => ({rn:r.rn, v:r.v, idx:r.idx}));
  const res = await runJob('compare', {A:{rows:strip(S.A)}, B:{rows:strip(S.B)}, keyCols, cmpCols, qty:[...applied.qty]});
  res.entries = res.entries.map(en => ({status:en.status, a:en.ai >= 0 ? S.A.rows[en.ai] : null,
    b:en.bi >= 0 ? S.B.rows[en.bi] : null, changes:en.changes, deltas:en.deltas, hay:en.hay}));
  R = res;
  R.keyCols = keyCols; R.cmpCols = cmpCols;
  R.qtyCols = COLS.filter(c => applied.qty.has(c) && !applied.key.has(c));
  dFilter = {col: R.qtyCols[0] || '', mode:'all'}; dSort = {col:'', dir:0};
  $('#dtool').hidden = !R.qtyCols.length;
  $('#dcol').innerHTML = R.qtyCols.map(c => `<option>${esc(c)}</option>`).join('');
  $('#dcol').hidden = R.qtyCols.length < 2;
  $('#sumCard').hidden = $('#resCard').hidden = false;
  statusOn = new Set(['add','del','mod','same']); pageSize = 500;
  renderSummary(); renderWarnings(); renderTable();
}

