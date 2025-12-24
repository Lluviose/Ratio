import clsx from 'clsx'
import { X, ArrowRight, Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Slide = {
  id: string
  bg: string
  titleLines: [string, string, string]
  subtitle?: string
  accent: string
}

function PhoneScreenContent(props: { kind: 'ratio' | 'trend' | 'stats' | 'theme'; accent: string }) {
  const { kind, accent } = props

  if (kind === 'ratio') {
    return (
      <div className="flex flex-col h-full bg-[#f5f6f8] pt-12 px-5">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="text-xs font-black opacity-60 uppercase tracking-wide">我的净资产</div>
          <div className="text-3xl font-black mt-2 tracking-tight">1,472,200</div>
        </motion.div>

        <div className="grid gap-3 mt-8">
          {[
            { label: '流动资金', value: '574,000', color: '#47d16a' },
            { label: '投资', value: '338,200', color: accent },
            { label: '固定资产', value: '1,520,000', color: '#6b86ff' },
            { label: '应收款', value: '120,000', color: '#a4b5ff' },
            { label: '负债', value: '1,080,000', color: '#cbd5e1' },
          ].map((r, i) => (
            <motion.div
              key={r.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.08, type: 'spring', stiffness: 200, damping: 20 }}
              className="bg-white/80 backdrop-blur-sm border border-black/5 rounded-2xl p-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                <span className="font-bold text-xs text-gray-800">{r.label}</span>
              </div>
              <span className="font-black text-xs tabular-nums">{r.value}</span>
            </motion.div>
          ))}
        </div>
      </div>
    )
  }

  if (kind === 'trend') {
    return (
      <div className="flex flex-col h-full bg-[#f5f6f8] pt-12 px-4">
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-black/5">
          <div className="flex justify-center mb-6">
            <div className="bg-gray-100 p-1 rounded-full flex gap-1">
              <div className="bg-white shadow-sm rounded-full px-3 py-1.5 text-[10px] font-black">净资产</div>
              <div className="px-3 py-1.5 text-[10px] font-black text-gray-400">资产</div>
            </div>
          </div>

          <div className="h-40 relative w-full">
            <div className="absolute inset-0 grid grid-cols-6 grid-rows-4">
              {[...Array(24)].map((_, i) => (
                <div key={i} className="border-[0.5px] border-dashed border-gray-100" />
              ))}
            </div>
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 160" preserveAspectRatio="none">
              <motion.path
                d="M10 140 C 40 130, 80 140, 120 100 C 160 60, 200 80, 240 40 L 280 20"
                fill="none"
                stroke={accent}
                strokeWidth="3"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, ease: "easeInOut", delay: 0.2 }}
              />
              <motion.path
                d="M10 150 C 40 145, 80 148, 120 120 C 160 90, 200 100, 240 70 L 280 60"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="2"
                strokeDasharray="4 4"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, ease: "easeInOut", delay: 0.4 }}
              />
              {/* Focus Line */}
              <motion.line
                 x1="200" y1="10" x2="200" y2="150"
                 stroke="#ef4444"
                 strokeWidth="1.5"
                 strokeDasharray="2 2"
                 initial={{ opacity: 0, y1: 150 }}
                 animate={{ opacity: 0.5, y1: 10 }}
                 transition={{ delay: 1.2, duration: 0.5 }}
              />
              <motion.circle
                cx="200" cy="64.5" r="4" fill="white" stroke="#ef4444" strokeWidth="2"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.6, type: 'spring' }}
              />
            </svg>
          </div>
          
          <div className="flex justify-between mt-4 px-2">
             {['1月', '2月', '3月', '4月', '5月', '6月'].map(m => (
               <div key={m} className="text-[9px] font-bold text-gray-400">{m}</div>
             ))}
          </div>
        </div>
        
        <div className="mt-6 flex justify-center">
            <div className="bg-white/50 px-4 py-2 rounded-2xl text-xs font-bold text-gray-500">
               长按查看历史详情
            </div>
        </div>
      </div>
    )
  }

  if (kind === 'stats') {
    return (
      <div className="flex flex-col h-full bg-[#f5f6f8] pt-12 px-4">
         <div className="bg-white rounded-3xl p-5 shadow-sm border border-black/5">
            <div className="text-center font-black text-sm mb-6">年度资产变化分析</div>
            
            <div className="h-40 flex items-end justify-between px-2 gap-2">
               {[0.4, 0.7, 0.3, 0.85, 0.5, 0.9, 0.6].map((h, i) => (
                 <div key={i} className="flex flex-col items-center gap-2 w-full">
                    <motion.div 
                      className="w-full rounded-t-md relative group"
                      style={{ height: 140 * h, background: i === 3 ? accent : '#e2e8f0' }}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ delay: 0.2 + i * 0.1, type: 'spring', damping: 15 }}
                    >
                       {i === 3 && (
                         <motion.div 
                           initial={{ opacity: 0, y: 10 }}
                           animate={{ opacity: 1, y: -25 }}
                           transition={{ delay: 1.2 }}
                           className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap"
                         >
                           +12.5%
                         </motion.div>
                       )}
                    </motion.div>
                 </div>
               ))}
            </div>
            
            <div className="flex justify-between mt-3 border-t pt-3 border-dashed border-gray-100">
               <div className="text-[10px] font-bold text-gray-400">总资产</div>
               <div className="text-[10px] font-bold text-gray-900">净资产</div>
               <div className="text-[10px] font-bold text-gray-400">负债</div>
            </div>
         </div>
      </div>
    )
  }

  if (kind === 'theme') {
    return (
      <div className="flex flex-col h-full bg-[#f5f6f8] pt-12 px-5">
        <div className="grid gap-3">
          {['Matisse', 'Matisse 2', 'Macke', 'Mondrian', 'Kandinsky', 'Miro'].map((t, idx) => {
            const isActive = idx === 1
            return (
              <motion.div
                key={t}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + idx * 0.05 }}
                className={clsx(
                  "rounded-2xl border p-2.5 flex items-center justify-between",
                  isActive ? "bg-white border-indigo-100 shadow-sm" : "bg-white/60 border-transparent"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {[0, 1, 2].map((n) => (
                      <div
                        key={n}
                        className="w-5 h-5 rounded-full border-2 border-white"
                        style={{
                           background: isActive 
                            ? ['#a4b5ff', accent, '#47d16a'][n] 
                            : ['#e2e8f0', '#cbd5e1', '#94a3b8'][n]
                        }}
                      />
                    ))}
                  </div>
                  <div className={clsx("text-xs font-bold", isActive ? "text-gray-900" : "text-gray-500")}>{t}</div>
                </div>
                {isActive && (
                  <motion.div 
                    initial={{ scale: 0 }} 
                    animate={{ scale: 1 }}
                    className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center text-white"
                  >
                    <Check size={12} strokeWidth={4} />
                  </motion.div>
                )}
              </motion.div>
            )
          })}
        </div>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-6 bg-indigo-50/50 p-4 rounded-2xl flex gap-3 items-center"
        >
           <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center text-white font-black text-lg">
             Aa
           </div>
           <div>
             <div className="text-xs font-bold text-indigo-900">支持动态字体</div>
             <div className="text-[10px] font-bold text-indigo-400 mt-0.5">跟随系统设置</div>
           </div>
        </motion.div>
      </div>
    )
  }

  return null
}

