import { test, expect } from './fixtures'

test.describe('keyboard shortcuts', () => {
  test('Ctrl+F focuses search input', async ({ page }) => {
    // 等输入框存在，确保 AppShell 已挂载，useShortcuts 也已注册
    const input = page.getByTestId('search-input')
    await expect(input).toBeVisible()
    // 点一下空白处确保 window 内的非输入元素获得焦点（避免事件被吞）
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Control+f')
    await expect(input).toBeFocused()
  })

  test('"/" focuses search input when not in input', async ({ page }) => {
    const input = page.getByTestId('search-input')
    await expect(input).toBeVisible()
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('/')
    await expect(input).toBeFocused()
  })

  test('Esc clears keyword when no selection', async ({
    page,
    app,
    writeSource
  }) => {
    const src = await writeSource('shortcut.pdf', 'data')
    await app.evaluate(async ({ dialog }, p) => {
      dialog.showOpenDialog = async () =>
        ({ canceled: false, filePaths: [p] }) as never
    }, src)
    await page.getByRole('button', { name: '导入文件' }).click()
    await expect(
      page.getByTestId('file-table').getByText('shortcut.pdf')
    ).toBeVisible()

    // 输入关键词
    await page.getByTestId('search-input').fill('xxx')
    await expect(page.getByTestId('empty-no-match')).toBeVisible()

    // Esc 清空 keyword（应回到原列表）
    await page.keyboard.press('Escape')
    await expect(
      page.getByTestId('file-table').getByText('shortcut.pdf')
    ).toBeVisible()
  })
})
