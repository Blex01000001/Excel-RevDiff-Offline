# Excel RevDiff Offline

[中文](#中文) | [English](#english)

**線上使用 / Live:** <https://blex01000001.github.io/Excel-RevDiff-Offline/>

---

## English

**Excel RevDiff Offline** compares two Excel files that share the same layout: pick the old and the new revision and instantly see which rows were added, deleted or modified.

The whole tool is a **single HTML file** — nothing to install, no internet needed. Your data is processed inside your browser and **never uploaded anywhere**, so it works even on locked-down company PCs.

### What it does

- **Finds the differences**: every row is classified as Added, Deleted, Modified or Unchanged, color-coded (green = added, red = deleted, yellow = modified).
- **Shows what changed**: modified cells display "old → new", and the changed columns are listed per row.
- **Your own Key**: tick which columns together identify the same row (for example ID + size), or press "Suggest Key" to get a starting point.
- **Quantity delta**: tick a quantity column to get an extra column with the difference (`+3`, `-2`). Filter by increase / decrease, sort it, and see the total delta.
- **Automatic normalization**: ignores leading/trailing spaces, full-width vs half-width characters and letter case, and treats `10` and `10.0` as equal — fewer false alarms.
- **Duplicate Key warnings**: duplicate Keys inside one file are never silently skipped; you get a warning explaining how they were paired.
- **Filter, search, export**: filter by category, search across all columns, and export a color-coded .xlsx (with a summary sheet).
- **Handles large files**: tens of thousands of rows are fine.
- **Interface**: English / 繁體中文 and dark / light themes, switchable with the buttons at the top right.

### How to use it in 3 steps

1. **Select files**: choose the old (Rev A) and new (Rev B) file. If a file has several sheets, pick one; if the header is not on row 1, set the header row.
2. **Compare settings**: tick the Key columns, the columns to compare and any quantity columns, then press "Apply & compare".
3. **Review**: read the summary and the table, and export to .xlsx if needed.

### Supported file formats

`.xlsx`, `.xlsm`, `.xlsb`, `.xls`, `.ods`, `.csv`

### Notes

- Password-protected files cannot be read.
- Very old Excel 5.0/95 `.xls` files may show garbled non-Latin text, and so may Big5-encoded CSV files — save them as `.xlsx` first.


## 繁體中文

**Excel RevDiff Offline** 是一個比對「兩份格式相同的 Excel」的小工具：選好舊版與新版，馬上看出哪些列被新增、刪除或修改。

整個工具只有**一個 HTML 檔**，不用安裝、不用連網，資料只在你的瀏覽器裡處理，**不會上傳到任何地方**。公司電腦無法安裝軟體也能用。

### 它能做什麼

- **找出差異**：每一列分成「新增、刪除、修改、未變」四類，結果用顏色標示（綠＝新增、紅＝刪除、黃＝修改）。
- **看到改了什麼**：被修改的儲存格會顯示「舊值 → 新值」，並列出是哪些欄位變了。
- **自訂 Key**：自己勾選哪幾個欄位組合起來代表「同一列」（例如 編號 + 尺寸），也可以按「建議 Key」讓工具先幫你挑。
- **數量差值**：勾選數量欄後，會多一欄直接顯示差值（`+3`、`-2`），可以依增加／減少篩選、排序，並顯示差值合計。
- **自動正規化**：比對前會忽略前後空白、全形半形、大小寫的差異，`10` 與 `10.0` 視為相同，避免誤報。
- **重複 Key 警告**：同一個檔案裡有重複的 Key 時不會被默默略過，會提醒你並說明是怎麼配對的。
- **篩選、搜尋、匯出**：結果可依類別篩選、全欄位搜尋，並匯出成帶顏色的 .xlsx（含摘要）。
- **大檔案可用**：數萬列的檔案可以順利處理。
- **介面**：支援繁體中文／English，以及暗色／亮色主題，右上角按鈕即可切換。

### 三步驟使用

1. **選擇檔案**：選擇舊版（Rev A）與新版（Rev B）；有多個工作表可選擇，標題列不在第 1 列也可以指定。
2. **比對設定**：勾選 Key、要比對的欄位與數量欄，按「套用並開始比對」。
3. **看結果**：查看摘要與表格，需要的話匯出成 .xlsx。

### 支援的檔案格式

`.xlsx`、`.xlsm`、`.xlsb`、`.xls`、`.ods`、`.csv`

### 注意事項

- 有密碼保護的檔案無法讀取。
- 非常舊的 Excel 5.0／95 版 `.xls`，中文可能亂碼；Big5 編碼的 CSV 也可能亂碼，建議先另存成 `.xlsx`。

---


