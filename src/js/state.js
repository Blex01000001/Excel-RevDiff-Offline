/* ================= 狀態 ================= */
/* 【本檔】全域狀態（S、draft、applied、R、shown…）與「處理中」遮罩（showBusy / withBusy）
   - tests/ 會用 page.evaluate 直接讀 R、S、draft、shown、worker、workerFailed：改名要同步改測試。
   - 新的耗時動作一律包 withBusy(訊息, fn)，fn 可以是 async。 */
const S = {
  A:{id:'A', get label(){ return t('revA'); }, wb:null, name:'', sheet:'', hr:1, aoa:null, off:0, headers:[], rows:null},
  B:{id:'B', get label(){ return t('revB'); }, wb:null, name:'', sheet:'', hr:1, aoa:null, off:0, headers:[], rows:null},
};
const draft = { key:new Set(), cmp:new Set(), qty:new Set() };   // 使用者正在編輯的設定
let applied = null;                                            // 已套用（比對結果所依據）的設定
let colFilter = '';
let COLS = [];          // 兩檔欄位聯集
let R = null;           // 最近一次比對結果
let shown = [];         // 目前篩選後的 entries
let visCols = [];       // 目前顯示的欄位
let statusOn = new Set(['add','del','mod','same']);
let dFilter = {col:'', mode:'all'};   // 數量差值篩選
let dSort = {col:'', dir:0};          // 差值排序：1 由小到大、-1 由大到小、0 不排序
let dispCols = [];                    // 實際顯示的欄位（含差值欄）
let pageSize = 500;

/* ================= 處理中提示 ================= */
/* 先顯示提示並讓瀏覽器畫出來，再執行耗時工作；結束後一定會關閉 */
let busyTimer = null, busyStart = 0;
function showBusy(msg){
  $('#busyT').textContent = msg || t('busyDefault'); $('#busyE').textContent = ''; $('#busy').hidden = false;
  busyStart = Date.now(); clearInterval(busyTimer);
  busyTimer = setInterval(() => { const n = Math.round((Date.now() - busyStart) / 1000); if (n >= 2) $('#busyE').textContent = t('elapsed', n); }, 500);
}
function hideBusy(){ clearInterval(busyTimer); $('#busy').hidden = true; }
const nextPaint = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
async function withBusy(msg, fn){
  showBusy(msg);
  await nextPaint();
  try{ return await fn(); } finally{ hideBusy(); }
}

