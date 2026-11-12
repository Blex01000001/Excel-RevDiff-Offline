'use strict';
/* 效能測試（不含在 npm test）：npm run perf
   產生 3 萬列 vs 5 萬列、33 欄的資料，量測讀檔、比對的時間，以及畫面（主執行緒）最長的停頓。
   時間會隨機器而變，所以門檻放寬，只用來抓「明顯退步」；實際數字請看輸出。 */
const fs = require('fs');
const path = require('path');
const H = require('./helpers');

const BUDGET = { loadMs: 60000, applyMs: 30000, maxStallMs: 2000 };   // 超過就以非 0 結束
const COLS = ['LINE NO.', 'IDENT CODE', 'SIZE-1', 'SIZE-2', 'QTY', ...Array.from({ length: 28 }, (_, i) => 'COL' + i)];

function makeBig(file, n, mutate) {
  const rows = [COLS];
  for (let i = 0; i < n; i++) {
    const r = ['L' + Math.floor(i / 10), 'P' + i, String(i % 12), '', String((i * 7919) % 50 + 1), ...Array.from({ length: 28 }, (_, j) => `v${i}_${j}`)];
    if (mutate && i < 30000) { if (i % 50 === 0) r[4] = '999'; if (i % 97 === 0) r[10] = 'chg'; }
    rows.push(r);
  }
  H.writeBook(file, { Sheet1: rows });
}

(async () => {
  const dir = H.tmpDir();
  const result = { ok: true };
  try {
    const t0 = Date.now();
    makeBig(path.join(dir, 'A.xlsx'), 30000, false);
    makeBig(path.join(dir, 'B.xlsx'), 50000, true);
    console.log(`測試檔已產生（${((Date.now() - t0) / 1000).toFixed(1)} 秒）：A 3 萬列、B 5 萬列，各 ${COLS.length} 欄`);
    const mb = f => (fs.statSync(path.join(dir, f)).size / 1048576).toFixed(1) + ' MB';
    console.log(`檔案大小：A ${mb('A.xlsx')}、B ${mb('B.xlsx')}\n`);

    const browser = await H.launch();
    for (const mode of ['worker', 'fallback']) {
      const { page, errors, ctx } = await H.openApp(browser, { noWorker: mode === 'fallback' });
      ctx.setDefaultTimeout(240000);
      await page.evaluate(() => {   // 主執行緒心跳：最大間隔＝畫面凍結的最長時間
        window.__gap = 0; let last = performance.now();
        setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - last); last = n; }, 50);
      });
      const gap = () => page.evaluate(() => { const g = window.__gap; window.__gap = 0; return Math.round(g); });
      const step = async (label, fn) => { const s = Date.now(); await fn(); return { label, ms: Date.now() - s, stall: await gap() }; };
      const steps = [];
      steps.push(await step('讀取 A（3 萬列）', async () => {
        await page.setInputFiles('#fileA', path.join(dir, 'A.xlsx'));
        await page.waitForFunction(() => S.A.rows && document.querySelector('#busy').hidden, null, { timeout: 240000 });
      }));
      steps.push(await step('讀取 B（5 萬列）', async () => {
        await page.setInputFiles('#fileB', path.join(dir, 'B.xlsx'));
        await page.waitForFunction(() => S.B.rows && document.querySelector('#busy').hidden, null, { timeout: 240000 });
      }));
      await H.setup(page, { suggest: true, qty: ['QTY'] });
      await gap();
      steps.push(await step('套用並比對', () => H.apply(page, 240000)));
      const counts = await H.counts(page);
      const used = await page.evaluate(() => !!worker && !workerFailed);

      console.log(`[${mode}] Worker ${used ? '使用中' : '未使用'}`);
      for (const s of steps) console.log(`  ${s.label.padEnd(14)} ${String(s.ms).padStart(6)} ms　畫面最長停頓 ${String(s.stall).padStart(5)} ms`);
      console.log(`  結果 ${JSON.stringify(counts)}　頁面錯誤 ${errors.length}\n`);

      const expect = { add: 20000, del: 0, mod: 903, same: 29097 };
      const bad = [];
      if (JSON.stringify(counts) !== JSON.stringify(expect)) bad.push(`結果應為 ${JSON.stringify(expect)}`);
      if (errors.length) bad.push('頁面有錯誤：' + errors[0]);
      if ((mode === 'worker') !== used) bad.push('Worker 使用狀態不符預期');
      for (const s of steps) {
        const budget = s.label.startsWith('套用') ? BUDGET.applyMs : BUDGET.loadMs;
        if (s.ms > budget) bad.push(`${s.label} 耗時 ${s.ms} ms，超過 ${budget} ms`);
        if (mode === 'worker' && s.stall > BUDGET.maxStallMs) bad.push(`${s.label} 畫面停頓 ${s.stall} ms，超過 ${BUDGET.maxStallMs} ms`);
      }
      if (bad.length) { result.ok = false; console.log('  ✗ ' + bad.join('\n  ✗ ') + '\n'); }
      await ctx.close();
    }
    await browser.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(result.ok ? '效能測試通過' : '效能測試未通過');
  process.exit(result.ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
