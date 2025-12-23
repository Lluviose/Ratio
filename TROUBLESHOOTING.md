# 排错与记录

本文件记录项目开发过程中遇到的典型问题与处理思路，便于后续快速定位。

## 构建失败：使用 `motion` 但未导入

现象：

- `npm run build` 在 `tsc -b` 阶段报错，提示 `motion`（或 `AnimatePresence`）未定义。

处理：

- 确认组件文件已从 `framer-motion` 显式导入对应符号，例如：
  - `import { motion, AnimatePresence } from 'framer-motion'`

## Lint 阻断：React Hooks 相关规则

### `react-hooks/rules-of-hooks`

现象：

- Hook（如 `useMemo` / `useEffect`）在条件分支后调用，导致 “Hook 调用顺序不一致”。

处理：

- 保证所有 Hook 始终在组件顶层按固定顺序调用；分支逻辑放到 Hook 内部（例如在 `useMemo` 里 `return` 不同值），或把 early return 放在所有 Hook 之后。

### `react-hooks/static-components`

现象：

- 在 render 过程中动态创建/切换组件引用（例如 `const Icon = getIcon(type)`），被判定为“每次渲染创建新组件”。

处理：

- 使用稳定的组件引用或直接 `createElement(Component, props)`。

### `react-hooks/exhaustive-deps`

现象：

- `useEffect` 依赖数组不完整导致警告/错误。

处理：

- 补全依赖项；必要时重构以减少对闭包变量的隐式依赖。

