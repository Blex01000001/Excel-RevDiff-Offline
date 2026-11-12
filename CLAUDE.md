# Excel RevDiff Offline

比對兩份格式相同的 Excel 的**單一離線 HTML 工具**（資料只在瀏覽器處理、不上傳），以 GitHub Pages 發佈。**開始新工作前先讀 `docs/TODO.md`。**

## 檔案地圖（先看這裡決定要讀哪個檔案）

依任務從這張表找到要讀的檔案，只讀相關檔案，不要整個 repo 掃過。表上沒有的檔案通常不需要動；新增或搬移檔案時同步更新這張表。

| 檔案 | 用途 |
|---|---|
| `src/template.html` | **所有程式都在這裡**：CSS、HTML、i18n 字典、讀檔／比對／顯示／匯出邏輯。改功能就改這個檔 |
| `index.html` | 由 `src/build.py` **產生**的成品（內嵌 SheetJS），GitHub Pages 與使用者直接用它。不要手改 |
| `src/build.py` | 把 SheetJS 與版本號塞進 template，輸出 `index.html` |
| `src/VERSION` | 版本號（顯示在標題旁），建置時注入 |
| `src/xlsx.core.min.js` | SheetJS Community 0.18.5（原樣內嵌，不要改）；授權見 `THIRD-PARTY-SheetJS-LICENSE.txt` |
| `LICENSE` | MIT 授權（含 SheetJS 的第三方聲明）；README 刻意不放授權章節，GitHub 會自動顯示 |
| `README.md` | 給第一次使用者看的中英文簡介（功能、用法、格式、注意事項） |
| `docs/TODO.md` | 目前狀態：待辦、已知問題、想法；每次 commit 時同步更新 |
| `samples/demo_RevA.xlsx`、`demo_RevB.xlsx` | 假資料範例，用來做驗證（Key＝`SKU`） |
| `package.json`、`package-lock.json` | **僅開發用**（測試用的 Playwright）；成品 `index.html` 沒有任何依賴 |
| `tests/helpers.js`、`tests/e2e.test.js` | 端對端測試（`npm test`）：當場產生測試檔、用真實瀏覽器操作頁面、讀回匯出檔 |
| `.nojekyll` | 讓 GitHub Pages 直接提供靜態檔，不要刪 |

`src/template.html` 內的區段（找函式用 `grep -n "^function"`）：多語系 `I18N`／`t()` → 狀態 `S`、`draft`、`applied`、`R` → 處理中提示 `withBusy()` → 背景執行 `runJob()`／`jobDispatch()`／`workerSource()` → 讀檔 `loadFile()`／`parseSlot()` → 欄位設定 `renderCfg()`／`applyConfig()` → 比對核心 `compare()`／`pairGroup()` → 顯示 `renderSummary()`／`renderWarnings()`／`renderTable()` → 匯出 `exportXlsx()`／`buildXlsx()` → 主題與語言切換。

## 常見任務怎麼改

格式：任務 → 改哪些檔案／函式 → 注意事項 → 怎麼驗證。

- **改或新增介面文字** → `src/template.html` 的 `I18N.zh` 與 `I18N.en`（兩邊都要有同一個 key）；靜態 HTML 用 `data-i18n`／`data-i18n-ph`／`data-i18n-title`，動態文字用 `t('key', ...)` → 欄名是資料鍵，不翻譯 → 切換語言後畫面（含結果、匯出標題）都正確。
- **新增 UI 元件** → template 的 HTML 與 CSS → 顏色用 CSS 變數（暗／亮兩組都要有值）；文字走 i18n；耗時動作包 `withBusy()` → 暗色與亮色、中文與英文各看一次。
- **改比對邏輯** → `compare()`、`pairGroup()`、`norm()`／`nval()` → `compare()` 在 Worker 裡執行，新用到的函式要加進 `workerSource()` 的清單（見「容易踩的雷」）；保持 `GREEDY_LIMIT` 的保護；每格正規化只算一次（快取在 `row.nc`）→ 用 3 萬 + 5 萬列的假資料量時間，並跑下面的「快速檢查」。
- **改匯出 .xlsx** → `exportXlsx()`（內容）、`sheetXml()`／`buildXlsx()`（檔案格式與樣式 `STY`）→ 這是自己寫的 zip + OOXML，新增樣式要同步改 `styles.xml` 的 `cellXfs` 數量 → 用 openpyxl 讀回檢查值、顏色、凍結窗格。
- **支援新的檔案格式** → `loadFile()` 前的 `<input accept>`、README 的格式清單 → 先用 SheetJS 產生該格式的測試檔實際載入驗證（含中文）。
- **新增或修改功能** → 同時在 `tests/e2e.test.js` 補（或改）一個案例；測試用到的元素 id 與全域名稱見「容易踩的雷」 → `npm test` 要全過。
- **升版本** → 只改 `src/VERSION`，再執行 `python3 src/build.py` → 一起 commit `src/VERSION` 與 `index.html`。依修改量判斷：只修錯誤或微調 → patch（1.1.**x**）；新增功能或明顯改善、使用方式相容 → minor（1.**x**.0）；使用方式不相容 → major。
- **改主題顏色** → template 開頭的 `:root[data-theme="dark|light"]` 變數 → 兩個主題一起改，並看過兩種畫面。

