import { test, expect } from './fixtures'

test.describe('tags and search', () => {
  test.beforeEach(async ({ page, app, writeSource }) => {
    // 预置三条文件
    const a = await writeSource('Report.pdf')
    const b = await writeSource('photo.jpg')
    const c = await writeSource('plan.txt')
    await app.evaluate(
      async ({ dialog }, [pa, pb, pc]) => {
        dialog.showOpenDialog = async () =>
          ({ canceled: false, filePaths: [pa, pb, pc] } as any)
      },
      [a, b, c]
    )
    await page.getByRole('button', { name: '导入文件' }).click()
    await expect(page.getByTestId('file-table').getByText('Report.pdf')).toBeVisible()
  })

  test('add tag via drawer; click in side panel to filter', async ({ page }) => {
    // 点 Report.pdf 行 → 抽屉
    await page.getByTestId('file-table').getByText('Report.pdf').click()
    const drawer = page.getByTestId('file-drawer')
    await expect(drawer).toBeVisible()

    // 在 Select(mode=tags) 中输入并提交
    const select = drawer.locator('.ant-select')
    await select.click()
    await page.keyboard.type('work')
    await page.keyboard.press('Enter')
    await expect(drawer.getByText('work')).toBeVisible()

    // 关抽屉，点击侧栏的 work 标签
    // 第一次 Escape 关闭 Select 下拉，第二次 Escape 关闭 Drawer
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(drawer).not.toBeVisible()
    await page.getByText('work', { exact: true }).first().click()

    const table = page.getByTestId('file-table')
    await expect(table.getByText('Report.pdf')).toBeVisible()
    await expect(table.getByText('photo.jpg')).toHaveCount(0)
  })

  test('keyword search filters table after debounce', async ({ page }) => {
    await page.getByPlaceholder('搜索文件名 / 标签 / 备注').fill('plan')
    const table = page.getByTestId('file-table')
    await expect(table.getByText('plan.txt')).toBeVisible()
    await expect(table.getByText('Report.pdf')).toHaveCount(0)
    await expect(table.getByText('photo.jpg')).toHaveCount(0)
  })
})
