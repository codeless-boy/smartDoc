/**
 * 生成不与 taken 集合重复的文件名。
 * 在最后一个点之前插入 " (n)"，n 从 2 起递增；无扩展名则追加在末尾。
 * 比对时大小写不敏感。
 */
export function nextSequenceName(name: string, taken: ReadonlySet<string>): string {
  const lowerTaken = new Set([...taken].map((s) => s.toLowerCase()))
  if (!lowerTaken.has(name.toLowerCase())) return name

  const lastDot = name.lastIndexOf('.')
  const base = lastDot > 0 ? name.slice(0, lastDot) : name
  const ext = lastDot > 0 ? name.slice(lastDot) : ''

  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base} (${n})${ext}`
    if (!lowerTaken.has(candidate.toLowerCase())) return candidate
  }
  throw new Error(`nextSequenceName: gave up after 10000 tries for "${name}"`)
}
