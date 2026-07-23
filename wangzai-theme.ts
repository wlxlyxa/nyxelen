/**
 * 望仔 · 主题 Token
 * -------------------------------------------------
 * 用法：
 * 1. 在你 clone 下来的 clash-verge-rev 项目里，搜索 `createTheme(`（通常在
 *    src/pages/_theme.tsx 或 src/services/theme.ts 附近，不同版本路径略有差异）。
 * 2. 把该文件里原来传给 createTheme() 的 palette / typography / shape / components
 *    对象，整体替换为下面 export 出的 wangzaiTheme(mode) 的返回值。
 * 3. 如果项目里另有 tray 图标切换、CSS 变量注入的逻辑，把 COLORS 里的值同步过去即可，
 *    保证托盘、窗口、网页三处配色一致。
 */

import { createTheme, type PaletteMode } from "@mui/material/styles";

export const COLORS = {
  inkDark: "#14171F", // 深色模式背景
  paperLight: "#F3F4F2", // 浅色模式背景
  gold: "#E8B04B", // 主色：望仔金
  fog: "#5B6B82", // 辅助：雾蓝
  jade: "#4C9A83", // 成功态
  clay: "#D96A56", // 警示态
  textDark: "#E7E8EA",
  textLight: "#1B1E24",
};

export function wangzaiTheme(mode: PaletteMode) {
  const isDark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary: { main: COLORS.gold, contrastText: "#14171F" },
      secondary: { main: COLORS.fog },
      success: { main: COLORS.jade },
      error: { main: COLORS.clay },
      background: {
        default: isDark ? COLORS.inkDark : COLORS.paperLight,
        paper: isDark ? "#1B1F29" : "#FFFFFF",
      },
      text: {
        primary: isDark ? COLORS.textDark : COLORS.textLight,
        secondary: COLORS.fog,
      },
      divider: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    },
    typography: {
      fontFamily:
        '"Manrope", "Inter", "PingFang SC", "Noto Sans SC", -apple-system, sans-serif',
      h1: { fontWeight: 700, letterSpacing: "-0.01em" },
      h2: { fontWeight: 700, letterSpacing: "-0.01em" },
      h6: { fontWeight: 600 },
      body1: { fontSize: 14 },
      body2: { fontSize: 13, color: COLORS.fog },
      button: { fontWeight: 600, textTransform: "none" },
    },
    shape: {
      borderRadius: 10,
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            boxShadow: isDark
              ? "0 1px 2px rgba(0,0,0,0.4)"
              : "0 1px 3px rgba(20,23,31,0.06)",
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            boxShadow: "none",
          },
          containedPrimary: {
            boxShadow: "none",
            "&:hover": { boxShadow: "none" },
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          root: { padding: 8 },
          switchBase: {
            "&.Mui-checked": { color: COLORS.gold },
            "&.Mui-checked + .MuiSwitch-track": {
              backgroundColor: COLORS.gold,
              opacity: 0.5,
            },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { backgroundColor: COLORS.gold, height: 2 },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 8, fontWeight: 500 },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: isDark
              ? "1px solid rgba(255,255,255,0.06)"
              : "1px solid rgba(20,23,31,0.06)",
          },
        },
      },
    },
  });
}
