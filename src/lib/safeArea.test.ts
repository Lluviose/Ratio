import { describe, expect, it } from 'vitest'
import { decideSafeAreaFallback } from './safeArea'

// 兜底只针对「iPhone 独立模式竖屏 + env 顶部为 0（被系统沉浸式渲染但未上报
// 插入值）」这一种组合；env 正常上报或非独立模式绝不覆写。

describe('decideSafeAreaFallback', () => {
  const base = { isIphone: true, standalone: true, portrait: true, envTopPx: 0, envBottomPx: 0 }

  it('env 顶部为 0 的 iPhone 独立模式竖屏：顶部与底部都覆写', () => {
    expect(decideSafeAreaFallback(base)).toEqual({ top: '59px', bottom: '34px' })
  })

  it('env 底部正常上报时只覆写顶部', () => {
    expect(decideSafeAreaFallback({ ...base, envBottomPx: 34 })).toEqual({ top: '59px', bottom: null })
  })

  it('env 顶部正常上报（黑半透明状态栏既定行为）：完全不覆写', () => {
    expect(decideSafeAreaFallback({ ...base, envTopPx: 59, envBottomPx: 34 })).toEqual({ top: null, bottom: null })
    // 刘海屏之外（如 SE 的 20px 状态栏）也算正常上报
    expect(decideSafeAreaFallback({ ...base, envTopPx: 20 })).toEqual({ top: null, bottom: null })
  })

  it('非 iPhone / 非独立模式 / 横屏：不覆写', () => {
    expect(decideSafeAreaFallback({ ...base, isIphone: false })).toEqual({ top: null, bottom: null })
    expect(decideSafeAreaFallback({ ...base, standalone: false })).toEqual({ top: null, bottom: null })
    expect(decideSafeAreaFallback({ ...base, portrait: false })).toEqual({ top: null, bottom: null })
  })
})
