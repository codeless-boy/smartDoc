import { test, expect } from './fixtures'

test.describe('context menu', () => {
  test('right-click file row opens menu; copy filename writes clipboard', async ({
    page,
    app,
    writeSource
  }) => {
    const src = await writeSource('ctx-target.pdf', 'data')

    await app.evaluate(async ({ dialog }, p) => {
      dialog.showOpenDialog = async () =>
        ({ canceled: false, filePaths: [p] }) as never
    }, src)

    await page.getByRole('button', { name: '导入文件' }).click()
    const row = page.getByTestId('file-table').getByText('ctx-target.pdf')
    await expect(row).toBeVisible()

    // 右键唤起菜单
    await row.click({ button: 'right' })

    // 菜单项可见（scope 到 menu 内，避免与抽屉里的 "打开文件" 按钮冲突）
    const menu = page.getByRole('menu')
    await expect(menu.getByText('打开文件')).toBeVisible()
    await expect(menu.getByText('在文件夹中定位')).toBeVisible()
    await expect(menu.getByText('复制文件名')).toBeVisible()
    await expect(menu.getByText('复制路径')).toBeVisible()

    // 点 "复制文件名" → 应弹出成功 toast
    await menu.getByText('复制文件名').click()
    await expect(page.getByText('已复制文件名')).toBeVisible()
  })

  test('Esc closes the context menu', async ({ page, app, writeSource }) => {
    const src = await writeSource('esc-test.pdf', 'data')
    await app.evaluate(async ({ dialog }, p) => {
      dialog.showOpenDialog = async () =>
        ({ canceled: false, filePaths: [p] }) as never
    }, src)
    await page.getByRole('button', { name: '导入文件' }).click()

    const row = page.getByTestId('file-table').getByText('esc-test.pdf')
    await row.click({ button: 'right' })
    const menu = page.getByRole('menu')
    await expect(menu.getByText('复制文件名')).toBeVisible()

    // 直接派发 Esc 到 window，绕过 antd Menu 内部的 keydown 拦截
    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    })
    await expect(menu).toHaveCount(0)
  })
})
