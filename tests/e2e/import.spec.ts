import { test, expect } from './fixtures'

test.describe('import', () => {
  test('import via dialog adds row to table', async ({
    page,
    app,
    writeSource
  }) => {
    const src = await writeSource('hello.pdf', 'pdf-bytes')

    // mock dialog.showOpenDialog 返回我们指定的路径
    await app.evaluate(async ({ dialog }, p) => {
      dialog.showOpenDialog = async () =>
        ({ canceled: false, filePaths: [p] }) as any
    }, src)

    await page.getByRole('button', { name: '导入文件' }).click()

    const table = page.getByTestId('file-table')
    await expect(table.getByText('hello.pdf')).toBeVisible()
  })

  test('duplicate filename triggers dialog and "keep both" produces a (2)', async ({
    page,
    app,
    writeSource
  }) => {
    const src1 = await writeSource('dup.pdf', 'v1')

    await app.evaluate(async ({ dialog }, p) => {
      dialog.showOpenDialog = async () =>
        ({ canceled: false, filePaths: [p] }) as any
    }, src1)

    await page.getByRole('button', { name: '导入文件' }).click()
    await expect(
      page.getByTestId('file-table').getByText('dup.pdf')
    ).toBeVisible()

    // 第二次导入同名
    await page.getByRole('button', { name: '导入文件' }).click()
    await expect(page.getByText('文件已存在')).toBeVisible()

    await page.getByText('保留两份').click()
    await expect(
      page.getByTestId('file-table').getByText('dup (2).pdf')
    ).toBeVisible()
  })
})
