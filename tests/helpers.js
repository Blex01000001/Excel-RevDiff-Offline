'use strict';
/* 測試共用：產生測試檔、開啟頁面、操作設定、讀回匯出檔。
   只依賴 playwright 與專案內建的 SheetJS（src/xlsx.core.min.js），不用額外套件。 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');
const XLSX = require('../src/xlsx.core.min.js');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const APP_URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const DEMO_A = path.join(ROOT, 'samples', 'demo_RevA.xlsx');
const DEMO_B = path.join(ROOT, 'samples', 'demo_RevB.xlsx');

/* ---------- 測試檔 ---------- */
function writeBook(file, sheets, bookType) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: bookType || 'xlsx', compression: true }));
  return file;
}
const H = ['LINE NO.', 'IDENT CODE', 'SIZE-1', 'SIZE-2', 'QTY', 'REV', 'NOTE'];
const withJunk = rows => [['Title junk'], ['2nd junk'], H, ...rows];   // 標題列在第 3 列

function makeFixtures(dir) {
  const f = {};
  const A = [
    ['L1', 'P1', '1', '', 12, '0', 'same'],        // 數量 12 → 15
    ['L1', 'P2', '2', '', 5, '0', 'keep'],         // 未變
    ['L1', 'P3', '3', '', 1, '0', 'deleted'],      // 刪除
    ['L1', 'ＡＢＣ１', '4', '', 2, '0', 'width'],  // 全形 / 大小寫 → 未變
    ['L1', 'P5', '10', '', 3, '0', 'size num'],    // "10" 對 10.0 → 未變
    ['L1', 'P6', '6', '', 4, '0', 'old note'],     // NOTE 修改
    ['L1', 'P7', '7', '', 1, '0', 'dup'],          // A 內重複 Key
    ['L1', 'P7', '7', '', 2, '0', 'dup'],
    ['L1', 'P8', '8', '', 1, ' x ', 'trim'],       // 前後空白 → 未變
  ];
  const B = [
    ['L1', 'P1', '1', '', 15, '0', 'same'],
    ['L1', 'P2', '2', '', 5, '0', 'keep'],
    ['L1', 'abc1', '4', '', 2, '0', 'width'],
    ['L1', 'P5', 10, '', 3, '0', 'size num'],
    ['L1', 'P6', '6', '', 4, '0', 'new note'],
    ['L1', 'P7', '7', '', 1, '0', 'dup'],
    ['L1', 'P7', '7', '', 9, '0', 'dup'],
    ['L1', 'P8', '8', '', 1, 'X', 'trim'],
    ['L1', 'P9', '9', '', 7, '0', 'added'],        // 新增
    ['L1', 'P9', '9', '', 7, '0', 'added'],        // B 內重複 Key
  ];
  f.synthA = writeBook(path.join(dir, 'synthA.xlsx'), { MTO: withJunk(A) });
  f.synthB = writeBook(path.join(dir, 'synthB.xlsx'), { Cover: [['cover']], MTO: withJunk(B) });   // 多工作表
  const B2 = B.map(r => (r[1] === 'P2' ? [...r.slice(0, 4), 3, ...r.slice(5)] : r));               // P2：5 → 3
  f.synthB2 = writeBook(path.join(dir, 'synthB2.xlsx'), { MTO: withJunk(B2) });

  const rows = [['SKU', '名稱', 'Qty', 'Price'], ['A001', '螺栓 Bolt', '10', 1.5], ['A002', '螺帽 Nut', '20', 0.8], ['A003', 'ＡＢＣ全形', '5', 2]];
  f.formats = {};
  for (const [ext, bt] of [['xlsx', 'xlsx'], ['xlsm', 'xlsm'], ['xlsb', 'xlsb'], ['xls', 'biff8'], ['ods', 'ods'], ['fods', 'fods'], ['csv', 'csv'], ['xml', 'xlml']])
    f.formats[ext] = writeBook(path.join(dir, 'fmt.' + ext), { Sheet1: rows }, bt);

  f.bad = {};
  const bad = (name, data) => { f.bad[name] = path.join(dir, name); fs.writeFileSync(f.bad[name], data); };
  bad('fake.xlsx', 'this is just text');
  bad('photo.xlsx', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]));
  bad('notes.txt', 'a,b\n1,2\n');
  bad('bin.csv', Buffer.from([0, 1, 2, 3, 98, 105, 110]));
  f.okText = {};
  const ok = (name, data) => { f.okText[name] = path.join(dir, name); fs.writeFileSync(f.okText[name], data); };
  ok('ok.csv', 'SKU,Qty\nA1,5\n');
  ok('html.xls', '<html><table><tr><td>SKU</td><td>Qty</td></tr><tr><td>A1</td><td>5</td></tr></table></html>');

  // Key 區分度極低（K 只有 12 種值）：驗證不會卡死，且 V 是唯一欄位（用來驗證「建議 Key」）
  // A、B 的 V 前綴不同，所以沒有任何「內容完全相同」的列，會走到「依順序配對」的保護分支
  const mk = (n, p) => [['K', 'V', 'Q'], ...Array.from({ length: n }, (_, i) => ['k' + (i % 12), p + i, String(i % 50)])];
  f.lowA = writeBook(path.join(dir, 'lowA.xlsx'), { S: mk(3000, 'v') });
  f.lowB = writeBook(path.join(dir, 'lowB.xlsx'), { S: mk(4000, 'w') });
  return f;
}
function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'revdiff-')); }

