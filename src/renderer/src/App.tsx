import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AppShell } from './components/AppShell'

export function App(): JSX.Element {
  return (
    <ConfigProvider locale={zhCN}>
      <AppShell />
    </ConfigProvider>
  )
}
