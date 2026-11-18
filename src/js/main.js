/* ================= 主題切換（預設暗色） ================= */
/* 【本檔】主題與語言切換、啟動
   - 預設暗色主題、不跟隨作業系統；語言預設跟隨瀏覽器；都用 localStorage 記住（讀寫一律 try/catch）。
   - 主題 ＝ 模式（亮／暗）× 色系（PALETTES）。膠囊按鈕左半邊（#themeBtn）永遠只切亮暗、不管色系；右半邊（#paletteBtn）展開色系選單。
   - 新增色系：加進 PALETTES、i18n 的 pal_<id>、styles.css 的色系區塊（含「處理中」遮罩 #busy 的樣式）與 .sw-<id>，並把 template.html <head> 的白名單一起改。
   - 這必須是頁面最後一段程式：測試以「最後一個 script 標籤」做語法檢查，template.html 在它後面不要再加別的 script 標籤。
   - js/ 與 styles.css 的內容（含註解）不可出現字面上的 script 開始或結束標籤，會干擾 HTML 解析與上述檢查。 */
function curTheme(){ return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
function updateThemeBtn(){
  const tip = t(curTheme() === 'dark' ? 'themeToLight' : 'themeToDark');
  $('#themeBtn').title = tip; $('#themeBtn').setAttribute('aria-label', tip);
}
$('#themeBtn').addEventListener('click', () => {
  const next = curTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try{ localStorage.setItem('revdiff-theme', next); }catch(e){}
  updateThemeBtn();
});

/* ----- 色系（膠囊按鈕右半邊的選單） ----- */
const PALETTES = ['default', 'barbie', 'neon', 'win95', 'boba', 'space'];   // template.html <head> 的防閃爍腳本有同一份白名單
function curPalette(){ const p = document.documentElement.getAttribute('data-palette'); return PALETTES.includes(p) ? p : 'default'; }
function renderPaletteMenu(){
  const cur = curPalette();
  $('#paletteMenu').innerHTML = `<div class="pm-title">${esc(t('palTitle'))}</div>` + PALETTES.map(id =>
    `<button type="button" role="menuitemradio" aria-checked="${id === cur}" data-p="${id}"><span class="sw sw-${id}"></span><span>${esc(t('pal_' + id))}</span><span class="ck" aria-hidden="true">✓</span></button>`).join('');
  $('#paletteBtn').title = t('palTip'); $('#paletteBtn').setAttribute('aria-label', t('palTip'));
}
const menuItems = () => [...$('#paletteMenu').querySelectorAll('button')];
function openPaletteMenu(){
  $('#paletteMenu').hidden = false; $('#paletteBtn').setAttribute('aria-expanded', 'true');
  (menuItems().find(b => b.getAttribute('aria-checked') === 'true') || menuItems()[0]).focus();
}
function closePaletteMenu(refocus){
  if ($('#paletteMenu').hidden) return;
  $('#paletteMenu').hidden = true; $('#paletteBtn').setAttribute('aria-expanded', 'false');
  if (refocus) $('#paletteBtn').focus();
}
function setPalette(id){
  if (!PALETTES.includes(id)) return;
  document.documentElement.setAttribute('data-palette', id);
  try{ localStorage.setItem('revdiff-palette', id); }catch(e){}
  renderPaletteMenu();
}
$('#paletteBtn').addEventListener('click', () => { $('#paletteMenu').hidden ? openPaletteMenu() : closePaletteMenu(true); });
$('#paletteMenu').addEventListener('click', e => {
  const b = e.target.closest('button[data-p]'); if (!b) return;
  setPalette(b.dataset.p); closePaletteMenu(true);
});
document.addEventListener('click', e => { if (!e.target.closest('#themeSplit')) closePaletteMenu(false); });
$('#themeSplit').addEventListener('keydown', e => {
  const open = !$('#paletteMenu').hidden;
  if (e.key === 'Escape' && open){ e.preventDefault(); closePaletteMenu(true); return; }
  if (e.key === 'ArrowDown' && !open && e.target === $('#paletteBtn')){ e.preventDefault(); openPaletteMenu(); return; }
  if (!open || !e.target.closest('#paletteMenu')) return;
  const items = menuItems(), i = items.indexOf(document.activeElement);
  const to = e.key === 'ArrowDown' ? (i + 1) % items.length : e.key === 'ArrowUp' ? (i - 1 + items.length) % items.length
           : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1;
  if (to >= 0){ e.preventDefault(); items[to].focus(); }
});

/* ================= 語言切換 ================= */
function applyLang(){
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  updateThemeBtn(); renderPaletteMenu();
  $('#langCode').textContent = t('langTo'); $('#langBtn').title = t('langTip'); $('#langBtn').setAttribute('aria-label', t('langTip'));
  if ($('#busy').hidden) $('#busyT').textContent = t('busyDefault');
  renderMsg();
  renderSlotStatic(S.A); renderSlotStatic(S.B);
  if (S.A.rows && S.B.rows) renderCfg();
  if (R){ renderSummary(); renderWarnings(); renderTable(); }
}
$('#langBtn').addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  try{ localStorage.setItem('revdiff-lang', lang); }catch(e){}
  applyLang();
});

buildSlotUI(S.A); buildSlotUI(S.B);
applyLang();
