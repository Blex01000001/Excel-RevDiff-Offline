# Excel-RevDiff-Offline

比對兩份**格式相同**的 Excel（.xlsx）的離線工具。單一 HTML 檔、免安裝、不連網，資料只在你的瀏覽器內處理，不會上傳。

Offline single-file HTML tool to compare two Excel sheets of the same format by a configurable key. No install, no upload.

## 使用方式

- **直接下載使用**：下載 `index.html`，雙擊用 Chrome / Edge 開啟（可離線）。
- **線上版（GitHub Pages）**：<https://blex01000001.github.io/Excel-RevDiff-Offline/>　純前端靜態網頁，檔案不會離開你的電腦。

## 功能

- 選擇舊版 (Rev A) 與新版 (Rev B)；多工作表可選擇；標題列可指定在第 N 列（預設自動偵測）。
- 自行勾選一個或多個欄位組成唯一 Key。
- 每列分類為 **新增 / 刪除 / 修改 / 未變**；修改的儲存格標黃並顯示 `舊值 → 新值`，數量欄顯示差值（如 `12 → 15 +3`）。
- 比對前正規化：去除前後空白、全形轉半形、忽略大小寫、`10` 與 `10.0` 視為相同（`007` 這類有前置 0 的代碼不當數字）。
- 同檔案內重複 Key 會列出警告，並依「差異最少」優先配對，不會默默略過。
- 篩選類別、關鍵字搜尋，可匯出帶顏色的 .xlsx（含摘要工作表）。

## 開發

`index.html` 由 `src/template.html` 加上 SheetJS 內嵌產生：

```bash
python3 src/build.py
```

版本號放在 `src/VERSION`，建置時會自動顯示在標題旁。

## 範例

`samples/demo_RevA.xlsx` 與 `demo_RevB.xlsx`：Key 選 `SKU`，包含新增、刪除、修改、全形/大小寫/空白差異與重複 Key 的示範。
