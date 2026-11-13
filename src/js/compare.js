/* ================= 比對核心 ================= */
/* 【本檔】比對核心（在 Worker 內執行）：compare()、pairGroup()、groupBy()…
   - 這些函式會以 toString() 複製進 Worker：不可使用 t()、$()、DOM、S。
     新增「被 compare() 用到」的函式，要加進 worker.js 的 workerSource() 清單，否則 Worker 內 ReferenceError
     （主執行緒的備援路徑不會發現；npm test 預設走 Worker 路徑，會抓到）。
   - 保留 GREEDY_LIMIT：同 Key 的列先用雜湊配對完全相同者，剩下的在上限內才做「差異最少」配對，
     超過就依順序配對並警告。拿掉上限會讓低區分度的 Key 卡死頁面。
   - 重複 Key 不可略過。每格正規化只算一次（nval 快取在 row.nc）。
   - e.hay 的狀態文字刻意同時放中英文，切換語言後搜尋才仍然有效。
   - 動到這裡：npm test；會影響速度的再跑 npm run perf。 */
/* 每個儲存格只正規化一次（NFKC 很耗時），之後都用快取 */
function nval(r, c){ const m = r.nc || (r.nc = {}); return c in m ? m[c] : (m[c] = norm(r.v[c])); }
function rowKey(row, keyCols){ return keyCols.map(c => nval(row, c)).join('\u0001'); }
function keyLabel(row, keyCols){ return keyCols.map(c => cellStr(row.v[c]).trim()).join(' | '); }

