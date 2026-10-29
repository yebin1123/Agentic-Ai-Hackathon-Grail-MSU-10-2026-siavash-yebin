export const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export function formatCurrency(value: number | null | undefined, precisionReference?: number): string {
  if (!isFiniteNumber(value)) return 'Unavailable'
  const magnitude = Math.abs(value)
  const reference = isFiniteNumber(precisionReference) && precisionReference > 0 ? precisionReference : magnitude
  const digits = reference > 0 && reference < 1 ? Math.min(20, Math.max(2, 2 - Math.floor(Math.log10(reference)))) : 2
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
    ...(magnitude > 0 && magnitude < 1e-18 ? { notation: 'scientific' as const, maximumFractionDigits: 4 } : {}),
  }).format(value)
}

export function formatAmount(value: number | null | undefined, currency = false): string {
  if (!isFiniteNumber(value)) return 'Unavailable'
  if (currency && Math.abs(value) < 1000) return formatCurrency(value)
  return new Intl.NumberFormat('en-US', {
    ...(currency ? { style: 'currency', currency: 'USD' } : {}),
    notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard', maximumFractionDigits: 2,
  }).format(value)
}

export function formatPercent(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${value > 0 ? '+' : ''}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%` : 'Unavailable'
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Unavailable'
  return `${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))} UTC`
}

export function safeUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined
  } catch { return undefined }
}