function PhoneFrame(props: { kind: 'ratio' | 'trend' | 'stats' | 'theme'; accent: string }) {
  return (
    <div className="relative mx-auto w-[min(300px,90%)] z-10">
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 25, stiffness: 100 }}
        className="relative rounded-[40px] border-[8px] border-gray-900 bg-gray-900 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden"
        style={{ aspectRatio: '9/19.5' }}
      >
        {/* Dynamic Island */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 h-[22px] w-[80px] bg-black rounded-full z-20 pointer-events-none" />
        
        {/* Status Bar Area */}
        <div className="h-10 bg-[#f5f6f8] w-full absolute top-0 z-10 opacity-90" />

        {/* Screen Content */}
        <div className="h-full bg-[#f5f6f8] overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={props.kind}
              initial={{ opacity: 0, scale: 0.95, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.05, filter: 'blur(4px)' }}
              transition={{ duration: 0.4, ease: "circOut" }}
              className="h-full"
            >
              <PhoneScreenContent kind={props.kind} accent={props.accent} />
            </motion.div>
          </AnimatePresence>
        </div>
        
        {/* Home Indicator */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1/3 h-1 bg-black/20 rounded-full z-20" />
      </motion.div>
    </div>
  )
}

export function TourScreen(props: { onClose: () => void }) {
  const { onClose } = props
  const [index, setIndex] = useState(0)

  const slides: Slide[] = useMemo(
    () => [
      {
        id: 'ratio',
        bg: '#f5f6f8',
        titleLines: ['关注重要资产', '关注分配比', '专属私人财务报表'],
        accent: 'var(--primary)',
      },
      {
        id: 'trend',
        bg: '#a4b5ff', // Muted blue
        titleLines: ['观察趋势', '关注积累', '见证资产增长'],
        accent: 'var(--primary)',
      },
      {
        id: 'assets',
        bg: '#e2e8f0', // Slate 200
        titleLines: ['会计经验', '财报理念', '专业分类不疏漏'],
        accent: 'var(--primary)',
      },
      {
        id: 'stats',
        bg: '#c7d2fe', // Indigo 200
        titleLines: ['投资损益', '科学打理', '随时调整投资策略'],
        accent: '#6366f1',
      },
      {
        id: 'theme',
        bg: '#e0e7ff', // Indigo 100
        titleLines: ['个性主题', '数据隐私安全', '私人账户跨平台同步'],
        accent: 'var(--primary)',
      },
    ],
    [],
  )

  const slide = slides[index]

  const phoneKind = ((): 'ratio' | 'trend' | 'stats' | 'theme' => {
    if (slide.id === 'trend') return 'trend'
    if (slide.id === 'stats') return 'stats'
    if (slide.id === 'theme') return 'theme'
    return 'ratio'
  })()

  // Background color animation
  const bgColors = ['#f8fafc', '#eff6ff', '#f1f5f9', '#eef2ff', '#f5f3ff']

  return (
    <motion.div 
      className="h-full relative overflow-hidden flex flex-col touch-none"
      animate={{ backgroundColor: bgColors[index % bgColors.length] }}
      transition={{ duration: 0.7 }}
      onPanEnd={(_, { offset }) => {
        if (offset.x < -50 && index < slides.length - 1) {
          setIndex(index + 1)
        } else if (offset.x > 50 && index > 0) {
          setIndex(index - 1)
        }
      }}
    >
      {/* Background Gradient Blob */}
      <motion.div
        className="absolute top-[-20%] right-[-20%] w-[140%] h-[80%] rounded-full blur-[80px] pointer-events-none opacity-40"
        animate={{ 
          backgroundColor: slide.id === 'ratio' ? '#4f46e5' : 
                          slide.id === 'trend' ? '#3b82f6' : 
                          slide.id === 'stats' ? '#8b5cf6' : '#ec4899',
          x: index % 2 === 0 ? 0 : -50,
        }}
        transition={{ duration: 1 }}
      />

      {/* Close Button */}
      <div className="relative z-50 px-4 pt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-black/5 hover:bg-black/10 backdrop-blur-md flex items-center justify-center transition-colors"
        >
          <X size={20} className="opacity-60" />
        </button>
      </div>

      {/* Text Content */}
      <div className="relative z-30 px-6 mt-2 mb-8 min-h-[140px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-1"
          >
             {slide.titleLines.map((line, i) => (
               <motion.div 
                 key={i}
                 className="text-3xl font-[850] tracking-tight leading-[1.1] text-slate-900"
                 initial={{ opacity: 0, x: -10 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ delay: 0.1 + i * 0.1 }}
               >
                 {line}
               </motion.div>
             ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Phone Area */}
      <div className="flex-1 flex items-start justify-center overflow-visible z-20 pb-20">
         <PhoneFrame kind={phoneKind} accent={slide.accent === 'white' ? '#6366f1' : 'var(--primary)'} />
      </div>

      {/* Bottom Nav */}
      <div className="absolute bottom-0 left-0 right-0 p-6 pt-12 bg-gradient-to-t from-white via-white/90 to-transparent z-40">
        <div className="flex items-center justify-between">
           {/* Dots */}
           <div className="flex gap-2">
             {slides.map((s, i) => (
               <div 
                 key={s.id}
                 className={clsx(
                   "h-2 rounded-full transition-all duration-300",
                   i === index ? "w-6 bg-slate-900" : "w-2 bg-slate-200"
                 )}
               />
             ))}
           </div>
           
           {/* Next Button */}
           <motion.button
             whileHover={{ scale: 1.05 }}
             whileTap={{ scale: 0.95 }}
             onClick={() => {
               if (index === slides.length - 1) onClose()
               else setIndex(v => Math.min(slides.length - 1, v + 1))
             }}
             className="h-14 px-8 rounded-full bg-slate-900 text-white font-bold text-lg shadow-xl shadow-slate-900/20 flex items-center gap-2"
           >
             {index === slides.length - 1 ? '开始使用' : '继续'}
             <ArrowRight size={20} strokeWidth={2.5} />
           </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
