import getSystem from '@/utils/get-system'
const OS = getSystem()

// 望仔 · 浅色模式
export const defaultTheme = {
  primary_color: '#B8862E',      // 望仔金（深）— 白底上对比度更好
  secondary_color: '#5B6B82',    // 雾蓝
  primary_text: '#1B1E24',       // 墨夜黑
  secondary_text: '#5B6B82CC',
  info_color: '#5B7A99',
  error_color: '#D96A56',        // 陶土红
  warning_color: '#DB9A45',
  success_color: '#4C9A83',      // 苔玉绿
  background_color: '#F3F4F2',   // 瓷白
  font_family: `Manrope, Inter, -apple-system, BlinkMacSystemFont, "Microsoft YaHei UI", "Microsoft YaHei", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji"${
    OS === 'windows' ? ', twemoji mozilla' : ''
  }`,
}

// 望仔 · 深色模式
export const defaultDarkTheme = {
  ...defaultTheme,
  primary_color: '#E8B04B',      // 望仔金（亮）— 深底上更醒目
  secondary_color: '#7C8CA3',
  primary_text: '#E7E8EA',
  background_color: '#14171F',   // 墨夜
  secondary_text: '#9AA3B2CC',
  info_color: '#7C9BB8',
  error_color: '#E17F6C',
  warning_color: '#E28A4D',
  success_color: '#5FB89C',
}