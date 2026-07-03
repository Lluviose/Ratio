// React Compiler 共享配置：vite.config.ts 与 vitest.config.ts 必须使用同一份，
// 保证单测运行的转换结果与产物一致。
//
// 范围策略：只编译懒加载屏幕树（stats/trend/settings/AI）。
// - 首包（App/Assets 系列/共享组件）不编译：热路径是 MotionValue 驱动（本就零重渲染）
//   且已手工记忆化，而编译产物会让首包 gzip +≈20KB，违反首包纪律（见 PROJECT.md）。
// - 懒屏幕收益真实（切换区间/算法会整树重渲染），且体积增长由 SW 缓存吸收。
// 逐文件编译/跳过明细：node scripts/compiler-report.mjs

const COMPILED_PATHS = [
  'src/screens/TrendScreen.tsx',
  'src/screens/StatsScreen.tsx',
  'src/screens/SettingsScreen.tsx',
  'src/screens/stats/',
  'src/components/AiAssistant.tsx',
]

export const reactCompilerBabelConfig = {
  plugins: [
    [
      'babel-plugin-react-compiler',
      {
        sources: (filename: string) => {
          const normalized = filename.replace(/\\/g, '/')
          return COMPILED_PATHS.some((p) => normalized.includes(p))
        },
      },
    ],
  ],
}
