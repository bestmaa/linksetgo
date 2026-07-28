import { readdir, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const standaloneRoot = resolve(process.cwd(), '.next', 'standalone')

const isEnvironmentFile = (name) => name === '.env' || name.startsWith('.env.')

const removeEnvironmentFiles = async (directory) => {
  let entries

  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return 0
    }

    throw error
  }

  let removed = 0

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      removed += await removeEnvironmentFiles(entryPath)
      continue
    }

    if (entry.isFile() && isEnvironmentFile(entry.name)) {
      await unlink(entryPath)
      removed += 1
    }
  }

  return removed
}

const removed = await removeEnvironmentFiles(standaloneRoot)

if (removed > 0) {
  console.log(`Removed ${removed} environment file(s) from the standalone build output.`)
}
