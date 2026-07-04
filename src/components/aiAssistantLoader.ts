// AI 助手分包的唯一动态导入点：LazyAiAssistant 按需挂载用它，
// App 的后台预热链也用它在空闲且用户静默时提前解析大分包。
export const loadAiAssistant = () => import('./AiAssistant')