**快速檢查**（任何改動後都要跑）：

```bash
npm test                # 33 個端對端測試，約 15 秒：建置是否最新、語法、核心結果、備援路徑、格式、設定操作、語言／主題、匯出…
npm run check:build     # 只檢查 index.html 是否和 template 的建置結果一致（npm test 也會檢查）
```

- **雲端環境不要 `npm install`、不要 `playwright install`**：Playwright 與瀏覽器已預裝（全域），`npm test` 直接就能跑。自己的電腦第一次先 `npm ci && npx playwright install chromium`。
- 測試預設走 Worker 路徑，並另有案例驗證 Worker 失敗時的備援路徑結果相同。
- 測試失敗時先看錯誤訊息：比對出錯會直接帶出頁面上的錯誤文字（例如 `pairGroup is not defined`）。

## 架構決策（不要改回去）

格式：決策 — 原因 — 不要做什麼。真的認為該推翻，先提出來討論（標【先討論】），不要直接改。

- **單一離線 HTML，SheetJS 內嵌** — 公司電腦不能安裝、網路可能擋 CDN — 不要引用外部資源（CDN、字型、圖片）、不要拆成多檔；圖示用內嵌 SVG data URI。
- **自己寫 .xlsx 匯出** — SheetJS 免費版寫檔不支援儲存格顏色 — 不要換回 `XLSX.writeFile`。
- **設定要按「套用並開始比對」才執行，且載入後什麼都不預選** — 勾一項跑一次太慢、使用者要自己決定 Key — 不要改回勾選就自動比對或預設全勾。
- **同 Key 的列：先雜湊配對完全相同者，其餘在 `GREEDY_LIMIT` 內才做「差異最少」配對** — 低區分度 Key 會讓 A×B 兩兩比較爆炸、頁面卡死 — 不要移除上限，也不要把預設 Key 設成第一欄。
- **重複 Key 不略過、只收折成警告** — 使用者要求「不要默默略過」但不想被洗版 — 不要刪掉警告，也不要預設展開。
- **數量差值是獨立的數字欄，儲存格只顯示 `舊 → 新`** — 方便篩選、排序、加總，匯出後 Excel 也能用 — 不要再把 `+3` 標籤塞回儲存格。
- **預設暗色主題，不跟隨作業系統**；**語言預設跟隨瀏覽器**，兩者都用 localStorage 記住 — 使用者指定 — 不要改回 `prefers-color-scheme`。
- **讀檔、解析工作表、比對都在 Web Worker 執行；Worker 原始碼＝內嵌 SheetJS（`<script type="text/plain" id="sheetjs-src">`）＋用 `Function.toString()` 取出的函式；Worker 失敗自動退回主執行緒** — 數萬列時主執行緒會凍結數秒，又必須維持單一 HTML — 不要拆成外部 worker 檔、不要把 SheetJS 改回主執行緒直接載入、不要移除備援。
- **測試只供開發用，成品維持零依賴的單一 HTML** — 使用者不需要也不會碰到 Node／Playwright — 不要為了測試在 `index.html` 加任何東西（測試靠既有的全域名稱與元素 id）；測試檔當場產生，不要把二進位測試檔放進 repo。
- **標題列固定（sticky）** — 使用者指定 — 不要移除。

## 設計規範

- 所有看得到的文字都走 `I18N`（中英文兩份）；英文用工程師常用說法。
- 插入 HTML 的使用者資料一律用 `esc()`。
- 顏色只用 CSS 變數，不要寫死色碼（狀態色 `--add/--del/--mod` 等已為兩個主題定義）。
- 資料欄名同時是資料鍵：不要翻譯、不要改大小寫。
- 新的耗時動作要包 `withBusy(訊息, fn)`，讓使用者看到「處理中」。
- 讀寫 `localStorage` 一律 try/catch（無痕或封鎖時會丟錯）。

## 容易踩的雷

修改相關檔案前先看這節。格式：位置 — 現象 — 為什麼不能動／該怎麼處理。

