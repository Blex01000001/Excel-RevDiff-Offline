/* ================= 主題切換（預設暗色） ================= */
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
