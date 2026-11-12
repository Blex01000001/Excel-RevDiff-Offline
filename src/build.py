"""把 SheetJS 與版本號內嵌進 template.html，輸出單一離線檔 ../index.html

用法：
  python3 src/build.py          建置並寫入 index.html
  python3 src/build.py --check  只檢查 index.html 是否和目前的 template／VERSION／SheetJS 建置結果一致
                                （不一致就以非 0 結束，供測試與 CI 使用）
"""
import pathlib
import sys

d = pathlib.Path(__file__).parent
t = (d / 'template.html').read_text(encoding='utf-8')
lib = (d / 'xlsx.core.min.js').read_text(encoding='utf-8')
assert '</script' not in lib.lower()
head, tail = t.split('/*__SHEETJS__*/')
version = (d / 'VERSION').read_text(encoding='utf-8').strip()
out = head + "/* SheetJS Community Edition 0.18.5 (Apache-2.0) */\n" + lib + tail
out = out.replace("__APP_VERSION__", version)
target = d.parent / 'index.html'

if '--check' in sys.argv:
    current = target.read_text(encoding='utf-8') if target.exists() else ''
    if current != out:
        print('index.html is out of date: run `python3 src/build.py` and commit the result.')
        sys.exit(1)
    print('index.html is up to date.')
else:
    target.write_text(out, encoding='utf-8')
    print('index.html', len(out), 'bytes')
