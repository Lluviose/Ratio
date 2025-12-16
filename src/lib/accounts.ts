import {
  Bitcoin,
  Building2,
  Car,
  ChartCandlestick,
  CircleDollarSign,
  Coins,
  CreditCard,
  Gem,
  HandCoins,
  Landmark,
  PiggyBank,
  ReceiptText,
  Smartphone,
  Users,
  Wallet,
} from 'lucide-react'

export type AccountGroupId = 'liquid' | 'invest' | 'fixed' | 'receivable' | 'debt'

export type AccountTypeId =
  | 'cash'
  | 'bank_card'
  | 'online'
  | 'savings'
  | 'other_liquid'
  | 'fund'
  | 'stock'
  | 'crypto'
  | 'metal'
  | 'other_invest'
  | 'property'
  | 'car'
  | 'other_fixed'
  | 'receivable'
  | 'credit_card'
  | 'loan'
  | 'payable'
  | 'other_debt'

export type Account = {
  id: string
  type: AccountTypeId
  name: string
  balance: number
  updatedAt: string
}

export type AccountGroup = {
  id: AccountGroupId
  name: string
  tone: string
}

export const accountGroups: Record<AccountGroupId, AccountGroup> = {
  liquid: { id: 'liquid', name: '流动资金', tone: '#f5d18a' },
  invest: { id: 'invest', name: '投资', tone: '#ff6b57' },
  fixed: { id: 'fixed', name: '固定资产', tone: '#3949c7' },
  receivable: { id: 'receivable', name: '应收款', tone: '#9ba9ff' },
  debt: { id: 'debt', name: '负债', tone: '#d9d4f6' },
}

export type AccountTypeOption = {
  id: AccountTypeId
  name: string
  groupId: AccountGroupId
  icon: typeof Wallet
}

export const accountTypeOptions: AccountTypeOption[] = [
  { id: 'cash', name: '现金', groupId: 'liquid', icon: Wallet },
  { id: 'bank_card', name: '银行卡', groupId: 'liquid', icon: CreditCard },
  { id: 'online', name: '网络账户', groupId: 'liquid', icon: Smartphone },
  { id: 'savings', name: '储蓄卡', groupId: 'liquid', icon: PiggyBank },
  { id: 'other_liquid', name: '其他', groupId: 'liquid', icon: CircleDollarSign },

  { id: 'fund', name: '投资基金', groupId: 'invest', icon: Coins },
  { id: 'stock', name: '股票', groupId: 'invest', icon: ChartCandlestick },
  { id: 'crypto', name: '加密货币', groupId: 'invest', icon: Bitcoin },
  { id: 'metal', name: '贵金属', groupId: 'invest', icon: Gem },
  { id: 'other_invest', name: '其他投资', groupId: 'invest', icon: Landmark },

  { id: 'property', name: '房产', groupId: 'fixed', icon: Building2 },
  { id: 'car', name: '汽车', groupId: 'fixed', icon: Car },
  { id: 'other_fixed', name: '其他固定资产', groupId: 'fixed', icon: ReceiptText },

  { id: 'receivable', name: '应收款', groupId: 'receivable', icon: Users },

  { id: 'credit_card', name: '信用卡', groupId: 'debt', icon: CreditCard },
  { id: 'loan', name: '贷款', groupId: 'debt', icon: HandCoins },
  { id: 'payable', name: '应付款', groupId: 'debt', icon: ReceiptText },
  { id: 'other_debt', name: '其他负债', groupId: 'debt', icon: CircleDollarSign },
]

export function getAccountTypeOption(type: AccountTypeId) {
  const opt = accountTypeOptions.find((o) => o.id === type)
  if (!opt) throw new Error(`Unknown account type: ${type}`)
  return opt
}

export function getGroupIdByAccountType(type: AccountTypeId): AccountGroupId {
  return getAccountTypeOption(type).groupId
}

export function defaultAccountName(type: AccountTypeId) {
  return getAccountTypeOption(type).name
}