- `index.html` — 看起來可以直接改 — 它是產生的，下次 `build.py` 會覆蓋；改 `src/template.html` 再建置，兩個檔案一起 commit。
- `src/template.html` 的 `/*__SHEETJS__*/` 與 `__APP_VERSION__` — 看似註解／雜訊 — 是建置時的取代點，刪掉就沒有 SheetJS／版本號。
- 區域變數取名 `t` — `cfgTable` 的 change 處理函式裡有 `const t = e.target` — 會蓋掉全域翻譯函式 `t()`；該區塊內不要呼叫 `t()`，新增程式避免用 `t` 當變數名。
- 樣板字串裡巢狀引號 — `` `...${rows || '<td>${t('x')}</td>'}` `` 會語法錯誤（曾發生）— 內層字串用反引號；改完一定跑「快速檢查」的語法檢查。
- `.finfo` 等 `display:flex` 的元素 — `hidden` 屬性會被蓋掉 — 已有全域 `[hidden]{display:none!important}`，不要刪。
- `.card{scroll-margin-top:72px}` — 與固定標題列高度綁在一起 — 改標題列高度時一併調整，否則自動捲動會被擋住。
- `exportXlsx()` 的數字儲存格 — `sheetXml()` 會略過 `''` 與 `null`、數字才寫成 `<v>` — 想輸出空白用 `''`，不要用 `0`。
- 搜尋用的 `e.hay` — 狀態文字同時放中英文（`新增 added` …）— 為了切換語言後搜尋仍有效，不要只留一種。
- `workerSource()` 的函式清單 — `compare()` 與它呼叫的函式（`cellStr`、`norm`、`pairGroup`…）是用 `toString()` 複製進 Worker 的，Worker 內看不到主執行緒的 `t()`、`$()`、`S`、DOM — 新增 `compare()` 的依賴函式時要加進清單，否則 Worker 內會 ReferenceError；備援路徑（主執行緒）卻不會發現，所以改完要用預設的 Worker 路徑跑一次。`compare()` 回傳的是精簡結果（以 `ai`／`bi` 列索引取代列物件），`runCompare()` 才還原；顯示文字（例如空 Key 的標籤）要在主執行緒用 `t()` 產生。
- 「快速檢查」的語法檢查 — 以最後一個 `<script>` 為應用程式碼 — SheetJS 是 `type="text/plain"` 所以不會被誤判；不要在應用程式碼後面再加別的 `<script>`。
- `showMsg()` — 要傳「產生文字的函式」（`() => t('key')`），不是字串 — 這樣切換語言時 `renderMsg()` 才能用新語言重新產生；拋出錯誤時用 `err.key` 帶 i18n key，不要把翻譯後的字串放進 `Error`。
- 測試依賴的「介面約定」— `tests/` 用 `page.evaluate` 直接讀頂層的 `R`、`S`、`draft`、`shown`、`worker`、`workerFailed`，並用元素 id（`#fileA`、`#btnApply`、`#cfgTable`、`#stats`、`#msg`、`#dmodes`、`#langBtn`、`#themeBtn`…）操作 — 改名或移除要同步改測試，否則會一片紅。
- `refresh()` — 載入／換檔／換工作表會清掉結果與 `applied` — 這是預期行為，使用者要重新按套用；`draft`（勾選）則保留。
- 預設標題 `Col{n}` — 空白標題的欄名 — 刻意用不翻譯的名稱，避免切換語言後資料鍵改變。

## 使用者的工作習慣

- 回覆用繁體中文；commit 訊息用英文。
- 訊息常分「待處理事項」（直接改）與「待討論事項」（只分析、給建議，不改程式）。
- 改輸出格式（匯出 .xlsx 的欄位／版面）、引入建置工具、改架構前先問。
- 他們的真實資料是數萬列、約 33 欄的料表；測試時優先考慮這個規模。

## Git 規則

- 目前直接在 `main` 上開發並 push（`origin` 是 `Blex01000001/Excel-RevDiff-Offline`），推上 `main` 後 GitHub Pages 會自動更新。
- 若改用開發分支：它的 PR 合併後，新工作先從最新 `main` 重開：
  `git fetch origin main && git checkout -B <開發分支> origin/main`（推送用 `--force-with-lease`）。
- 使用者說「合併到 main」時：用可用的 GitHub 工具建立 PR 再 merge（`expectedHeadSha` 用完整 40 字元 SHA）。
- 每完成一個獨立的修改就 commit。commit 訊息第一行簡述改了什麼，需要時空一行補充原因。
- 改了 `src/template.html` 就要重新建置，並把 `index.html` 一起 commit。
- `git push` 被拒絕（`fetch first`）時，代表使用者在 GitHub 上也改了東西：先 `git pull --rebase origin main`，確認沒有衝突再推；不要 `--force`。
- 需要了解過去的修改時，用 `git log` 查詢。

## TODO 維護規則（`docs/TODO.md`）

- 每次 commit 時一併更新：做完的刪掉、新發現的加進去、不適用的刪掉或改寫。
- 只記目前狀態，不寫完成紀錄或歷史（歷史看 `git log`）；每項一行為主，保持精簡。
- 使用者說「做待辦 N」時以這份檔案的編號為準；整理時可重新編號。

## Commit 後的回報規則

每次 commit 並 push 後，回覆必須包含以下三段，內容要和 `docs/TODO.md` 一致：

1. **已改善項目／問題**：這次 commit 完成了什麼。
2. **尚待改善項目／問題、已知問題**：還沒做完的、發現但未處理的問題、已知限制。
3. **建議改善方向或功能**：之後可以考慮的改進或新功能。
