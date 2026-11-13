/* ================= 匯出 .xlsx（自製寫檔，可帶顏色） ================= */
/* 【本檔】匯出 .xlsx：自己寫的 zip（不壓縮）＋ OOXML。SheetJS 免費版寫檔沒有儲存格顏色，不要換回 XLSX.writeFile。
   - 新增樣式：同步改 buildXlsx() 裡 styles.xml 的 cellXfs（含 count）與 STY。
   - sheetXml() 會略過 '' 與 null；數字才寫成 <v>。要輸出空白請用 ''，不要用 0。
   - 差值欄輸出成數字（Excel 內可篩選、加總）；修改的儲存格輸出文字「舊 → 新」。
   - 檔名刻意用英文（headless Chromium 的中文下載檔名會失效）。
   - 驗證：tests/e2e.test.js 的「匯出 .xlsx」會讀回內容、樣式、凍結窗格與篩選。 */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n=0;n<256;n++){ let c=n; for (let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; t[n]=c>>>0; } return t; })();
function crc32(u8){ let c = 0xFFFFFFFF; for (let i=0;i<u8.length;i++) c = CRC_T[(c^u8[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function zipStore(files){
  const enc = new TextEncoder(), chunks = [], central = [];
  let off = 0;
  for (const f of files){
    const nm = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true); lh.setUint16(8,0,true);
    lh.setUint16(10,0,true); lh.setUint16(12,0x0021,true); lh.setUint32(14,crc,true);
    lh.setUint32(18,data.length,true); lh.setUint32(22,data.length,true); lh.setUint16(26,nm.length,true); lh.setUint16(28,0,true);
    chunks.push(new Uint8Array(lh.buffer), nm, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true); ch.setUint16(8,0x0800,true);
    ch.setUint16(10,0,true); ch.setUint16(12,0,true); ch.setUint16(14,0x0021,true); ch.setUint32(16,crc,true);
    ch.setUint32(20,data.length,true); ch.setUint32(24,data.length,true); ch.setUint16(28,nm.length,true);
    ch.setUint32(42,off,true);
    central.push(new Uint8Array(ch.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const csize = central.reduce((s,x) => s + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true); end.setUint16(8,files.length,true); end.setUint16(10,files.length,true);
  end.setUint32(12,csize,true); end.setUint32(16,off,true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
const colLetter = i => { let s='',n=i+1; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s; };
const xesc = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
/* 樣式索引：0 一般 1 標題 2 綠 3 紅 4 黃 5 粗體 */
function sheetXml(sh){
  const rows = sh.rows, ncol = Math.max(1, ...rows.map(r => r.length));
  const widths = Array.from({length:ncol}, (_,c) => {
    let w = 6;
    for (const r of rows.slice(0,400)){ const x = r[c]; const t = x == null ? '' : String(typeof x === 'object' ? x.v : x);
      let l = 0; for (const ch of t) l += ch.charCodeAt(0) > 255 ? 2 : 1; w = Math.max(w, l+2); }
    return Math.min(w, 48);
  });
  let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">' +
    (sh.freeze ? `<pane xSplit="${sh.freeze[0]}" ySplit="${sh.freeze[1]}" topLeftCell="${colLetter(sh.freeze[0])}${sh.freeze[1]+1}" activePane="bottomRight" state="frozen"/>` : '') +
    '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>' +
    widths.map((w,i) => `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('') + '</cols><sheetData>';
  rows.forEach((r, ri) => {
    x += `<row r="${ri+1}">`;
    r.forEach((c, ci) => {
      if (c == null || c === '') return;
      const v = typeof c === 'object' ? c.v : c, s = typeof c === 'object' ? (c.s||0) : 0;
      const ref = colLetter(ci) + (ri+1);
      x += typeof v === 'number' && isFinite(v)
        ? `<c r="${ref}" s="${s}"><v>${v}</v></c>`
        : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xesc(v)}</t></is></c>`;
    });
    x += '</row>';
  });
  x += '</sheetData>' + (sh.filter && rows.length > 1 ? `<autoFilter ref="A1:${colLetter(ncol-1)}${rows.length}"/>` : '') + '</worksheet>';
  return x;
}
function buildXlsx(sheets){
  const fills = ['FFC6EFCE','FFFFC7CE','FFFFEB9C','FF305496'];
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fills.map(c => `<fill><patternFill patternType="solid"><fgColor rgb="${c}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const NS = 'http://schemas.openxmlformats.org/';
  const files = [
    {name:'[Content_Types].xml', data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${NS}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i) => `<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`},
    {name:'_rels/.rels', data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}package/2006/relationships"><Relationship Id="rId1" Type="${NS}officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name:'xl/workbook.xml', data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}spreadsheetml/2006/main" xmlns:r="${NS}officeDocument/2006/relationships"><sheets>${sheets.map((s,i) => `<sheet name="${xesc(s.name.replace(/[\\\/?*\[\]:]/g,'_').slice(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`},
    {name:'xl/_rels/workbook.xml.rels', data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}package/2006/relationships">${sheets.map((_,i) => `<Relationship Id="rId${i+1}" Type="${NS}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="${NS}officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
    {name:'xl/styles.xml', data:styles},
    ...sheets.map((s,i) => ({name:`xl/worksheets/sheet${i+1}.xml`, data:sheetXml(s)})),
  ];
  return zipStore(files);
}
const STY = {plain:0, head:1, add:2, del:3, mod:4, bold:5};
function exportXlsx(){
  if (!R) return;
  const list = $('#expFiltered').checked ? shown : R.entries;
  const cols = dispCols.length ? dispCols : COLS.map(c => ({label:c, col:c, delta:false}));
  const hdr = [t('hStatus'),t('hChanged'),t('hRowA'),t('hRowB'), ...cols.map(d => d.label)].map(v => ({v, s:STY.head}));
  const rows = [hdr];
  for (const e of list){
    const base = e.status === 'add' ? STY.add : e.status === 'del' ? STY.del : STY.plain;
    const line = [{v:STATUS()[e.status], s: e.status === 'mod' ? STY.mod : base},
      {v:e.changes.map(c => c.col).join(', '), s:base},
      {v:e.a ? e.a.rn : '', s:base}, {v:e.b ? e.b.rn : '', s:base}];
    for (const d of cols){
      const c = d.col;
      if (d.delta){   // 差值欄：輸出成數字，方便在 Excel 內篩選 / 排序 / 加總
        const dv = (e.status === 'add' || e.status === 'del') ? null : e.deltas[c];
        line.push({v: dv == null ? '' : dv, s: dv > 0 ? STY.add : dv < 0 ? STY.del : base});
        continue;
      }
      const ch = e.changes.find(x => x.col === c);
      if (ch) line.push({v:`${ch.oldV.trim()===''?t('xEmpty'):ch.oldV} → ${ch.newV.trim()===''?t('xEmpty'):ch.newV}`, s:STY.mod});
      else{
        const raw = (e.b || e.a).v[c];
        line.push({v: raw instanceof Date ? cellStr(raw) : (raw == null ? '' : raw), s:base});
      }
    }
    rows.push(line);
  }
  const c = R.counts;
  const sum = [
    [{v:t('xItem'),s:STY.head},{v:t('xValue'),s:STY.head}],
    [{v:t('revA'),s:STY.bold}, t('xFile', S.A.name, S.A.sheet, S.A.hr, S.A.rows.length)],
    [{v:t('revB'),s:STY.bold}, t('xFile', S.B.name, S.B.sheet, S.B.hr, S.B.rows.length)],
    [{v:t('xKey'),s:STY.bold}, R.keyCols.join(' + ')],
    [{v:t('stAdd'),s:STY.add}, c.add], [{v:t('stDel'),s:STY.del}, c.del], [{v:t('stMod'),s:STY.mod}, c.mod], [{v:t('stSame'),s:STY.bold}, c.same],
    [{v:t('xScope'),s:STY.bold}, $('#expFiltered').checked ? t('xScopeF', list.length) : t('xScopeA', list.length)],
    [],[{v:t('xColStat'),s:STY.head},{v:t('xCount'),s:STY.head}],
    ...Object.entries(R.colCount).sort((a,b) => b[1]-a[1]).map(([k,v]) => [k, v]),
    [],[{v:t('xDup'),s:STY.head},{v:t('xDupHead'),s:STY.head}],
    ...['A','B'].flatMap(side => R.dups[side].map(d => [d.key || t('keyEmpty'), t('xDupLine', side, d.count, d.rns.join(', '))])),
  ];
  if (!R.dups.A.length && !R.dups.B.length) sum.push([t('xNone'),'']);
  const blob = buildXlsx([
    {name:t('xSheetRes'), rows, freeze:[1,1], filter:true},
    {name:t('xSheetSum'), rows:sum},
  ]);
  const d = new Date(), p = n => String(n).padStart(2,'0');
  const fn = `compare_result_${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.xlsx`;
  if (navigator.msSaveBlob){ navigator.msSaveBlob(blob, fn); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = fn;
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 4000);
}
$('#btnExport').addEventListener('click', exportXlsx);

