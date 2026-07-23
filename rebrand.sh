#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# 望仔（Wangzai）改名脚本
# ------------------------------------------------------------
# 使用方法：
#   1. git clone https://github.com/clash-verge-rev/clash-verge-rev.git
#   2. cd clash-verge-rev
#   3. 把本脚本和 wangzai-icon.svg / wangzai-tray-icon.svg 放进项目根目录
#   4. 先跑一遍 `bash rebrand.sh --dry-run` 看看会改哪些文件，确认没问题
#      再去掉 --dry-run 真正执行
#   5. 图标文件（.ico/.icns/各尺寸 png）需要额外用工具从 SVG 生成，
#      推荐用 tauri 自带的图标生成器：
#        pnpm tauri icon wangzai-icon.svg
#      它会自动把 src-tauri/icons/ 下所有尺寸的 png/ico/icns 都替换掉。
# ============================================================

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

OLD_NAME_ZH="Clash Verge"
NEW_NAME_ZH="望仔"
OLD_NAME_EN="clash-verge"
NEW_NAME_EN="wangzai"
OLD_IDENTIFIER="io.github.clash-verge-rev.clash-verge-rev"
NEW_IDENTIFIER="dev.wangzai.app"   # 建议换成你自己的域名反写

echo "== 望仔改名脚本 =="
echo "dry_run = $DRY_RUN"
echo

run() {
  if $DRY_RUN; then
    echo "[dry-run] $*"
  else
    eval "$@"
  fi
}

# 1. package.json —— name / productName
if [[ -f package.json ]]; then
  run "sed -i.bak 's/\"name\": \"$OLD_NAME_EN\"/\"name\": \"$NEW_NAME_EN\"/' package.json"
fi

# 2. src-tauri/tauri.conf.json —— productName / identifier / 窗口标题
if [[ -f src-tauri/tauri.conf.json ]]; then
  run "sed -i.bak \
    -e 's/\"productName\": \".*\"/\"productName\": \"$NEW_NAME_ZH\"/' \
    -e \"s#$OLD_IDENTIFIER#$NEW_IDENTIFIER#g\" \
    -e \"s/$OLD_NAME_ZH/$NEW_NAME_ZH/g\" \
    src-tauri/tauri.conf.json"
fi

# 3. Cargo.toml —— package name（src-tauri 目录下）
if [[ -f src-tauri/Cargo.toml ]]; then
  run "sed -i.bak \"s/^name = \\\"$OLD_NAME_EN\\\"/name = \\\"$NEW_NAME_EN\\\"/\" src-tauri/Cargo.toml"
fi

# 4. 全局文本替换：窗口标题、about 弹窗、README 里出现的显示名
#    注意：这一步范围较大，先用 dry-run 看看命中的文件再决定是否全部替换
echo
echo "-- 以下文件包含 \"$OLD_NAME_ZH\" 字样，需要人工确认是否替换 --"
grep -rl "$OLD_NAME_ZH" --include="*.tsx" --include="*.ts" --include="*.rs" \
  --include="*.json" src src-tauri 2>/dev/null || true

echo
echo "-- 以下文件包含 \"Clash Verge Rev\" / \"clash-verge-rev\" 字样 --"
grep -rl "clash-verge-rev\|Clash Verge Rev" --include="*.tsx" --include="*.ts" \
  --include="*.rs" --include="*.json" --include="*.toml" src src-tauri 2>/dev/null || true

# 5. 图标：把新图标复制到项目根目录，之后手动跑 tauri icon 命令生成全部尺寸
if [[ -f wangzai-icon.svg ]]; then
  run "cp wangzai-icon.svg src-tauri/icons/wangzai-source.svg"
  echo
  echo ">> 图标已放到 src-tauri/icons/wangzai-source.svg"
  echo ">> 接下来手动执行： pnpm tauri icon src-tauri/icons/wangzai-source.svg"
fi

echo
echo "== 完成。请检查上面列出的文件，把还残留的旧名字手动改掉，然后重新 pnpm i && pnpm dev 验证 =="
