"""把 SheetJS 內嵌進 template.html，輸出單一離線檔 ../index.html"""
import pathlib
d = pathlib.Path(__file__).parent
t = (d / 'template.html').read_text(encoding='utf-8')
lib = (d / 'xlsx.core.min.js').read_text(encoding='utf-8')
assert '</script' not in lib.lower()
head, tail = t.split('/*__SHEETJS__*/')
version = (d / 'VERSION').read_text(encoding='utf-8').strip()
out = head + "/* SheetJS Community Edition 0.18.5 (Apache-2.0) */\n" + lib + tail
out = out.replace("__APP_VERSION__", version)
(d.parent / 'index.html').write_text(out, encoding='utf-8')
print('index.html', len(out), 'bytes')
