const NUMBERED_LINE_RE = /^\s*(?:>\s*)?(?:(\d+)[\.\)]|\[(\d+)\])\s+(.+?)\s*$/
const YES_NO_RE = /\b(?:y\/n|yes\/no)\b/i

export interface QuickReplyChoice {
  key: string
  label: string
  value: string
  style: 'numbered' | 'binary'
}

export interface QuickReplyResult {
  hasChoices: boolean
  choices: QuickReplyChoice[]
}

function normalizeChoiceLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function useQuickReplies(message: string): QuickReplyResult {
  const text = String(message ?? '').replace(/\r\n?/g, '\n').trim()
  if (!text) return { hasChoices: false, choices: [] }

  const lines = text.split('\n')
  const numberedChoices: QuickReplyChoice[] = []
  const seenKeys = new Set<string>()

  for (const line of lines) {
    const match = line.match(NUMBERED_LINE_RE)
    if (!match) continue
    const key = match[1] ?? match[2] ?? ''
    const label = normalizeChoiceLabel(match[3] ?? '')
    if (!key || !label || seenKeys.has(key)) continue
    seenKeys.add(key)
    numberedChoices.push({
      key,
      label,
      value: key,
      style: 'numbered',
    })
  }

  if (numberedChoices.length >= 2) {
    return { hasChoices: true, choices: numberedChoices }
  }

  if (YES_NO_RE.test(text)) {
    return {
      hasChoices: true,
      choices: [
        { key: 'yes', label: 'Oui', value: 'y', style: 'binary' },
        { key: 'no', label: 'Non', value: 'n', style: 'binary' },
      ],
    }
  }

  return { hasChoices: false, choices: [] }
}
