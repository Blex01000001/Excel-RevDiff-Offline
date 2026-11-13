# Excel RevDiff Offline

比對兩份格式相同的 Excel 的**單一離線 HTML 工具**（資料只在瀏覽器處理、不上傳），以 GitHub Pages 發佈。**開始新工作前先讀 `docs/TODO.md`。**

## 省 token 的工作方式（先看）

- **不要 Read／cat／grep** `index.html`（產物，0.5 MB）、`src/xlsx.core.min.js`（0.4 MB 單行）、`package-lock.json`。搜尋一律限定範圍：`grep -rn 關鍵字 src/js src/styles.css src/template.html tests`。
- 這三個檔已設 `-diff`，`git diff`／`git show` 只會顯示「Binary files differ」；看改了哪些檔用 `git diff --stat`。
- 依下方檔案地圖**只讀要改的那一個檔**。每個原始檔開頭的註解就是該檔的規則與雷，本文件不重複。
- 驗證只跑 `npm test`（成功時只印幾個點，失敗才有細節）。不要另寫臨時的 Playwright 腳本；測試沒涵蓋的，把案例加進 `tests/e2e.test.js`。
- 只有改版面時才截圖。設計理由平常不用讀，要推翻某個決策前才讀 `docs/DECISIONS.md`。

## 檔案地圖（先看這裡決定要讀哪個檔案）

表上沒有的檔案通常不需要動；新增或搬移檔案時同步更新這張表。

| 要改什麼 | 讀這個檔 |
|---|---|
| 介面文字、翻譯（中／英） | `src/js/i18n.js` |
| 顏色、版面、主題變數 | `src/styles.css` |
| 頁面骨架（HTML 元素與 id） | `src/template.html` |
| 正規化規則（空白、全形、大小寫、數字） | `src/js/normalize.js` |
| 全域狀態、「處理中」遮罩 | `src/js/state.js` |
| 讀檔、支援的格式、訊息列 | `src/js/load.js` |
| 設定表（Key／比對／數量）、建議 Key、套用 | `src/js/settings.js` |
| 比對邏輯 | `src/js/compare.js` |
| Web Worker、背景工作、`runCompare()` | `src/js/worker.js` |
| 摘要、警告、結果表格、數量差值篩選 | `src/js/view.js` |
| 匯出 .xlsx | `src/js/export.js` |
| 主題／語言切換、啟動 | `src/js/main.js` |
| 建置、版本號 | `src/build.py`、`src/VERSION` |
| 測試 | `tests/e2e.test.js`（案例）、`tests/helpers.js`（產生測試檔、操作頁面、讀回匯出檔）、`tests/perf.js` |
| 文件 | `README.md`（給使用者的中英文簡介）、`docs/TODO.md`（目前狀態，每次 commit 同步更新）、`docs/DECISIONS.md`（架構決策的理由） |
| 其他 | `LICENSE`（MIT）、`samples/`（假資料範例，Key＝`SKU`）、`.github/workflows/test.yml`（CI）、`.gitattributes`、`.nojekyll`（不要刪）、`package.json`（僅開發用） |

`index.html` 是 `src/build.py` 把 `template.html`、`styles.css`、`js/*.js`、SheetJS、版本號組起來的**產物**（GitHub Pages 與使用者直接用它）。

## 常見任務怎麼改

- **任何修改** → 改 `src/` → `python3 src/build.py` → `npm test` → `src/` 與 `index.html` 一起 commit。
- **新增或修改功能** → 同時在 `tests/e2e.test.js` 補或改一個案例。
- **新增介面文字** → `src/js/i18n.js` 的 `zh` 與 `en` 都要加同一個 key。
- **動到讀檔／比對的速度** → 另外跑 `npm run perf`（約 30 秒；Worker 路徑的「畫面最長停頓」應維持約 0.1–0.4 秒）。
- **升版本** → 只改 `src/VERSION` 再建置。只修錯誤或微調 → patch；新增功能且相容 → minor；使用方式不相容 → major。
- **新增原始檔** → 在 `src/template.html` 加一行 `/*__INCLUDE:路徑__*/`（順序就是執行順序），檔頭寫上該檔的規則，並更新檔案地圖。

指令：`npm test`（33 個端對端測試，約 15 秒）、`npm run test:verbose`（列出每個案例，CI 用）、`npm run perf`、`npm run check:build`。

## 架構決策（不要改回去）

理由與「不要做什麼」在 `docs/DECISIONS.md`。認為該推翻時先提出討論（標【先討論】），不要直接改。

