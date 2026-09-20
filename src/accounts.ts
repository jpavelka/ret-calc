import type { AccountType } from './types'

export const ACCOUNT_TYPES: AccountType[] = ['preTax', 'roth', 'taxable', 'hsa', 'cash', 'hysa', 'college529']

export const ACCOUNT_LABELS: Record<AccountType, string> = {
  preTax: 'Pre-tax',
  roth: 'Roth',
  taxable: 'Taxable',
  hsa: 'HSA',
  cash: 'Cash',
  hysa: 'High-yield savings',
  college529: '529 college savings',
}

// In spouse mode, only pre-tax and Roth accounts are attributed to one
// spouse or the other — taxable brokerage, HSA, cash, high-yield savings,
// and 529 are treated as combined household accounts regardless of who
// holds them.
const OWNED_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set(['preTax', 'roth'])

export function accountHasOwner(account: AccountType): boolean {
  return OWNED_ACCOUNT_TYPES.has(account)
}
