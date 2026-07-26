cat > RELEASE.md <<'EOF'
# 望仔 · 发版流程（版本号一致性 + 托盘自验，一道都不能省）

> 血泪教训：版本号散落在三处（package.json / tauri.conf.json / Cargo.toml），
> 漏改 Cargo.toml 会导致托盘、日志、安装后的程序内部版本仍是旧的——
> 出现"文件名是新版本、内容却是旧版本"的假版本，用户陷入更新死循环。
> 此流程的目的，是让这类错误从机制上发生不了。

## 发版五步（顺序不可乱，任何一步不通过都停下）

1. **改版本号（原子操作，绝不手动改三处）**
   ./scripts/bump-version.sh 2.7.x
   脚本会同时改 package.json / tauri.conf.json / Cargo.toml 三处，
   并验证三者一致；不一致直接报错退出，禁止继续。

2. **打包（带签名私钥）**
   export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/wangzai.key"
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<你的密码>"
   pnpm tauri build
   产物：target/release/bundle/nsis/望仔_2.7.x_x64-setup.exe 与 .exe.sig

3. **【关键·不可跳过】手动装自验托盘**
   双击安装刚 build 出来的 setup.exe，确认右下角托盘显示 2.7.x。
   托盘不是 2.7.x → 版本号没编进去，立刻停下排查，绝不发版。
   （托盘读 env!("CARGO_PKG_VERSION")，来自 Cargo.toml，这是唯一真源。）

4. **做 update.json 并发布**
   - cat 望仔_2.7.x_x64-setup.exe.sig 取纯 base64 填 signature
     （解码确认 file: 字段是 2.7.x，别拿成上一版的签名）
   - 上传 .exe 到 v2.7.x release 后，右键复制文件链接填 url（别手敲）
   - version 填 2.7.x，pubkey 用冻结的公钥不动
   - 发 v2.7.x release → updater release 删旧 update.json 传新的
   - curl 直连验 update.json 的 version / signature / url

5. **提交并打 tag**
   git add -A && git commit -m "release: v2.7.x - <说明>" --no-verify
   git tag v2.7.x && git push origin dev --no-verify && git push origin v2.7.x --no-verify

## 红线
- 三处版本号不一致，禁止 build。
- 没手动装看过托盘，禁止发版。
- 托盘版本 = 当前 exe 编译期版本，运行时不会"刷新"；托盘旧 = exe 旧，没有例外。
EOF
echo "✅ RELEASE.md 已建在: $(pwd)/RELEASE.md"