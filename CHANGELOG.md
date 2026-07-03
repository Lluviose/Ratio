# Changelog

## 2026-07-04 - 重设计主题配色（Macke 除外）

- 五套主题按画家视觉语汇重新设计调色板：Matisse（柠檬黄/韦罗内塞绿/钴蓝/灰玫瑰/纸灰）、Matisse 2（祖母绿/靛蓝/深海军/青瓷蓝/雾靛灰）、Mondrian（镉黄/深胭脂红/群青/画廊灰/格线黑）、Kandinsky（橙/紫红/石油蓝/玫瑰粉/淡丁香灰）、Miro（明黄/天青/朱红/草绿/墨黑）；Macke 保持不变。
- 修复原配色的三处结构问题：Mondrian 与 Kandinsky 共用同一强调色（#ef4444）、Matisse 强调色与 Macke 珊瑚色近乎重复、部分 receivable 色过浅在气泡/图表中发虚。
- 六套主题强调色（invest，即 `--primary`）现分属六个色相族：viridian 绿 / 靛蓝 / 珊瑚 / 胭脂红 / 紫红 / 天青，主题间辨识度显著提升。
- 全部配色经脚本校验：按应用自身亮度阈值（0.62）确认每个色块的前景文字色，主题内与主题间强调色两两距离达标（仅保留 Macke 原有的一处既有近似对）。
- 同步 `index.css` 六个 `[data-theme]` 的 `--primary` 首屏回退值（此前全部与实际主题色脱节），`:root` 基础值对齐默认主题 Matisse 2。
- 已通过 `npm run lint`、`npm test`、`npm run build` 和 `npm run test:e2e`（18 项）验证。

## 2026-07-04 - 全局动效精细化与流畅度优化

- 动效词汇表（`src/lib/motionPresets.ts`）全面扩充：新增 emphasized/silk/exit/overshoot 缓动、snappy/gentle/bouncy/sheet 弹簧、tap 触感预设与 stagger 编排工具（`staggerDelay`、`cardEntranceAt` 等），所有旧导出保持兼容。
- 全局稳定性：App 外层包裹 `MotionConfig reducedMotion="user"`，配合 CSS `prefers-reduced-motion` 守卫，系统级减弱动态偏好下自动禁用位移动画；SegmentedControl/PillTabs 的 layoutId 改为按实例隔离，修复同屏多控件指示器互相飞行的隐患。
- 组件触感升级：底部抽屉改弹簧入场、加速离场；开关按钮加入挤压回弹；Toast 支持弹簧入场、layout 重排与上滑手势关闭；骨架屏改为流光扫过并按序浮现。
- 屏幕级编排：统计页卡片瀑布式入场，里程碑庆祝重做为徽章弹跳 + 辐射圆环 + 彩带粒子的一次性序列；引导页文案方向感知滑入、指示点弹簧变形；AI 助手消息气泡弹入并新增打字指示动画；资产列表/详情/新增账户各级列表统一弹簧错峰入场，弹出菜单统一弹簧展开、快速收起。
- 气泡物理优化：固定 60Hz 步长并限制追帧时间（高刷屏/后台切换后表现一致），提高碰撞解算迭代，新气泡按黄金角环绕中心绽放入场，新增 NaN/越界位置兜底；减弱动态偏好下环境漂移自动归零。
- E2E 稳定性：修复 Windows 无头 WebKit 下 `toBeHidden` 轮询被页面节流饿死导致的偶发失败（详见 TROUBLESHOOTING.md），断言改用 `expect.poll` 计数。
- 已通过 `npm run lint`、`npm test`（187 项）、`npm run build` 和 `npm run test:e2e`（18 项）验证。

## 2026-04-25 - 金额输入内置加减计算

- 修改余额和转账金额页面支持通过 `+`、`-`、`AC` 按键录入计算过程。
- 金额输入框保留计算过程，并在下方实时显示最终计算结果。
- 保存业务数据时仍只写入计算后的金额，历史记录结构不变。
- 新增金额表达式解析和单元测试，避免使用通用脚本执行。
- 已通过 `npm run lint`、`npm test` 和 `npm run build` 验证。

## 2026-04-25 - 账户详情页展开动画平滑处理

- 来源账户卡片改为完整共享布局变形，让详情页展开时从卡片过渡得更连续。
- 来源卡片内容在打开详情页时稍微延后淡出，避免过渡中出现空白帧。
- 详情页头部和主体内容更早淡入，减少外壳展开完成后内容突然出现的感觉。
- morph 打开时不再播放背景模糊动画，并降低布局弹簧强度，减少 PWA 和移动端渲染路径下的闪动。
- 已通过 `npm run lint`、`npm test` 和 `npm run build` 验证。
