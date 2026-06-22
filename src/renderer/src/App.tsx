import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AppShell } from './components/AppShell'
import { theme } from './theme'

export function App(): JSX.Element {
  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      <AppShell />
    </ConfigProvider>
  )
}
