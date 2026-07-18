import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const KIB = 1024
const MIN_LAZY_CHUNK_BYTES = 1 * KIB

// Budgets are gzip sizes. After fixing Rolldown's recursive chunk capture, the
// entry owns its real eager dependency closure instead of hiding eager code in
// statically imported "lazy" chunks. The entry budget therefore uses the
// corrected 2026-07-15 baseline (~158 KiB) with about 10% headroom.
const ENTRY_BUDGET = 175 * KIB
const LAZY_CHUNKS = [
  { name: 'ai-assistant', budget: 68 * KIB },
  { name: 'screen-trend', budget: 15 * KIB },
  { name: 'screen-stats', budget: 38 * KIB },
  { name: 'screen-settings', budget: 17 * KIB },
  { name: 'vendor-markdown', budget: 55 * KIB },
  { name: 'vendor-matter', budget: 30 * KIB },
]
// 懒边界上的全部 chunk 名（六个显式分组 + 懒屏幕共享依赖 chunk），必须与
// vite.config.ts 的 lazyChunkNames 保持一致：它们都不允许出现在 SW precache
// 清单里（预缓存会让它们随每次发版重新下载，运行时 CacheFirst 才是它们的口径）。
const PRECACHE_EXCLUDED_CHUNKS = [
  ...LAZY_CHUNKS.map((chunk) => chunk.name),
  'AiAssistant',
  'TrendScreen',
  'StatsScreen',
  'SettingsScreen',
  'savingsGoal',
]

const distDir = path.resolve(process.argv[2] ?? 'dist')
const assetsDir = path.join(distDir, 'assets')
const failures = []

function fail(message) {
  failures.push(message)
}

function formatKib(bytes) {
  return `${(bytes / KIB).toFixed(1)} KiB`
}

function gzipSize(file) {
  return gzipSync(readFileSync(file), { level: 9 }).byteLength
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findEntryFile() {
  const htmlFile = path.join(distDir, 'index.html')
  if (!existsSync(htmlFile)) {
    fail(`missing ${path.relative(process.cwd(), htmlFile)}`)
    return undefined
  }

  const html = readFileSync(htmlFile, 'utf8')
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)]
  const entryNames = scripts
    .filter(([, attributes]) => /\btype\s*=\s*["']module["']/i.test(attributes))
    .map(([, attributes]) => attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1])
    .filter(Boolean)
    .map((source) => path.basename(source.split(/[?#]/, 1)[0]))
    .filter((name) => /^index-[^.]+\.js$/i.test(name))

  if (entryNames.length !== 1) {
    fail(`expected one module entry in index.html, found ${entryNames.length}`)
    return undefined
  }

  const entryFile = path.join(assetsDir, entryNames[0])
  if (!existsSync(entryFile)) {
    fail(`entry referenced by index.html is missing: assets/${entryNames[0]}`)
    return undefined
  }
  return entryFile
}

function findLazyChunk(name, assetNames) {
  const pattern = new RegExp(`^${escapeRegExp(name)}-.+\\.js$`, 'i')
  const matches = assetNames.filter((assetName) => pattern.test(assetName))
  if (matches.length !== 1) {
    fail(`expected one ${name} chunk, found ${matches.length}`)
    return undefined
  }
  return path.join(assetsDir, matches[0])
}

// Vite/Rolldown emits static imports as complete statements. Anchoring at a
// statement boundary avoids treating import(...) and import.meta as static.
function staticImportSpecifiers(source) {
  const imports = []
  const pattern = /(?:^|[;\n}])\s*import\s*(?!\s*[.(])(?:[^;\n]*?\bfrom\s*)?["']([^"']+)["']/g
  for (const match of source.matchAll(pattern)) imports.push(match[1])
  return imports
}

if (!existsSync(assetsDir)) {
  fail(`missing ${path.relative(process.cwd(), assetsDir)}; run the production build first`)
}

const assetNames = existsSync(assetsDir) ? readdirSync(assetsDir) : []
const rows = []
const entryFile = findEntryFile()

if (entryFile) {
  const gzip = gzipSize(entryFile)
  rows.push({ label: 'entry', file: path.basename(entryFile), gzip, budget: ENTRY_BUDGET })
  if (gzip > ENTRY_BUDGET) {
    fail(`entry gzip ${formatKib(gzip)} exceeds ${formatKib(ENTRY_BUDGET)}`)
  }
}

const lazyFiles = new Map()
for (const chunk of LAZY_CHUNKS) {
  const file = findLazyChunk(chunk.name, assetNames)
  if (!file) continue

  lazyFiles.set(chunk.name, file)
  const raw = statSync(file).size
  const gzip = gzipSize(file)
  rows.push({ label: chunk.name, file: path.basename(file), gzip, budget: chunk.budget })

  if (raw < MIN_LAZY_CHUNK_BYTES) {
    fail(`${chunk.name} is effectively empty (${formatKib(raw)} raw)`)
  }
  if (gzip > chunk.budget) {
    fail(`${chunk.name} gzip ${formatKib(gzip)} exceeds ${formatKib(chunk.budget)}`)
  }
}

if (entryFile) {
  const staticImports = staticImportSpecifiers(readFileSync(entryFile, 'utf8'))
  for (const [name, file] of lazyFiles) {
    const lazyBasename = path.basename(file)
    const imported = staticImports.some((specifier) => path.basename(specifier.split(/[?#]/, 1)[0]) === lazyBasename)
    if (imported) fail(`entry statically imports lazy chunk ${name} (${lazyBasename})`)
  }
}

const swFile = path.join(distDir, 'sw.js')
if (!existsSync(swFile)) {
  fail('missing dist/sw.js; PWA service worker was not generated')
} else {
  const sw = readFileSync(swFile, 'utf8')
  const excludedPattern = new RegExp(`(?:^|[\\\\/"'])(?:${PRECACHE_EXCLUDED_CHUNKS.map(escapeRegExp).join('|')})-[^\\\\/"']*\\.js`, 'i')
  // 压缩后的 generateSW 产物里 precache 项形如 {url:"assets/xx.js",revision:null}，键名可能带或不带引号
  const precacheUrls = [...sw.matchAll(/["']?url["']?\s*:\s*["']([^"']+)["']/g)].map((match) => match[1])
  if (precacheUrls.length === 0) {
    fail('sw.js has no precache manifest entries; generateSW output format may have changed')
  }
  for (const url of precacheUrls) {
    if (excludedPattern.test(url)) fail(`sw precache includes lazy-boundary chunk: ${url}`)
  }
}

console.log('Bundle budget (gzip)')
for (const row of rows) {
  console.log(`  ${row.label.padEnd(16)} ${formatKib(row.gzip).padStart(10)} / ${formatKib(row.budget).padStart(9)}  ${row.file}`)
}

if (failures.length > 0) {
  console.error('\nBundle gate failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exitCode = 1
} else {
  console.log('\nBundle gate passed.')
}
