import io, re
p = 'src/index.html'
s = io.open(p, encoding='utf-8').read()
new = re.sub(r'<!-- DEBUG-OVERLAY-INJECT -->.*?(?=<script type="module")', '', s, flags=re.S)
if new == s:
    # 兜底：万一锚点变了，按注释块整段删
    new = re.sub(r'<!-- DEBUG-OVERLAY-INJECT -->.*?</script>\s*', '', s, flags=re.S)
io.open(p, 'w', encoding='utf-8', newline='').write(new)
print('REMOVED' if new != s else 'NOTHING TO REMOVE')
