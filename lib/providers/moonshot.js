import { num, pick } from '../util.js'

/** `{data:{available_balance, voucher_balance}}` on the Moonshot open platform. */
function parseMoonshot(body) {
  const amount = num(pick(body, 'data.available_balance'))
  if (amount === null) return null
  return { amount, currency: 'CNY', bonus: num(pick(body, 'data.voucher_balance')) }
}

/**
 * Kimi / Moonshot wallets. One adapter, two regions: the CN platform and the
 * international one answer the same shape on different hosts.
 */
export default {
  id: 'kimi-coding',
  aliases: ['moonshotai-cn', 'moonshotai'],
  label: 'Kimi',
  kind: 'money',
  order: 40,
  secret: { ref: 'KIMI_API_KEY', type: 'key' },
  url: 'https://api.moonshot.cn/v1/users/me/balance',
  consoleUrl: 'https://platform.moonshot.cn/console',
  /** The international host needs its own url. */
  urlFor(providerId) {
    return providerId === 'moonshotai'
      ? 'https://api.moonshot.ai/v1/users/me/balance'
      : 'https://api.moonshot.cn/v1/users/me/balance'
  },
  consoleUrlFor(providerId) {
    return providerId === 'moonshotai'
      ? 'https://platform.moonshot.ai/console'
      : 'https://platform.moonshot.cn/console'
  },
  /** Regional hosts resolve different credential refs by default. */
  secretFor(providerId) {
    return providerId === 'kimi-coding'
      ? { ref: 'KIMI_API_KEY', type: 'key' }
      : { ref: 'MOONSHOT_API_KEY', type: 'key' }
  },
  labelFor(providerId) {
    if (providerId === 'moonshotai') return 'Moonshot'
    if (providerId === 'moonshotai-cn') return 'Kimi 开放平台'
    return 'Kimi'
  },
  orderFor(providerId) {
    return providerId === 'kimi-coding' ? 40 : providerId === 'moonshotai-cn' ? 41 : 42
  },
  parseKey(body) {
    return parseMoonshot(body)
  },
}