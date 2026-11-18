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
  test('色系選單：列出所有色系並標出目前的；選了立刻套用、記住；左半邊仍只切亮暗', async () => {
    const { ctx, page } = await app();
    const attrs = p => p.evaluate(() => ({ theme: document.documentElement.dataset.theme, palette: document.documentElement.dataset.palette }));
    assert.deepEqual(await attrs(page), { theme: 'dark', palette: 'default' });
    assert.equal(await page.locator('#paletteMenu').isHidden(), true);
    await page.click('#paletteBtn');
    assert.equal(await page.getAttribute('#paletteBtn', 'aria-expanded'), 'true');
    const ids = await page.evaluate(() => PALETTES);
    assert.equal(ids[0], 'default');
    assert.deepEqual(await page.$$eval('#paletteMenu [role="menuitemradio"]', b => b.map(x => [x.dataset.p, x.getAttribute('aria-checked')])), ids.map((id, i) => [id, i === 0 ? 'true' : 'false']));
    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click('#paletteMenu [data-p="barbie"]');
    assert.deepEqual(await attrs(page), { theme: 'dark', palette: 'barbie' });
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), before);
    assert.equal(await page.locator('#paletteMenu').isHidden(), true, '選了就關閉');
    await page.click('#themeBtn');
    assert.deepEqual(await attrs(page), { theme: 'light', palette: 'barbie' }, '左半邊只切亮暗，色系不變');
    const again = await ctx.newPage();
    await again.goto(H.APP_URL);
    assert.deepEqual(await attrs(again), { theme: 'light', palette: 'barbie' }, '兩個選擇都會被記住');
  });
  test('色系選單：Esc 與點選單外面都會關閉；方向鍵可操作', async () => {
    const { page } = await app();
    await page.click('#paletteBtn');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#paletteMenu').isHidden(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'paletteBtn', 'Esc 後焦點回到按鈕');
    await page.click('#paletteBtn');
    await page.mouse.click(5, 400);
    assert.equal(await page.locator('#paletteMenu').isHidden(), true, '點外面關閉');
    await page.focus('#paletteBtn');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#paletteMenu').isHidden(), false, '方向鍵下可開啟');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.p), 'default', '焦點落在目前的色系');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.p), 'barbie');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.palette), 'barbie');
    assert.equal(await page.locator('#paletteMenu').isHidden(), true);
  });
  test('儲存的主題或色系無效時退回暗色與預設', async () => {
    const { page } = await app();
    await page.evaluate(() => { localStorage.setItem('revdiff-theme', 'neon'); localStorage.setItem('revdiff-palette', 'nope'); });
    await page.reload();
    assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.theme, document.documentElement.dataset.palette]), ['dark', 'default']);
  });
  test('每個色系在亮、暗兩種模式下，新增／刪除／修改的底色都彼此不同', async () => {
    const { page } = await app();
    for (const palette of await page.evaluate(() => PALETTES)) {
      for (const theme of ['dark', 'light']) {
        const v = await page.evaluate(([p, t]) => {
          const r = document.documentElement; r.dataset.palette = p; r.dataset.theme = t;
          const g = n => getComputedStyle(r).getPropertyValue(n).trim();
          return [g('--add'), g('--del'), g('--mod'), g('--panel')];
        }, [palette, theme]);
        assert.equal(new Set(v).size, 4, `${palette}/${theme}：${v.join(' ')}`);
      }
    }
  });
  test('每個色系都有中英文名稱與色塊預覽', async () => {
    const { page } = await app();
    const r = await page.evaluate(() => PALETTES.map(id => [id, I18N.zh['pal_' + id], I18N.en['pal_' + id]]));
    for (const [id, zh, en] of r) { assert.ok(zh && en, `${id} 缺中文或英文名稱`); }
    await page.click('#paletteBtn');
    const sw = await page.$$eval('#paletteMenu .sw', els => els.map(e => getComputedStyle(e).backgroundImage));
    assert.equal(sw.length, r.length);
    assert.ok(sw.every(x => x !== 'none'), '每個色系都要有 .sw-<id> 色塊：' + sw);
  });
  test('每個色系、每種模式的文字對比度都達標（文字／面板 ≥ 7、次要文字 ≥ 4.5、狀態色 ≥ 4.5、按鈕字 ≥ 3）', async () => {
    const { page } = await app();
    const bad = await page.evaluate(() => {
      const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
      const rgb = s => { s = s.trim(); if (s[0] === '#') { if (s.length === 4) s = '#' + [...s.slice(1)].map(x => x + x).join(''); return [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)); } return s.match(/[\d.]+/g).map(Number).slice(0, 3); };
      const cr = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      const out = [];
      for (const p of PALETTES) for (const t of ['dark', 'light']) {
        const r = document.documentElement; r.dataset.palette = p; r.dataset.theme = t;
        const g = n => getComputedStyle(r).getPropertyValue(n);
        for (const [name, fg, bg, min] of [['text/panel', '--text', '--panel', 7], ['muted/panel', '--muted', '--panel', 4.5], ['add', '--add-t', '--add', 4.5],
          ['del', '--del-t', '--del', 4.5], ['mod', '--mod-t', '--mod', 4.5], ['on-accent/accent', '--on-accent', '--accent', 3]]) {
          const v = cr(g(fg), g(bg));
          if (v < min) out.push(`${p}/${t} ${name} = ${v.toFixed(1)} (< ${min})`);
        }
      }
      return out;
    });
    assert.deepEqual(bad, []);
  });
  test('每個色系都能選取，重新整理後仍被記住（防止新增色系時漏改 <head> 的白名單）', async () => {
    const { page } = await app();
    const palettes = await page.evaluate(() => PALETTES);
    assert.ok(palettes.length >= 3);
    for (const id of palettes) {
      await page.click('#paletteBtn');
      await page.click(`#paletteMenu [data-p="${id}"]`);
      await page.reload();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.palette), id, id);
    }
  });
  test('霓虹色系有彩虹動畫；系統設為「減少動態」時全部關閉', async () => {
    const anim = p => p.evaluate(() => [getComputedStyle(document.querySelector('header h1')).animationName,
      getComputedStyle(document.querySelector('.card'), '::before').animationName,
      getComputedStyle(document.querySelector('.card h2 .step')).animationName]);
    const on = await app();
    await on.page.evaluate(() => { localStorage.setItem('revdiff-palette', 'neon'); });
    await on.page.reload();
    assert.ok((await anim(on.page)).every(n => n !== 'none'), '有動畫：' + (await anim(on.page)));
    const off = await app({ reducedMotion: 'reduce' });
    await off.page.evaluate(() => { localStorage.setItem('revdiff-palette', 'neon'); });
    await off.page.reload();
    assert.deepEqual(await anim(off.page), ['none', 'none', 'none']);
    const plain = await app();
    assert.deepEqual(await anim(plain.page), ['none', 'none', 'none'], '預設色系沒有動畫');
  });
  test('處理中遮罩跟著色系換樣式（芭比、霓虹各有專屬樣式，預設不變）', async () => {
    const { page } = await app();
    const look = pal => page.evaluate(p => {
      document.documentElement.dataset.palette = p; showBusy('x');
      const q = (s, pseudo) => getComputedStyle(document.querySelector(s), pseudo);
      const r = { radius: q('#busy .box').borderTopLeftRadius, titleFont: q('#busy .t').fontFamily, titleAnim: q('#busy .t').animationName,
                  thumbAnim: q('#busy .bar i').animationName, heart: q('#busy .box', '::before').content };
      hideBusy(); return r;
    }, pal);
    const base = await look('default'), barbie = await look('barbie'), neon = await look('neon');
    assert.equal(base.titleAnim, 'none');
    assert.equal(base.thumbAnim, 'slide', '預設的進度條動畫不變');
    assert.equal(barbie.radius, '28px');
    assert.match(barbie.titleFont, /Brush Script|Segoe Script|cursive/);
    assert.match(barbie.heart, /💖/);
    assert.notEqual(neon.titleAnim, 'none');
    assert.match(neon.thumbAnim, /neon-slide/);
    assert.notEqual(neon.radius, base.radius);
  });
  test('霓虹的處理中遮罩在「減少動態」下停止動畫，進度條改為滿版靜態', async () => {
    const { page } = await app({ reducedMotion: 'reduce' });
    const r = await page.evaluate(() => {
      document.documentElement.dataset.palette = 'neon'; showBusy('x');
      const bar = document.querySelector('#busy .bar').getBoundingClientRect().width, thumb = document.querySelector('#busy .bar i').getBoundingClientRect().width;
      const out = { titleAnim: getComputedStyle(document.querySelector('#busy .t')).animationName,
                    thumbAnim: getComputedStyle(document.querySelector('#busy .bar i')).animationName, full: Math.abs(bar - thumb) < 1 };
      hideBusy(); return out;
    });
    assert.deepEqual(r, { titleAnim: 'none', thumbAnim: 'none', full: true });
  });
  test('Win95 色系：立體凹凸邊框、方角、標題列、一格一格的進度條；減少動態時進度條靜態', async () => {
    const look = async opts => {
      const { page } = await app(opts);
      return page.evaluate(() => {
        document.documentElement.dataset.palette = 'win95';
        const q = (s, ps) => getComputedStyle(document.querySelector(s), ps);
        const card = q('.card');
        const out = { raised: card.borderTopColor !== card.borderBottomColor, radius: [card.borderTopLeftRadius, q('button.primary').borderTopLeftRadius],
                      title: q('.card h2').backgroundImage.includes('linear-gradient'), icon: q('header h1', '::before').content };
        showBusy('x');
        out.box = q('#busy .box').borderTopLeftRadius; out.bar = q('#busy .bar i').backgroundImage.includes('repeating-linear-gradient');
        out.busyTitle = q('#busy .t', '::before').content; out.anim = q('#busy .bar i').animationName;
        const bar = document.querySelector('#busy .bar'), thumb = document.querySelector('#busy .bar i');
        out.full = thumb.getBoundingClientRect().width >= bar.getBoundingClientRect().width - 9;
        hideBusy(); return out;
      });
    };
    const on = await look();
    assert.equal(on.raised, true, '凸起邊框（亮邊與暗邊不同色）');
    assert.deepEqual(on.radius, ['0px', '0px']);
    assert.equal(on.title, true);
    assert.match(on.icon, /🖥/);
    assert.equal(on.box, '0px');
    assert.equal(on.bar, true);
    assert.match(on.busyTitle, /⌛/);
    assert.equal(on.anim, 'slide');
    const off = await look({ reducedMotion: 'reduce' });
    assert.equal(off.anim, 'none');
    assert.equal(off.full, true);
  });
  test('珍珠奶茶色系：圓角杯身、珍珠徽章、一串珍珠的進度條；減少動態時進度條靜態', async () => {
    const look = async opts => {
      const { page } = await app(opts);
      return page.evaluate(() => {
        document.documentElement.dataset.palette = 'boba';
        const q = (s, ps) => getComputedStyle(document.querySelector(s), ps);
        const out = { radius: q('.card').borderTopLeftRadius, pearl: q('.card h2 .step').backgroundImage.includes('radial-gradient'), icon: q('header h1', '::before').content };
        showBusy('x');
        out.box = q('#busy .box').borderTopLeftRadius; out.bar = q('#busy .bar i').backgroundImage.includes('radial-gradient');
        out.busyTitle = q('#busy .t', '::before').content; out.anim = q('#busy .bar i').animationName;
        const bar = document.querySelector('#busy .bar'), thumb = document.querySelector('#busy .bar i');
        out.full = thumb.getBoundingClientRect().width >= bar.getBoundingClientRect().width - 5;
        hideBusy(); return out;
      });
    };
    const on = await look();
    assert.equal(on.radius, '24px');
    assert.equal(on.pearl, true);
    assert.match(on.icon, /🥤/);
    assert.equal(on.box, '26px');
    assert.equal(on.bar, true);
    assert.match(on.busyTitle, /🥤/);
    assert.equal(on.anim, 'slide');
    const off = await look({ reducedMotion: 'reduce' });
    assert.equal(off.anim, 'none');
    assert.equal(off.full, true);
  });
  test('太空銀河色系：星空閃爍、火箭飛過進度條；減少動態時全部停止、進度條靜態', async () => {
    const look = async opts => {
      const { page } = await app(opts);
      return page.evaluate(() => {
        document.documentElement.dataset.palette = 'space';
        const q = (s, ps) => getComputedStyle(document.querySelector(s), ps);
        const out = { stars: q('body', '::before').animationName, starImg: q('body', '::before').backgroundImage.includes('radial-gradient'),
                      bar: q('.card', '::before').backgroundImage.includes('linear-gradient'), icon: q('header h1', '::before').content };
        showBusy('x');
        out.rocket = q('#busy .bar i', '::after').content; out.anim = q('#busy .bar i').animationName; out.busyTitle = q('#busy .t', '::before').content;
        const bar = document.querySelector('#busy .bar'), thumb = document.querySelector('#busy .bar i');
        out.full = thumb.getBoundingClientRect().width >= bar.getBoundingClientRect().width - 2;
        hideBusy(); return out;
      });
    };
    const on = await look();
    assert.equal(on.stars, 'space-twinkle');
    assert.equal(on.starImg, true);
    assert.equal(on.bar, true);
    assert.match(on.icon, /🚀/);
    assert.match(on.rocket, /🚀/);
    assert.equal(on.anim, 'slide');
    assert.match(on.busyTitle, /🌌/);
    const off = await look({ reducedMotion: 'reduce' });
    assert.equal(off.stars, 'none');
    assert.equal(off.anim, 'none');
    assert.equal(off.full, true);
  });
  test('過年紅包色系：金邊雙框、燈籠與紅包裝飾、標題金色流光、金幣進度條；減少動態時全部靜態', async () => {
    const look = async opts => {
      const { page } = await app(opts);
      return page.evaluate(() => {
        document.documentElement.dataset.palette = 'hongbao';
        const q = (s, ps) => getComputedStyle(document.querySelector(s), ps);
        const out = { rings: q('.card').boxShadow !== 'none', shimmer: q('header h1').animationName, lantern: q('header h1', '::before').content, envelope: q('.card h2', '::after').content };
        showBusy('x');
        out.lanterns = [q('#busy .box', '::before').content, q('#busy .box', '::after').content]; out.busyTitle = q('#busy .t', '::before').content;
        out.coins = q('#busy .bar i').backgroundImage.includes('radial-gradient'); out.anim = q('#busy .bar i').animationName;
        const bar = document.querySelector('#busy .bar'), thumb = document.querySelector('#busy .bar i');
        out.full = thumb.getBoundingClientRect().width >= bar.getBoundingClientRect().width - 5;
        hideBusy(); return out;
      });
    };
    const on = await look();
    assert.equal(on.rings, true);
    assert.notEqual(on.shimmer, 'none');
    assert.match(on.lantern, /🏮/);
    assert.match(on.envelope, /🧧/);
    assert.deepEqual(on.lanterns.map(x => /🏮/.test(x)), [true, true]);
    assert.match(on.busyTitle, /🧧/);
    assert.equal(on.coins, true);
    assert.equal(on.anim, 'slide');
    const off = await look({ reducedMotion: 'reduce' });
    assert.equal(off.shimmer, 'none');
    assert.equal(off.anim, 'none');
    assert.equal(off.full, true);
  });
  test('股市色系：淺色＝漲停（綠、上升）、深色＝跌停（紅、下降）；國際慣例綠漲紅跌，新增綠、刪除紅；鎖死標籤', async () => {
    const { page } = await app();
    const out = await page.evaluate(() => {
      const r = document.documentElement; r.dataset.palette = 'stock';
      const rgb = s => { s = s.trim(); if (s.length === 4) s = '#' + [...s.slice(1)].map(x => x + x).join(''); return [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)); };
      const res = {};
      for (const mode of ['light', 'dark']) {
        r.dataset.theme = mode; r.lang = 'zh-Hant';
        const g = n => getComputedStyle(r).getPropertyValue(n);
        const pill = () => getComputedStyle(document.querySelector('header h1'), '::after');
        res[mode] = { accent: rgb(g('--accent')), add: rgb(g('--add-t')), del: rgb(g('--del-t')), pill: pill().content, blink: pill().animationName,
                      icon: getComputedStyle(document.querySelector('header h1'), '::before').content, bars: getComputedStyle(document.querySelector('.card h2'), '::after').content };
        r.lang = 'en'; res[mode].pillEn = pill().content; r.lang = 'zh-Hant';
      }
      return res;
    });
    assert.ok(out.light.accent[1] > out.light.accent[0] * 2, '淺色（漲停）的主色是綠色：' + out.light.accent);
    assert.ok(out.dark.accent[0] > out.dark.accent[1] * 2, '深色（跌停）的主色是紅色：' + out.dark.accent);
    for (const m of ['light', 'dark']) {
      assert.ok(out[m].add[1] > out[m].add[0], `${m}：新增（漲）是綠色系`);
      assert.ok(out[m].del[0] > out[m].del[1], `${m}：刪除（跌）是紅色系`);
    }
    assert.match(out.light.pill, /漲停/); assert.match(out.dark.pill, /跌停/);
    assert.match(out.light.pillEn, /LIMIT UP/); assert.match(out.dark.pillEn, /LIMIT DOWN/);
    assert.match(out.light.icon, /📈/); assert.match(out.dark.icon, /📉/);
    assert.notEqual(out.light.bars, out.dark.bars, '上升與下降的 K 棒圖樣不同');
    assert.equal(out.light.blink, 'stock-lock');
    const off = await app({ reducedMotion: 'reduce' });
    assert.equal(await off.page.evaluate(() => { document.documentElement.dataset.palette = 'stock'; return getComputedStyle(document.querySelector('header h1'), '::after').animationName; }), 'none');
  });
  test('股市色系的處理中遮罩：8 根 K 棒依序長出來；減少動態時直接顯示完整 K 線', async () => {
    const probe = async (mode, opts) => {
      const { page } = await app(opts);
      await page.evaluate(m => { document.documentElement.dataset.palette = 'stock'; document.documentElement.dataset.theme = m; showBusy('x'); }, mode);
      const read = () => page.evaluate(() => {
        const i = document.querySelector('#busy .bar i'), cs = getComputedStyle(i);
        return { p: parseFloat(cs.getPropertyValue('--p')), anim: cs.animationName, layers: (cs.backgroundImage.match(/linear-gradient\(/g) || []).length, posY: cs.backgroundPositionY, icon: getComputedStyle(document.querySelector('#busy .t'), '::before').content };
      });
      const samples = [await read()];
      for (let n = 0; n < 3; n++) { await page.waitForTimeout(400); samples.push(await read()); }
      return samples;
    };
    const up = await probe('light'), down = await probe('dark');
    for (const sm of [up, down]) {
      assert.equal(sm[0].anim, 'stock-chart');
      assert.equal(sm[0].layers, 16, '8 根 K 棒，每根一個實體加一條影線');
      assert.ok(sm.every(x => x.p >= 0 && x.p <= 8), '進度 --p 在 0 到 8 之間');
      assert.ok(new Set(sm.map(x => x.p)).size > 2, '--p 隨時間變化（K 棒一根根長出來）：' + sm.map(x => x.p.toFixed(1)));
    }
    assert.match(up[0].icon, /📈/); assert.match(down[0].icon, /📉/);
    const still = await probe('dark', { reducedMotion: 'reduce' });
    assert.ok(still.every(x => x.anim === 'none' && x.p === 8), '減少動態：不動，且 8 根全部顯示');
  });
  test('股市色系的 K 線走勢：漲停＝前三根緩跌 1～3%、第 4 根大漲約 10%、之後又緩跌；跌停完全相反；開盤＝前一根收盤', async () => {
    const { page } = await app();
    const chart = mode => page.evaluate(m => {
      document.documentElement.dataset.palette = 'stock'; document.documentElement.dataset.theme = m; showBusy('x');
      const i = document.querySelector('#busy .bar i'); i.style.animation = 'none'; i.style.setProperty('--p', '8');
      const cs = getComputedStyle(i), root = getComputedStyle(document.documentElement);
      const hex = x => [1, 3, 5].map(k => parseInt(x.trim().slice(k, k + 2), 16)).join(',');
      const up = hex(root.getPropertyValue('--up')), down = hex(root.getPropertyValue('--down'));
      const cols = [...cs.backgroundImage.matchAll(/linear-gradient\(rgb\((\d+), (\d+), (\d+)\)/g)].map(x => x.slice(1, 4).join(','));
      const sizes = cs.backgroundSize.split(', ').map(x => parseFloat(x.split(' ')[1]));
      const posY = cs.backgroundPositionY.split(', ').map(x => parseFloat(x.match(/- ([\d.]+)px/)[1]));
      hideBusy();
      return [...Array(8).keys()].map(k => {
        const dir = cols[2 * k] === up ? 'up' : cols[2 * k] === down ? 'down' : '?', h = sizes[2 * k], yb = posY[2 * k];
        return { dir, pct: h / 3.4, open: dir === 'up' ? yb : yb + h, close: dir === 'up' ? yb + h : yb };
      });
    }, mode);
    for (const [mode, dirs] of [['light', ['down', 'down', 'down', 'up', 'down', 'down', 'down', 'down']], ['dark', ['up', 'up', 'up', 'down', 'up', 'up', 'up', 'up']]]) {
      const c = await chart(mode);
      assert.deepEqual(c.map(x => x.dir), dirs, `${mode} 的漲跌方向`);
      c.forEach((x, k) => {
        if (k === 3) assert.ok(x.pct >= 8 && x.pct <= 11, `${mode} 第 4 根約 10%：${x.pct.toFixed(1)}`);
        else assert.ok(x.pct >= 1 && x.pct <= 3.05, `${mode} 第 ${k + 1} 根緩漲跌 1～3%：${x.pct.toFixed(2)}`);
      });
      for (let k = 0; k < 7; k++) assert.ok(Math.abs(c[k].close - c[k + 1].open) <= 0.35, `${mode}：第 ${k + 2} 根的開盤要接在第 ${k + 1} 根的收盤`);
    }
  });
  test('語言切換後，色系選單與提示文字一起換', async () => {
    const { page } = await app({ locale: 'en-US' });
    await page.click('#paletteBtn');
    assert.match(await page.locator('#paletteMenu').innerText(), /Dreamy Barbie/);
    await page.keyboard.press('Escape');
    await page.click('#langBtn');
    await page.click('#paletteBtn');
    assert.match(await page.locator('#paletteMenu').innerText(), /夢幻芭比/);
    assert.equal(await page.getAttribute('#paletteBtn', 'title'), '選擇色系');
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
