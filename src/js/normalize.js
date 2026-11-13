const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/;

function cellStr(v){
  if (v == null) return '';
  if (v instanceof Date){
    if (isNaN(v)) return '';
    const p = n => String(n).padStart(2,'0');
    const d = v.getFullYear()+'-'+p(v.getMonth()+1)+'-'+p(v.getDate());
    const t = p(v.getHours())+':'+p(v.getMinutes());
    return (v.getHours()||v.getMinutes()) ? d+' '+t : d;
  }
  return String(v);
}
/* 文字正規化：NFKC(全形→半形)、去前後空白、合併連續空白、轉小寫 */
function normText(v){
  return cellStr(v).normalize('NFKC').replace(/[ 　]/g,' ').trim().replace(/\s+/g,' ').toLowerCase();
}
/* 嘗試把正規化後文字視為數字；有前置 0 的代碼（007）不視為數字 */
function numOf(s){
  let t = s;
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g,'');
  if (!NUM_RE.test(t)) return null;
  if (/^[+-]?0\d/.test(t)) return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
}
function norm(v){
  const s = normText(v), n = numOf(s);
  return n === null ? s : String(n === 0 ? 0 : n);
}
/* 差值用：寬鬆解析數字（含前置 0） */
function parseNum(v){
  let s = normText(v).replace(/,/g,'');
  if (s === '' || !NUM_RE.test(s)) return null;
  const n = Number(s); return isFinite(n) ? n : null;
}
function fmtDelta(d){
  d = Math.round(d*1e9)/1e9;
  return (d > 0 ? '+' : '') + String(d);
}

