mkdir -p scripts
cat > scripts/bump-version.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
V="${1:-}"
[ -z "$V" ] && { echo "用法: ./scripts/bump-version.sh <版本号>  例: ./scripts/bump-version.sh 2.7.4"; exit 1; }

# 三处一起改：0,/re/ 只改首个匹配，^ 锚行首只动 [package]，绝不误伤 dependencies
sed -i "0,/\"version\": \"[0-9.]*\"/s//\"version\": \"$V\"/" package.json
sed -i "0,/\"version\": \"[0-9.]*\"/s//\"version\": \"$V\"/" src-tauri/tauri.conf.json
sed -i "s/^version = \"[0-9.]*\"/version = \"$V\"/" src-tauri/Cargo.toml

# 改完立即验证三处一致，不一致就报错拦住发版
P=$(grep -o '"version": "[0-9.]*"' package.json | head -1 | grep -o '[0-9.]*$')
T=$(grep -o '"version": "[0-9.]*"' src-tauri/tauri.conf.json | head -1 | grep -o '[0-9.]*$')
C=$(grep -m1 '^version = "[0-9.]*"' src-tauri/Cargo.toml | grep -o '[0-9.]*$')
echo "package.json=$P  tauri.conf.json=$T  Cargo.toml=$C"
if [ "$P" = "$V" ] && [ "$T" = "$V" ] && [ "$C" = "$V" ]; then
  echo "✅ 三处版本号已统一为 $V"
else
  echo "❌ 三处版本号不一致，发版中止！" >&2; exit 1
fi
EOF
chmod +x scripts/bump-version.sh
echo "✅ bump-version.sh 已建在: $(pwd)/scripts/bump-version.sh"