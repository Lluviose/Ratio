import type { AccountGroupId } from './accounts'

export type ThemeId = 'matisse' | 'matisse2' | 'macke' | 'mondrian' | 'kandinsky' | 'miro'

export type ThemeColors = Record<AccountGroupId, string>

export type ThemeOption = {
  id: ThemeId
  name: string
  colors: ThemeColors
}

export const themeOptions: ThemeOption[] = [
  {
    id: 'matisse',
    name: 'Matisse',
    colors: {
      liquid: '#fcd34d',
      invest: '#ff8b73',
      fixed: '#26c6da',
      receivable: '#c7b5ff',
      debt: '#e5e7eb',
    },
  },
  {
    id: 'matisse2',
    name: 'Matisse 2',
    colors: {
      liquid: '#4ade80',
      invest: '#6366f1',
      fixed: '#a5b4fc',
      receivable: '#67e8f9',
      debt: '#f1f5f9',
    },
  },
  {
    id: 'macke',
    name: 'Macke',
    colors: {
      liquid: '#f5d18a',
      invest: '#ff6b57',
      fixed: '#3949c7',
      receivable: '#9ba9ff',
      debt: '#d9d4f6',
    },
  },
  {
    id: 'mondrian',
    name: 'Mondrian',
    colors: {
      liquid: '#ffb703',
      invest: '#ef4444',
      fixed: '#2563eb',
      receivable: '#94a3b8',
      debt: '#f8fafc',
    },
  },
  {
    id: 'kandinsky',
    name: 'Kandinsky',
    colors: {
      liquid: '#fbbf24',
      invest: '#ef4444',
      fixed: '#8b5cf6',
      receivable: '#3b82f6',
      debt: '#f3f4f6',
    },
  },
  {
    id: 'miro',
    name: 'Miro',
    colors: {
      liquid: '#fbbf24',
      invest: '#f43f5e',
      fixed: '#0ea5e9',
      receivable: '#14b8a6',
      debt: '#f1f5f9',
    },
  },
]
