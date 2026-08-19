import type { CapacitorConfig } from '@capacitor/cli'

// Ratio iOS 原生壳配置。
// 构建流程：CAPACITOR_BUILD=1 npm run build → npx cap sync ios
// （GitHub Actions 在 macOS runner 上执行，见 .github/workflows/build-ios.yml）
const config: CapacitorConfig = {
  appId: 'com.lluviose.ratio',
  appName: 'ratio',
  webDir: 'dist',
  loggingBehavior: 'debug',
  ios: {
    // ratio 按 420px 手机框架设计，强制 mobile 视口与 UA（desktop 模式会破坏布局）
    preferredContentMode: 'mobile',
    // 与 index.css 浅色主题背景一致，避免启动/转场闪白
    backgroundColor: '#f2f4f7',
    // contentInsetAdjustmentBehavior 默认 'never'：WebView 全屏渲染、不做原生安全区避让，
    // 安全区统一由 web 端 --safe-top/--safe-bottom（env() 钳制）自理——与 PWA 独立模式同一套逻辑。
  },
}

export default config
