// 临时脚本：对 src 下所有组件/Hook 运行 React Compiler，统计编译成功与跳过原因
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import path from 'node:path'
import * as babel from '@babel/core'

const files = globSync('src/**/*.{ts,tsx}', {
  exclude: (f) => f.includes('.test.') || f.includes('src/test/'),
})

const results = []

for (const file of files) {
  const code = readFileSync(file, 'utf8')
  const events = []
  try {
    await babel.transformAsync(code, {
      filename: path.resolve(file),
      babelrc: false,
      configFile: false,
      parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
      plugins: [
        [
          'babel-plugin-react-compiler',
          {
            panicThreshold: 'none',
            logger: {
              logEvent(_filename, event) {
                events.push(event)
              },
            },
          },
        ],
      ],
    })
  } catch (err) {
    results.push({ file, error: String(err.message).split('\n')[0] })
    continue
  }
  const ok = events.filter((e) => e.kind === 'CompileSuccess')
  const skip = events.filter((e) => e.kind === 'CompileError' || e.kind === 'CompileSkip')
  if (ok.length + skip.length > 0) results.push({ file, ok, skip })
}

let totalOk = 0
let totalSkip = 0
for (const r of results) {
  if (r.error) {
    console.log(`PARSE-FAIL ${r.file}: ${r.error}`)
    continue
  }
  totalOk += r.ok.length
  totalSkip += r.skip.length
  if (r.skip.length > 0) {
    console.log(`\n${r.file}: ${r.ok.length} compiled, ${r.skip.length} skipped`)
    for (const s of r.skip) {
      const name = s.fnName ?? s.fnLoc?.start ? `${s.fnName ?? 'anon'}@L${s.fnLoc?.start?.line}` : 'unknown'
      const reason = s.detail?.reason ?? s.detail?.options?.reason ?? JSON.stringify(s.detail)?.slice(0, 140)
      console.log(`  SKIP ${name}: ${reason}`)
    }
  }
}
console.log(`\n=== total: ${totalOk} compiled, ${totalSkip} skipped/bailed ===`)