/* ---------- 瀏覽器 ---------- */
async function launch() { return chromium.launch(); }
/* opts: locale、colorScheme、noWorker（Worker 一建立就丟錯）、brokenWorker（建立成功但啟動即出錯） */
async function openApp(browser, opts = {}) {
  const ctx = await browser.newContext({ locale: opts.locale || 'en-US', colorScheme: opts.colorScheme || 'dark', viewport: { width: 1300, height: 800 }, acceptDownloads: true });
  if (opts.noWorker) await ctx.addInitScript(() => { window.Worker = function () { throw new Error('no worker'); }; });
  if (opts.brokenWorker) await ctx.addInitScript(() => { const W = window.Worker; window.Worker = function () { return new W('data:text/javascript,throw new Error("boom")'); }; });
  ctx.setDefaultTimeout(30000);   // 失敗時盡快回報，不要卡住整個測試
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(APP_URL);
  return { ctx, page, errors };
}
const WAIT = 20000;   // 一般操作的等待上限；大量資料的案例另外傳入較長的 timeout
const idle = (page, timeout = WAIT) => page.waitForFunction(() => document.querySelector('#busy').hidden, null, { timeout });

/* 依序載入 A、B（和實際操作一致；B 會依 A 的工作表名稱預選同名工作表） */
async function loadFiles(page, a, b) {
  await page.setInputFiles('#fileA', a);
  await page.waitForFunction(() => S.A.rows && document.querySelector('#busy').hidden, null, { timeout: WAIT });
  await page.setInputFiles('#fileB', b);
  await page.waitForFunction(() => S.B.rows && document.querySelector('#busy').hidden, null, { timeout: WAIT });
}
const box = (page, kind, col) => page.locator(`#cfgTable input[data-k="${kind}"][data-c="${col}"]`);
/* keys: 要勾選的 Key 欄；qty: 要勾選的數量欄；其餘欄位「比對」全選 */
async function setup(page, { keys, qty = [], suggest = false }) {
  if (suggest) await page.click('#btnSuggest');
  for (const c of keys || []) await box(page, 'key', c).check();
  await page.locator('#cfgTable a[data-act="all"][data-k="cmp"]').click();
  for (const c of qty) await box(page, 'qty', c).check();
}
/* 按「套用」並等到出結果；比對出錯（頁面顯示錯誤訊息）時立刻失敗並附上訊息 */
async function apply(page, timeout = WAIT) {
  await page.click('#btnApply');
  await page.waitForFunction(() => document.querySelector('#busy').hidden, null, { timeout });
  const err = page.locator('#msg .warn.err');
  if (await err.count()) throw new Error('compare failed: ' + (await err.innerText()));
  await page.waitForFunction(() => R && !document.querySelector('#sumCard').hidden, null, { timeout: 5000 });
}
async function compareDemo(page, qty = []) {
  await loadFiles(page, DEMO_A, DEMO_B);
  await setup(page, { suggest: true, qty });
  await apply(page);
}
const counts = page => page.evaluate(() => R.counts);

/* ---------- 讀回匯出檔 ---------- */
function readStoredZip(buf) {
  const files = {};
  let o = 0;
  while (buf.readUInt32LE(o) === 0x04034b50) {
    const method = buf.readUInt16LE(o + 8), size = buf.readUInt32LE(o + 18), nl = buf.readUInt16LE(o + 26), el = buf.readUInt16LE(o + 28);
    if (method !== 0) throw new Error('expected a stored (uncompressed) zip entry');
    const name = buf.toString('utf8', o + 30, o + 30 + nl);
    files[name] = buf.toString('utf8', o + 30 + nl + el, o + 30 + nl + el + size);
    o += 30 + nl + el + size;
  }
  return files;
}
const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/* 解析 sheetN.xml：回傳 { rows: [ [ {v, s, num} ... ] ] }（以欄位順序排列） */
function parseSheet(xml) {
  const rows = [];
  for (const rm of xml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+" s="(\d+)"( t="inlineStr")?>(?:<is><t[^>]*>(.*?)<\/t><\/is>|<v>(.*?)<\/v>)<\/c>/g)) {
      let col = 0; for (const ch of cm[1]) col = col * 26 + ch.charCodeAt(0) - 64;
      row[col - 1] = cm[3] ? { v: unxml(cm[4]), s: +cm[2], num: false } : { v: +cm[5], s: +cm[2], num: true };
    }
    rows[+rm[1] - 1] = row;
  }
  return rows;
}
async function exportBook(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExport')]);
  const file = await dl.path();
  const zip = readStoredZip(fs.readFileSync(file));
  const names = [...zip['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map(m => unxml(m[1]));
  return { filename: dl.suggestedFilename(), names, zip, sheet: i => parseSheet(zip[`xl/worksheets/sheet${i}.xml`]) };
}

function python() {
  for (const c of ['python3', 'python']) { try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return c; } catch (e) { /* 試下一個 */ } }
  throw new Error('python not found');
}
module.exports = { ROOT, APP_URL, DEMO_A, DEMO_B, XLSX, makeFixtures, tmpDir, writeBook, launch, openApp, idle, loadFiles, box, setup, apply, compareDemo, counts, exportBook, python, execFileSync };
