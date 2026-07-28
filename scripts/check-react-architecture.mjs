import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const sourceRoot = path.resolve('src')
const failures = []
const viewFilePattern = /(?:^|[/\\])view(?:s)?[/\\].*\.tsx$|View\.tsx$|\.view\.tsx$/
const forbiddenViewPatterns = [
  [/\bfetch\s*\(/, 'fetch'],
  [/\buseEffect\s*\(/, 'useEffect'],
  [/\buseReducer\s*\(/, 'useReducer'],
  [/\buseRouter\s*\(/, 'useRouter'],
  [/\buseState\s*\(/, 'useState'],
  [/\bgetPayload\s*\(/, 'getPayload'],
  [/from\s+['"]payload['"]/, 'Payload import'],
  [/from\s+['"]next\/navigation['"]/, 'Next navigation import'],
]

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      return entry.isDirectory() ? collectFiles(entryPath) : [entryPath]
    }),
  )

  return nested.flat()
}

for (const filePath of await collectFiles(sourceRoot)) {
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) continue

  const source = await readFile(filePath, 'utf8')
  const relativePath = path.relative(process.cwd(), filePath)
  if (source.includes('NEXT_PUBLIC_LINK_DOMAIN')) {
    failures.push(
      `${relativePath}: tenant link origins must come from authenticated runtime config`,
    )
  }

  const isFeatureTypeScript =
    filePath.includes(`${path.sep}features${path.sep}`) && filePath.endsWith('.ts')
  if (!filePath.endsWith('.tsx') && !isFeatureTypeScript) continue

  const lineCount = source.split(/\r?\n/).length

  if (lineCount > 250) {
    failures.push(`${relativePath}: ${lineCount} lines (maximum is 250)`)
  }

  if (viewFilePattern.test(filePath)) {
    for (const [pattern, label] of forbiddenViewPatterns) {
      if (pattern.test(source)) {
        failures.push(`${relativePath}: props-only view contains ${label}`)
      }
    }
  }
}

if (failures.length > 0) {
  console.error('React architecture checks failed:\n')
  console.error(failures.map((failure) => `- ${failure}`).join('\n'))
  process.exitCode = 1
} else {
  console.log('React architecture checks passed.')
}
