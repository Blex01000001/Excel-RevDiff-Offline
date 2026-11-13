/* ================= 主題切換（預設暗色） ================= */
/* 【本檔】主題與語言切換、啟動
   - 預設暗色主題、不跟隨作業系統；語言預設跟隨瀏覽器；兩者都用 localStorage 記住（讀寫一律 try/catch）。
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

/* ================= 語言切換 ================= */
function applyLang(){
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  updateThemeBtn();
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