function diffRows(a, b, cols){
  const out = [];
  for (const c of cols){
    if (nval(a, c) !== nval(b, c)) out.push(c);
  }
  return out;
}
const GREEDY_LIMIT = 40000;   // 剩餘 A×B 超過這個數量就不做「差異最少」配對，避免爆炸
function pairGroup(as, bs, cols, stat){
  // 回傳 [[a,b],...]；同 Key 多筆時：
  // 1) 內容完全相同的先配對（雜湊，O(n)）
  // 2) 剩下的在數量不大時依「差異最少」配對，太大時改依原順序配對
  if (as.length === 1 && bs.length === 1) return [[as[0], bs[0]]];
  const sig = r => cols.map(c => nval(r, c)).join('\u0002');
  const idxB = new Map();
  bs.forEach((b, j) => { const k = sig(b); const l = idxB.get(k); l ? l.push(j) : idxB.set(k, [j]); });
  const pairs = [], usedB = new Set(), remA = [];
  for (const a of as){
    const l = idxB.get(sig(a));
    if (l && l.length){ const j = l.shift(); usedB.add(j); pairs.push([a, bs[j]]); } else remA.push(a);
  }
  const remB = bs.filter((_, j) => !usedB.has(j));
  if (!remA.length || !remB.length) return pairs;
  if (remA.length * remB.length <= GREEDY_LIMIT){
    const cand = [];
    remA.forEach((a,i) => remB.forEach((b,j) => cand.push({d:diffRows(a,b,cols).length, gap:Math.abs(i-j), i, j})));
    cand.sort((x,y) => x.d-y.d || x.gap-y.gap || x.i-y.i || x.j-y.j);
    const ua = new Set(), ub = new Set();
    for (const c of cand){
      if (ua.has(c.i) || ub.has(c.j)) continue;
      ua.add(c.i); ub.add(c.j); pairs.push([remA[c.i], remB[c.j]]);
    }
  } else {
    if (stat) stat.byOrder += Math.min(remA.length, remB.length);
    for (let i = 0; i < Math.min(remA.length, remB.length); i++) pairs.push([remA[i], remB[i]]);
  }
  return pairs;
}
function groupBy(rows, keyCols){
  const m = new Map();
  for (const r of rows){
    const k = rowKey(r, keyCols);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}
function compare(A, B, keyCols, cmpCols, qtyCols){
  const pstat = {byOrder:0};
  const gA = groupBy(A.rows, keyCols), gB = groupBy(B.rows, keyCols);
  const dups = {A:[], B:[]};
  for (const [side, g, rows] of [['A',gA],['B',gB]]){
    for (const [k, rs] of g) if (rs.length > 1)
      dups[side].push({key: keyLabel(rs[0], keyCols), count: rs.length, rns: rs.map(r => r.rn)});
  }
  const mainEntries = [], aMatch = new Map(), delEntries = [];
  const mk = (a, b) => {
    const e = {a, b, changes: [], status: '', deltas: {}};
    if (a && b){
      e.changes = diffRows(a, b, cmpCols).map(c => {
        const ch = {col:c, oldV:cellStr(a.v[c]), newV:cellStr(b.v[c]), delta:null};
        if (qtyCols.has(c)){
          const x = parseNum(a.v[c]), y = parseNum(b.v[c]);
          if (x !== null && y !== null) ch.delta = y - x;
        }
        return ch;
      });
      e.status = e.changes.length ? 'mod' : 'same';
      e.deltas = {};
      for (const c of qtyCols){
        const x = parseNum(a.v[c]), y = parseNum(b.v[c]);
        e.deltas[c] = (x !== null && y !== null) ? Math.round((y - x) * 1e9) / 1e9 : null;
      }
    } else e.status = b ? 'add' : 'del';
    return e;
  };
  // 以 B 的順序輸出；同 Key 多筆時一次處理整組
  const doneKeys = new Set();
  const pairedB = new Map();   // B row -> entry
  for (const [k, bs] of gB){
    const as = gA.get(k) || [];
    const pairs = pairGroup(as, bs, cmpCols, pstat);
    const usedA = new Set(), usedB = new Set();
    for (const [a,b] of pairs){ const e = mk(a,b); pairedB.set(b, e); aMatch.set(a, e); usedA.add(a); usedB.add(b); }
    for (const b of bs) if (!usedB.has(b)) pairedB.set(b, mk(null,b));
    for (const a of as) if (!usedA.has(a)) delEntries.push(mk(a,null));
    doneKeys.add(k);
  }
  for (const [k, as] of gA) if (!doneKeys.has(k)) for (const a of as) delEntries.push(mk(a,null));
  for (const b of B.rows) mainEntries.push(pairedB.get(b));
  // 刪除列：插在 A 中「前一個有對應到的列」之後；找不到則放最前
  const anchor = new Map(); // entry|null -> [dels]
  const aIndex = new Map(A.rows.map((r,i) => [r,i]));
  for (const d of delEntries.sort((x,y) => x.a.idx - y.a.idx)){
    let i = aIndex.get(d.a) - 1, tgt = null;
    for (; i >= 0; i--){ const m = aMatch.get(A.rows[i]); if (m){ tgt = m; break; } }
    if (!anchor.has(tgt)) anchor.set(tgt, []);
    anchor.get(tgt).push(d);
  }
  const entries = [...(anchor.get(null) || [])];
  for (const e of mainEntries){ entries.push(e); if (anchor.has(e)) entries.push(...anchor.get(e)); }
  const counts = {add:0, del:0, mod:0, same:0};
  const colCount = {};
  for (const e of entries){
    counts[e.status]++;
    e.hay = [e.status, ...Object.values((e.b||e.a).v).map(normText), ...(e.a ? Object.values(e.a.v).map(normText) : [])].join('\u0001');
    e.hay += '\u0001' + ({add:'新增 added',del:'刪除 deleted',mod:'修改 modified',same:'未變 unchanged'})[e.status];
    for (const d of Object.values(e.deltas)) if (d !== null && d !== 0) e.hay += '\u0001' + fmtDelta(d);
    for (const c of e.changes) colCount[c.col] = (colCount[c.col]||0) + 1;
  }
  for (const side of ['A','B']) dups[side].sort((x,y) => y.count - x.count);
  return {entries, counts, colCount, dups, byOrder:pstat.byOrder};
}

