# 排错与记录

本文件记录项目开发过程中遇到的典型问题与处理思路，便于后续快速定位。

## iOS PWA 首开：占比页展开动画丢帧/跳帧

现象：

- 冷启动 PWA 后立刻滑到占比页点开分类详情，展开弹簧动画偶发直接跳到终态；先访问一次趋势/统计再回来就流畅。

原因：

- 首开后台会预热懒加载分包（趋势/统计/设置/AI，共 700KB+ 原始体积），`requestIdleCallback` 只知道「当前帧有空闲」，不知道一个手势驱动的动画正要开始——用户点开详情的瞬间恰是 rIC 眼里的空闲点，此时解析 300KB+ 脚本会阻塞主线程数百毫秒，而展开动画按几何约束只能动 x/y/width/height（JS rAF 驱动，主线程受阻即跳帧）。访问过趋势/统计后分包已解析完毕，故恢复流畅。

处理（`src/App.tsx` 的 `scheduleBackgroundTabPreloads`）：

- 预热链从小到大逐块串行（settings → stats → trend → AI），块间留 1.2s 空隙。
- 交互静默门控：距最近一次 `pointerdown`/`touchmove` 不足 1.6s 时不启动任何分包解析，改为重排稍后再试，保证手势后的动画窗口不被解析打断。
- AI 分包也纳入链尾统一治理，顺带消除「首次点 AI 按钮时面板动画被解析卡住」的同类问题（唯一动态导入点在 `src/components/aiAssistantLoader.ts`）。

## E2E 不稳定：Windows 无头 WebKit 下 `toBeHidden` 偶发超时

现象：

- `ratio-breakdown.spec.ts` 在 `mobile-safari` 项目下偶发（负载相关，可到 3/3 复现）在“收起面板”断言超时；chromium / mobile-chrome 稳定通过。
- 页面内日志证明应用状态机完全正确：`requestClose → 兜底定时器 → onClosed → setExpanded(null)` 全部按时执行，但 DOM 节点在断言窗口内迟迟不消失。
- 任何从 Node 侧发起的 `page.evaluate` 都会“泵”事件循环，节点随即被移除——因此加了探针/trace 就必现通过（海森 bug）。

原因：

- Windows 无头 WebKit 在页面空闲时会节流渲染管线，`expect(locator).toBeHidden()` 的页内轮询依赖 rAF，被一起饿死；应用代码本身没有问题。

处理：

- 对“面板已卸载”类断言改用 `expect.poll(() => locator.count()).toBe(0)`：每次轮询都是 Node 侧发起的新求值，不受页面节流影响（本 spec 的 `gotoRatioPage` 早已用同样手法等待滚动位置）。
- 不要为此改动应用侧交互代码；真实 iOS Safari 不受影响。

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