1. 成品是單一離線 HTML：SheetJS 內嵌、沒有任何外部資源。
2. 原始碼分檔、由 `build.py` 組合；`index.html` 是產物但要 commit。
3. 匯出 .xlsx 用自己寫的寫檔程式（為了顏色）。
4. 設定要按「套用並開始比對」才執行；載入後什麼都不預選。
5. 同 Key 的配對有 `GREEDY_LIMIT` 上限；重複 Key 不略過，警告預設收折。
6. 數量差值是獨立的數字欄。
7. 預設暗色主題（不跟隨作業系統）、語言預設跟隨瀏覽器，兩者用 localStorage 記住。
8. 讀檔與比對在 Web Worker 執行，失敗時自動退回主執行緒。
9. 測試只供開發用，成品維持零依賴；測試檔當場產生，不放二進位檔進 repo。
10. 標題列固定在最上方。

## 設計規範

- 看得到的文字都走 `I18N`（中英兩份）；插入 HTML 的資料用 `esc()`；顏色只用 CSS 變數（暗、亮兩組都給值）。
- 耗時動作包 `withBusy(訊息, fn)`；讀寫 `localStorage` 一律 try/catch。
- 資料欄名同時是資料鍵：不翻譯、不改大小寫。

## 容易踩的雷（跨檔案的；單一檔案的寫在該檔開頭）

- `index.html` — 不要手改，下次建置會被覆蓋。
- `src/template.html` 的 `/*__INCLUDE:…__*/`、`/*__SHEETJS__*/`、`__APP_VERSION__` — 是建置的取代點，不可刪。
- `src/js/`、`src/styles.css`（含註解）— 不可出現字面上的 script 開始或結束標籤，會干擾 HTML 解析與語法檢查。
- 區域變數不要取名 `t` — 會蓋掉全域翻譯函式 `t()`。
- 測試的介面約定 — `tests/` 直接讀頂層的 `R`、`S`、`draft`、`shown`、`worker`、`workerFailed`，並用元素 id（`#fileA`、`#btnApply`、`#cfgTable`、`#stats`、`#msg`…）操作；改名或移除要同步改測試。
- 雲端環境 — 不要 `npm install`、不要 `playwright install`（已預裝，`npm test` 直接能跑）。自己的電腦第一次先 `npm ci && npx playwright install chromium`。

## 使用者的工作習慣

- 回覆用繁體中文；commit 訊息用英文。
- 訊息常分「待處理事項」（直接改）與「待討論事項」（只分析、給建議，不改程式）。
- 改輸出格式（匯出 .xlsx 的欄位／版面）、引入建置工具、改架構前先問。
- 真實資料是數萬列、約 33 欄的料表；測試時優先考慮這個規模。

## Git 規則

- 直接在 `main` 上開發並 push（`origin` 是 `Blex01000001/Excel-RevDiff-Offline`）；推上去後 GitHub Pages 自動更新、CI 自動跑。
- 每完成一個獨立的修改就 commit。訊息第一行簡述改了什麼，需要時空一行補充原因。
- `git push` 被拒絕（`fetch first`）代表使用者在 GitHub 上也改了東西：先 `git pull --rebase origin main`，沒有衝突再推；不要 `--force`。
- 若改用開發分支：它的 PR 合併後，新工作先從最新 `main` 重開：`git fetch origin main && git checkout -B <開發分支> origin/main`（推送用 `--force-with-lease`）。
- 使用者說「合併到 main」時：用可用的 GitHub 工具建立 PR 再 merge（`expectedHeadSha` 用完整 40 字元 SHA）。
- 需要了解過去的修改時，用 `git log --oneline`。

## TODO 維護規則（`docs/TODO.md`）

- 每次 commit 時一併更新：做完的刪掉、新發現的加進去、不適用的刪掉或改寫。
- 只記目前狀態，不寫完成紀錄或歷史（歷史看 `git log`）；每項一行為主，保持精簡。
- 使用者說「做待辦 N」時以這份檔案的編號為準；整理時可重新編號。

## Commit 後的回報規則

每次 commit 並 push 後，回覆必須包含以下三段，內容要和 `docs/TODO.md` 一致，每段以重點條列、保持精簡：

1. **已改善項目／問題**：這次 commit 完成了什麼。
2. **尚待改善項目／問題、已知問題**：還沒做完的、發現但未處理的問題、已知限制。
3. **建議改善方向或功能**：之後可以考慮的改進或新功能。
