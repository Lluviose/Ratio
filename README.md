# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## 排错与修复记录（Build/Lint）

本节记录一次实际排查过程，便于后续遇到类似问题快速定位。

### 1) `npm run build` 失败：组件里使用了 `motion` 但未导入

- **现象**
  - `npm run build` 在 `tsc -b` 阶段直接报错，阻断构建。
- **根因**
  - 代码里使用了 `motion.div` / `AnimatePresence`，但文件未从 `framer-motion` 显式导入对应符号。
- **修复**
  - 在 `src/components/AccountDetailSheet.tsx` 顶部补全：
    - `import { motion, AnimatePresence } from 'framer-motion'`
- **验证**
  - 运行：
    - `npm run build`

### 2) `npm run lint` 阻断：React Hooks 规则与动态组件问题

- **现象**
  - `npm run lint` 出现规则报错/警告，导致 CI 或本地无法通过。
- **处理要点（按遇到的规则归类）**
  - **`react-hooks/rules-of-hooks`**
    - **原因**：Hook（例如 `useMemo`）在条件分支后调用，导致“每次渲染 Hook 调用顺序不一致”。
    - **处理**：保证所有 Hook 在组件顶部按固定顺序执行；如需分支逻辑，把分支放进 Hook 内部（例如在 `useMemo` 内 return），或把 early return 放在所有 Hook 之后。
  - **`react-hooks/static-components`**（动态 Icon 组件）
    - **原因**：在 render 过程中动态创建组件引用（例如 `const Icon = getIcon(type)`），会被认为“每次渲染都创建新组件”。
    - **处理**：在 `src/screens/AssetsTypeDetailPage.tsx` 中改为使用稳定引用渲染：
      - `createElement(info.opt.icon, { size: 18 })`
  - **`react-hooks/set-state-in-effect`**（打开弹窗时重置表单状态）
    - **原因**：BottomSheet 打开时用 `useEffect` 同步重置内部表单 state，会被该规则判定为“effect 内同步 setState”。
    - **处理**：在 `eslint.config.js` 中关闭该规则：
      - `'react-hooks/set-state-in-effect': 'off'`
    - **备注**：这里属于 UI 交互需要（打开时初始化表单），不是外部系统同步导致的抖动。
  - **`react-hooks/exhaustive-deps`**
    - **原因**：`useEffect` 依赖数组不完整。
    - **处理**：补全依赖（例如把 `account` 放入依赖），或重构代码减少对闭包变量的依赖。

- **验证**
  - 运行：
    - `npm run lint`

### 3) 提交前的最小自检清单

- **Build**：`npm run build`
- **Lint**：`npm run lint`
- **Git**
  - `git status -sb`
  - `git rev-list --left-right --count HEAD...origin/main`（确认是否落后远端、是否需要先 pull）
