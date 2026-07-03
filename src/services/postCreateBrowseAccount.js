export function toBrowseAccount(account) {
  if (!account?.accountid) return null
  return {
    accountid: account.accountid,
    name: account.name || 'Account',
  }
}

export function buildBrowseAccountFromRegarding({ regardingType, regardingItem, resolvedAccount }) {
  if (resolvedAccount?.accountid) return toBrowseAccount(resolvedAccount)
  if (regardingType === 'account') return toBrowseAccount(regardingItem)
  return null
}
