'use strict';
/* 端對端測試：用真正的瀏覽器開啟 index.html 操作。執行：npm test
   新增功能時請順手補一個案例；測試檔在 before() 當場產生，不放二進位檔進 repo。 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('./helpers');

let browser, dir, F;
const opened = [];
async function app(opts) { const a = await H.openApp(browser, opts); opened.push(a.ctx); return a; }

before(async () => { dir = H.tmpDir(); F = H.makeFixtures(dir); browser = await H.launch(); });
after(async () => { for (const c of opened) await c.close().catch(() => {}); await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const DEMO = { add: 2, del: 1, mod: 2, same: 2 };
const SYNTH_KEYS = ['LINE NO.', 'IDENT CODE', 'SIZE-1', 'SIZE-2'];

describe('建置與語法', () => {
  test('index.html 與 template／VERSION／SheetJS 的建置結果一致', () => {
    H.execFileSync(H.python(), ['src/build.py', '--check'], { cwd: H.ROOT, stdio: 'pipe' });
  });
  test('應用程式碼語法正確（最後一個 <script>）', () => {
    const s = fs.readFileSync(path.join(H.ROOT, 'index.html'), 'utf8');
    const i = s.lastIndexOf('<script>');
    assert.ok(i > 0);
    new Function(s.slice(i + 8, s.indexOf('</script>', i)));
  });
  test('標題旁顯示的版本號等於 src/VERSION', async () => {
    const { page } = await app();
    const v = fs.readFileSync(path.join(H.ROOT, 'src', 'VERSION'), 'utf8').trim();
    assert.equal(await page.locator('header .ver').innerText(), 'v' + v);
  });
});

describe('範例檔比對（核心結果）', () => {
  test('新增 2／刪除 1／修改 2／未變 2，使用 Worker、無錯誤', async () => {
    const { page, errors } = await app();
    await H.compareDemo(page);
    assert.deepEqual(await H.counts(page), DEMO);
    assert.equal(await page.evaluate(() => !!worker && !workerFailed), true);
    assert.deepEqual(errors, []);
  });
  test('「建議 Key」在範例檔選到 SKU', async () => {
    const { page } = await app();
    await H.loadFiles(page, H.DEMO_A, H.DEMO_B);
    await page.click('#btnSuggest');
    assert.deepEqual(await page.evaluate(() => [...draft.key]), ['SKU']);
  });
  test('備援：Worker 無法建立時結果相同', async () => {
    const { page, errors } = await app({ noWorker: true });
    await H.compareDemo(page);
    assert.deepEqual(await H.counts(page), DEMO);
    assert.equal(await page.evaluate(() => workerFailed), true);
    assert.deepEqual(errors, []);
  });
  test('備援：Worker 建立後才出錯時結果相同', async () => {
    const { page, errors } = await app({ brokenWorker: true });
    await H.compareDemo(page);
    assert.deepEqual(await H.counts(page), DEMO);
    assert.equal(await page.evaluate(() => workerFailed), true);
    assert.deepEqual(errors, []);
  });
});

describe('正規化、重複 Key、標題列、多工作表', () => {
  test('全形／大小寫／空白／10 與 10.0 視為相同，其餘差異都抓到', async () => {
    const { page, errors } = await app();
    await H.loadFiles(page, F.synthA, F.synthB);
    assert.equal(await page.inputValue('#hrA'), '3', '自動偵測標題列在第 3 列');
    assert.equal(await page.inputValue('#sheetB'), 'MTO', '兩檔工作表同名時自動選同一張');
    await H.setup(page, { keys: SYNTH_KEYS, qty: ['QTY'] });
    await H.apply(page);
    assert.deepEqual(await H.counts(page), { add: 2, del: 1, mod: 3, same: 5 });
    assert.deepEqual(await page.evaluate(() => R.colCount), { QTY: 2, NOTE: 1 });
    const status = code => page.evaluate(c => R.entries.filter(e => (e.b || e.a).v['IDENT CODE'] === c || (e.b && e.b.v['IDENT CODE'] === c)).map(e => e.status), code);
    assert.deepEqual(await status('abc1'), ['same'], '全形與大小寫');
    assert.deepEqual(await status('P5'), ['same'], '"10" 對數字 10');
    assert.deepEqual(await status('P8'), ['same'], '前後空白與大小寫');
    assert.deepEqual(await status('P3'), ['del']);
    assert.deepEqual(errors, []);
  });
  test('重複 Key 有警告、預設收折、不會被略過', async () => {
    const { page } = await app();
    await H.loadFiles(page, F.synthA, F.synthB);
    await H.setup(page, { keys: SYNTH_KEYS });
    await H.apply(page);
    assert.deepEqual(await page.evaluate(() => [R.dups.A.length, R.dups.B.length]), [1, 2]);
    const opens = await page.$$eval('#warns details', ds => ds.map(d => d.open));
    assert.ok(opens.length >= 3);
    assert.ok(opens.every(o => o === false), '警告預設全部收折');
    assert.equal(await page.evaluate(() => R.entries.length), 11, '重複的列都要出現在結果中');
  });
  test('Key 區分度很低時不會卡死，並顯示紅色警告', async () => {
    const { page } = await app();
    await H.loadFiles(page, F.lowA, F.lowB);
    await page.locator('#cfgTable input[data-k="key"][data-c="K"]').check();
    await page.locator('#cfgTable a[data-act="all"][data-k="cmp"]').click();
    const t0 = Date.now();
    await H.apply(page, 90000);
    assert.ok(Date.now() - t0 < 60000, '應在 60 秒內完成');
    assert.ok(await page.evaluate(() => R.byOrder) > 0, '同 Key 太多的列改依順序配對');
    assert.ok(await page.locator('#warns details.err').count() >= 1);
  });
  test('資料欄位沒有常見名稱時，「建議 Key」會選出唯一欄位', async () => {
    const { page } = await app();
    await H.loadFiles(page, F.lowA, F.lowB);
    await page.click('#btnSuggest');
    assert.deepEqual(await page.evaluate(() => [...draft.key]), ['V']);
  });
});

describe('數量差值', () => {
  async function ready() {
    const a = await app();
    await H.loadFiles(a.page, F.synthA, F.synthB2);
    await H.setup(a.page, { keys: SYNTH_KEYS, qty: ['QTY'] });
    await H.apply(a.page);
    return a;
  }
  const shownCount = page => page.evaluate(() => shown.length);
  test('差值欄、篩選、合計、排序', async () => {
    const { page } = await ready();
    assert.ok((await page.$$eval('#tw thead th', t => t.map(x => x.innerText))).some(x => x.startsWith('QTY delta')));
    for (const [mode, n] of [['inc', 2], ['dec', 1], ['chg', 3], ['zero', 5], ['all', 11]]) {
      await page.click(`#dmodes [data-d="${mode}"]`);
      assert.equal(await shownCount(page), n, mode);
    }
    assert.match(await page.locator('#dsum').innerText(), /\+8/);
    await page.click('#tw th.dth');   // 由大到小
    const first = await page.$$eval('#tw tbody tr:first-child td.dlt', t => t.map(x => x.innerText));
    assert.equal(first[0], '+7');
  });
  test('數量欄儲存格只顯示「舊 → 新」，不再有 +N 標籤', async () => {
    const { page } = await ready();
    assert.equal(await page.locator('#tw td.chg .dl').count(), 0);
    assert.match(await page.locator('#tw td.chg').first().innerText(), /12\s*→\s*15/);
  });
});

describe('比對設定的操作', () => {
  test('載入後什麼都不勾、也不會自動比對', async () => {
    const { page } = await app();
    await H.loadFiles(page, F.synthA, F.synthB);
    assert.equal(await page.locator('#cfgTable input:checked').count(), 0);
    assert.equal(await page.locator('#btnApply').isDisabled(), true);
    assert.equal(await page.locator('#sumCard').isHidden(), true);
    await page.locator('#cfgTable input[data-k="key"][data-c="IDENT CODE"]').check();
    assert.equal(await page.locator('#sumCard').isHidden(), true, '勾選本身不會觸發比對');
    assert.equal(await page.locator('#btnApply').isDisabled(), false);
  });
  test('勾「數量」會鎖定並勾選「比對」，取消後解除鎖定', async () => {
    const { page } = await app();
    await H.loadFiles(page, F.synthA, F.synthB);
    await H.box(page, 'qty', 'QTY').check();
    assert.equal(await H.box(page, 'cmp', 'QTY').isChecked(), true);
    assert.equal(await H.box(page, 'cmp', 'QTY').isDisabled(), true);
    await page.locator('#cfgTable a[data-act="none"][data-k="cmp"]').click();
    assert.equal(await H.box(page, 'cmp', 'QTY').isChecked(), true, '批次清除不會動到數量欄');
    await H.box(page, 'qty', 'QTY').uncheck();
    assert.equal(await H.box(page, 'cmp', 'QTY').isDisabled(), false);
    assert.equal(await H.box(page, 'cmp', 'QTY').isChecked(), true);
  });
  test('套用後再修改設定，會顯示「尚未套用」', async () => {
    const { page } = await app();
    await H.compareDemo(page);
    assert.equal(await page.locator('#pend').innerText(), '');
    await H.box(page, 'qty', 'Qty').check();
    assert.match(await page.locator('#pend').innerText(), /not applied/i);
  });
});

describe('檔案格式與壞檔', () => {
  for (const ext of ['xlsx', 'xlsm', 'xlsb', 'xls', 'ods', 'fods', 'csv', 'xml']) {
    test(`可讀取 .${ext}（含中文與全形字）`, async () => {
      const { page } = await app();
      await page.setInputFiles('#fileA', F.formats[ext]);
      await page.waitForFunction(() => S.A.rows && document.querySelector('#busy').hidden);
      const rows = await page.evaluate(() => S.A.rows.map(r => Object.values(r.v).join('|')));
      assert.deepEqual(rows, ['A001|螺栓 Bolt|10|1.5', 'A002|螺帽 Nut|20|0.8', 'A003|ＡＢＣ全形|5|2']);
    });
  }
  test('不是試算表的檔案會被擋下並顯示訊息，不影響頁面', async () => {
    for (const name of Object.keys(F.bad)) {
      const { page, errors } = await app();
      await page.setInputFiles('#fileA', F.bad[name]);
      await page.waitForFunction(() => document.querySelector('#busy').hidden);
      assert.ok(await page.locator('#msg .warn.err').count() === 1, name);
      assert.equal(await page.evaluate(() => !!S.A.rows), false, name);
      assert.deepEqual(errors, [], name);
    }
  });
  test('純文字 csv 與 html 版 xls 可以讀', async () => {
    for (const name of Object.keys(F.okText)) {
      const { page } = await app();
      await page.setInputFiles('#fileA', F.okText[name]);
      await page.waitForFunction(() => S.A.rows && document.querySelector('#busy').hidden);
      assert.equal(await page.evaluate(() => S.A.rows.length), 1, name);
    }
  });
});

describe('語言與主題', () => {
  test('預設語言跟隨瀏覽器，切換後記住，已出現的結果與訊息一起換', async () => {
    const { ctx, page } = await app({ locale: 'zh-TW' });
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'zh-Hant');
    assert.equal(await page.locator('#langCode').innerText(), 'EN');
    await page.setInputFiles('#fileA', F.bad['fake.xlsx']);
    await page.waitForFunction(() => document.querySelector('#busy').hidden);
    assert.match(await page.locator('#msg').innerText(), /不是有效的 Excel/);
    await H.compareDemo(page);
    assert.match(await page.locator('#stats').innerText(), /新增/);
    await page.click('#langBtn');
    assert.match(await page.locator('#stats').innerText(), /Added/);
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    const again = await ctx.newPage();
    await again.goto(H.APP_URL);
    assert.equal(await again.evaluate(() => document.documentElement.lang), 'en', '選擇會被記住');
  });
  test('英文瀏覽器預設英文；錯誤訊息切換語言後重新產生', async () => {
    const { page } = await app({ locale: 'en-US' });
    assert.equal(await page.locator('#langCode').innerText(), '中文');
    await page.setInputFiles('#fileA', F.bad['fake.xlsx']);
    await page.waitForFunction(() => document.querySelector('#busy').hidden);
    assert.match(await page.locator('#msg').innerText(), /not a valid Excel/);
    await page.click('#langBtn');
    assert.match(await page.locator('#msg').innerText(), /不是有效的 Excel/);
  });
  test('主題預設暗色（不跟隨作業系統），可切換並記住', async () => {
    const { ctx, page } = await app({ colorScheme: 'light' });
    const theme = p => p.evaluate(() => document.documentElement.dataset.theme);
    assert.equal(await theme(page), 'dark');
    const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click('#themeBtn');
    assert.equal(await theme(page), 'light');
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), dark);
    const again = await ctx.newPage();
    await again.goto(H.APP_URL);
    assert.equal(await theme(again), 'light', '選擇會被記住');
  });
  test('標題列捲動時固定在最上方', async () => {
    const { page } = await app();
    await H.compareDemo(page);
    await page.evaluate(() => window.scrollTo(0, 600));
    assert.equal(await page.evaluate(() => Math.round(document.querySelector('header').getBoundingClientRect().top)), 0);
  });
});

describe('匯出 .xlsx', () => {
  test('內容、顏色樣式、差值數字欄、摘要工作表（英文介面）', async () => {
    const { page } = await app();
    await H.compareDemo(page, ['Qty']);
    const book = await H.exportBook(page);
    assert.match(book.filename, /^compare_result_\d{8}_\d{4}\.xlsx$/);
    assert.deepEqual(book.names, ['Result', 'Summary']);
    const rows = book.sheet(1);
    const head = rows[0].map(c => c.v);
    assert.deepEqual(head.slice(0, 4), ['Status', 'Changed columns', 'Row A', 'Row B']);
    const col = name => head.indexOf(name);
    const body = rows.slice(1);
    assert.deepEqual(body.map(r => r[0].v), ['Modified', 'Unchanged', 'Deleted', 'Unchanged', 'Modified', 'Added', 'Added']);
    const STY = { add: 2, del: 3, mod: 4 };
    assert.equal(body[0][0].s, STY.mod);
    assert.ok(body[2].every(c => !c || c.s === STY.del), '刪除列整列紅色');
    assert.ok(body[5].every(c => !c || c.s === STY.add), '新增列整列綠色');
    assert.equal(body[0][col('Qty')].v, '100 → 120');
    assert.equal(body[0][col('Qty')].s, STY.mod);
    const d = col('Qty delta');
    assert.ok(d > 0);
    assert.deepEqual(body.map(r => (r[d] ? r[d].v : '')), [20, 0, '', 0, 0, '', ''], '差值是數字，新增／刪除列留空');
    assert.ok(body[0][d].num, '差值寫成數字儲存格');
    const sum = book.sheet(2).map(r => r.map(c => c && c.v));
    assert.deepEqual(sum.slice(4, 8).map(r => r[1]), [2, 1, 2, 2]);
    assert.ok(book.zip['xl/worksheets/sheet1.xml'].includes('<autoFilter'));
    assert.ok(book.zip['xl/worksheets/sheet1.xml'].includes('state="frozen"'));
  });
  test('匯出標籤跟隨介面語言（中文）', async () => {
    const { page } = await app({ locale: 'zh-TW' });
    await H.compareDemo(page);
    const book = await H.exportBook(page);
    assert.deepEqual(book.names, ['比對結果', '摘要']);
    assert.equal(book.sheet(1)[1][0].v, '修改');
  });
  test('「僅匯出目前篩選結果」只輸出篩選後的列', async () => {
    const { page } = await app();
    await H.compareDemo(page);
    await page.click('#fchips [data-s="add"]');
    await page.check('#expFiltered');
    const book = await H.exportBook(page);
    assert.equal(book.sheet(1).length, 3, '標題 + 2 筆新增');
  });
});
