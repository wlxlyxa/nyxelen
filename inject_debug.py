import io, re
p = 'src/index.html'
s = io.open(p, encoding='utf-8').read()

# 1) 先删掉上一版注入块（如果存在）
s = re.sub(r'<!-- DEBUG-OVERLAY-INJECT -->.*?(?=<script type="module")', '', s, flags=re.S)

MARK = '<!-- DEBUG-OVERLAY-INJECT -->'
js = r'''<script>
(function(){
  // 透明顶部条，绝不遮挡界面
  var bar=document.createElement('div');
  bar.id='__dbg';
  bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;background:rgba(0,0,0,.82);color:#0f0;font:12px/1.4 monospace;white-space:pre-wrap;word-break:break-word;max-height:45vh;overflow:auto;padding:6px 10px;border-bottom:2px solid #0f0;';
  document.documentElement.appendChild(bar);
  function log(t,c){var d=document.createElement('div');if(c)d.style.color=c;d.textContent=t;bar.appendChild(d);}
  log('[DBG] overlay v2 (transparent) @ '+new Date().toLocaleTimeString());

  // 抓 window 级错误
  window.addEventListener('error',function(e){
    var s=(e.error&&e.error.stack)?e.error.stack:(e.message+' @ '+(e.filename||'')+':'+(e.lineno||''));
    log('[WIN-ERROR] '+s,'#f88');
  },true);
  window.addEventListener('unhandledrejection',function(e){
    var r=e.reason;log('[REJECTION] '+((r&&r.stack)?r.stack:String(r)),'#f88');
  });

  // 关键：抓 main.tsx 这个 module 的加载/解析失败（不冒泡到 window 的那种）
  var ms=document.querySelector('script[type="module"][src*="main.tsx"]');
  if(ms){
    log('[DBG] found main.tsx module tag, src='+ms.getAttribute('src'));
    ms.addEventListener('error',function(){log('[MODULE-LOAD-FAIL] main.tsx 加载/解析失败！看下方网络/终端','#f44');});
  } else {
    log('[DBG] WARN: 没找到 main.tsx 的 module 标签！','#ff0');
  }

  // 探针：main.tsx 执行后会设置这个标记
  window.__MAIN_RAN__ = false;

  // 3 秒后体检：main 跑没跑？React 挂没挂？root 里有啥？
  setTimeout(function(){
    log('---- 3s 体检 ----','#ff0');
    log('window.__MAIN_RAN__ = '+window.__MAIN_RAN__+(window.__MAIN_RAN__?'  ✅ main.tsx 执行了':'  ❌ main.tsx 没执行(module 加载失败)'),'#ff0');
    var root=document.getElementById('root');
    log('#root 存在 = '+!!root);
    if(root){
      log('#root.childElementCount = '+root.childElementCount+(root.childElementCount>0?'  ✅ React 挂载了':'  ❌ root 是空的(React 没渲染)'),'#ff0');
      log('#root.innerHTML 前120字 = '+JSON.stringify(root.innerHTML.slice(0,120)));
    }
    log('document.readyState = '+document.readyState);
  },3000);
})();
</script>'''
block = MARK + '\n    ' + js + '\n    '
anchor = '<script type="module" src="./main.tsx"></script>'
if anchor in s:
    # 在 main.tsx 标签里塞一个 onload/onerror 不行(module 不支持 onload  reliably)，改用上面的 addEventListener
    # 同时在 main.tsx 之前插入探针标记设置：让 main.tsx 自己无法设置，所以我们靠它在 main 之后？
    io.open(p,'w',encoding='utf-8',newline='').write(s.replace(anchor, block + anchor, 1))
    print('INJECTED v2 OK')
else:
    print('ANCHOR NOT FOUND')
