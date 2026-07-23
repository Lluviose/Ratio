import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './longpress-guard.css'
import App from './App.tsx'
import { RootErrorBoundary } from './components/RootErrorBoundary.tsx'
import { storageKernel } from './lib/storageKernel'
import { runDataSchemaMigrations } from './lib/schemaVersion'
import { acquireInstanceLock } from './lib/instanceGuard'
import { InstanceFrozenNotice, InstanceOccupiedGate } from './components/InstanceGateScreens.tsx'
import { emitAppToast } from './lib/overlay'
import './pwa'

const isCoarsePointer =
  window.matchMedia?.('(pointer: coarse)').matches ?? navigator.maxTouchPoints > 0;

const isTextEditingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;

  const closest = target.closest('input, textarea, [contenteditable]');
  if (!closest) return false;

  if (closest instanceof HTMLInputElement) {
    const type = (closest.type || 'text').toLowerCase();
    const nonTextTypes = new Set([
      'button',
      'checkbox',
      'color',
      'file',
      'hidden',
      'image',
      'radio',
      'range',
      'reset',
      'submit',
    ]);
    return !closest.disabled && !nonTextTypes.has(type);
  }

  if (closest instanceof HTMLTextAreaElement) return !closest.disabled;

  return (closest as HTMLElement).isContentEditable;
};

// Prevent gesture zooming (pinch-to-zoom)
document.addEventListener('gesturestart', function(e) {
  if (!isTextEditingTarget(e.target) && e.cancelable) e.preventDefault();
});

// Prevent double-tap zooming
let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
  if (!isCoarsePointer || isTextEditingTarget(event.target)) {
    lastTouchEnd = 0;
    return;
  }

  const now = (new Date()).getTime();
  if (now - lastTouchEnd <= 300 && event.cancelable) {
    event.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });

if (isCoarsePointer) {
  // Disallow long-press context menus (copy/paste) outside of text inputs.
  document.addEventListener(
    'contextmenu',
    (event: MouseEvent) => {
      if (!isTextEditingTarget(event.target)) event.preventDefault();
    },
    { capture: true },
  );

  // Disallow long-press text selection outside of editable fields.
  document.addEventListener(
    'selectstart',
    (event: Event) => {
      if (!isTextEditingTarget(event.target)) event.preventDefault();
    },
    { capture: true },
  );
}

// 存储内核水合完成（IndexedDB → 内存，含首次迁移）后才挂载 React：
// 组件树里的所有同步读（useLocalStorageState 等）由此保证读到权威数据。
// ready 永不 reject（IDB 不可用时内部回退 localStorage 后照常 resolve）。
void storageKernel.ready.then(async () => {
  const root = createRoot(document.getElementById('root')!)

  const mountApp = () => {
    // 数据 schema 迁移在挂载前执行：组件树读到的一定是当前版本形状的数据。
    // 失败/版本超前都不阻断启动（本地优先：coerce 兜底），只提示用户。
    const migration = runDataSchemaMigrations()
    if (migration.status === 'failed') {
      emitAppToast('数据结构升级未完成，应用将以兼容模式运行；建议先导出一份备份', { tone: 'danger' })
    } else if (migration.status === 'newer_data') {
      emitAppToast('本机数据由更新版本的 Ratio 写入，建议先更新应用再修改数据', { tone: 'danger' })
    }

    root.render(
      <StrictMode>
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      </StrictMode>,
    )
  }

  // 锁被其他标签 steal 接管：抢跑落盘（未提交批次持久化），然后冻结本页——
  // 冻结覆盖层挂独立 root，压在已挂载的应用之上阻断一切交互。
  const handleStolen = () => {
    void storageKernel.flush()
    const host = document.createElement('div')
    document.body.appendChild(host)
    createRoot(host).render(<InstanceFrozenNotice />)
  }

  // 单实例守卫（P0-5）：同一时间只允许一个标签页读写，消灭跨标签并发
  // 丢更新。锁不可用（老浏览器）按获得处理，行为与守卫之前一致。
  const guard = await acquireInstanceLock({ onStolen: handleStolen })
  if (guard === 'occupied') {
    root.render(
      <InstanceOccupiedGate
        onTakeOver={async () => {
          const stolen = await acquireInstanceLock({ steal: true, onStolen: handleStolen })
          // steal 恒获得锁；unsupported 理论不可达（首次已探测到 locks 存在）
          if (stolen !== 'occupied') mountApp()
        }}
      />,
    )
    return
  }
  mountApp()
})
