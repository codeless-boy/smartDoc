import type { ThemeConfig } from 'antd'

/**
 * smartDoc 0.2.0 主题：干净克制（中性灰阶 + 单点墨色强调）。
 * 配色/圆角/字号集中在此；组件内联样式应引用 token，不再硬编码色值。
 */
export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#1f1f1f', // 强调色：墨色（按钮/选中态/链接）
    colorBgLayout: '#f7f8fa', // 页面底
    colorBgContainer: '#ffffff', // 卡片/表格行底
    colorBorder: '#e8e8e8', // 细而淡的分割线
    colorBorderSecondary: '#f0f0f0', // 次级分割线
    colorText: '#1f1f1f',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    borderRadius: 6,
    fontSize: 13, // 比默认 14 略小，紧凑
    controlHeight: 30
  },
  components: {
    Table: {
      headerBg: '#fafafa',
      headerSplitColor: 'transparent',
      rowHoverBg: '#f5f5f5'
    },
    Layout: { siderBg: '#ffffff', headerBg: '#ffffff' },
    Button: { primaryShadow: 'none' },
    Tag: { defaultBg: '#f5f5f5' }
  }
}
