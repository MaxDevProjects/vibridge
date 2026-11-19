/**
 * Read-only, best-effort extraction of passages ALREADY observed in the phone's
 * terminal output. No model, no remote inference, no completion claims.
 *
 * These notes are never uploaded or persisted by this module. A note is a
 * quote/excerpt from the received text, not an assertion that work succeeded.
 */
export interface ObservedNote {
  text: string
  source: 'bullet' | 'excerpt'
}

const ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\)|[78DEHM])/g
const BULLET = /^\s*(?:[-*•◦] |\d{1,2}[.)] |\[[xX ]\] )/
const SECTION = /^\s*(?:#{1,3}\s*)?(?:final(?: answer| response)?|résumé|resume|conclusion|bilan|synthèse|résultat final|summary)(?:\s*[:.]\s*)?$/i
const NOISE = /^(?:(?:tip|new|worked for|tokens used|token usage|total tokens|press enter|ctrl\+|use \/|experimental|prevent sleep|elapsed|thinking|working|processing|running|loading|compiling|analyzing)\b|\s*[⠁-⣿⣀-⣿◌◐◓◑◒])|^(?:[-=┄─━│┌└┐┘]{3,})$/i
const LOG = /^(?:\[(?:info|debug|warn|error)\]|\d{2}:\d{2}:\d{2}|>\s+(?:npm|pnpm|yarn|bash)|(?:\$|#)\s)/i
const SENSITIVE = /(?:-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|(?:bearer|authorization|password|secret|api[_-]?key|access[_-]?token)\\s*[:=]\\s*\\S+|\\bsk-[a-z0-9_-]{12,}\\b)/i

function cleanLines(raw: string): string[] {
  const tail = raw.slice(-12000)
    .replace(ANSI, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
  let fenced = false
  const lines: string[] = []
  for (const original of tail.split('\n')) {
    const line = original.trim().replace(/\s+/g, ' ')
    if (/^```/.test(line)) { fenced = !fenced; continue }
    if (fenced || !line || NOISE.test(line) || LOG.test(line) || SENSITIVE.test(line)) continue
    lines.push(line)
  }
  return lines
}

function boundedExcerpt(text: string, limit = 230): string {
  const normalized = text.trim().replace(/\s+/g, ' ')
  if (normalized.length <= limit) return normalized
  const boundary = normalized.lastIndexOf(' ', limit)
  return normalized.slice(0, boundary >= 65 ? boundary : limit).trimEnd() + '…'
}

export function extractObservedTerminalNotes(raw: string, maxNotes = 5): ObservedNote[] {
  if (!raw || raw.length < 50 || maxNotes <= 0) return []
  const lines = cleanLines(raw)
  if (!lines.length) return []
  // A clear final-answer heading is useful, but we never infer finality from
  // a shell execution that may still be running.
  const lastFinal = lines.findLastIndex(line => SECTION.test(line))
  const source = lastFinal >= 0 ? lines.slice(lastFinal + 1) : lines.slice(-35)
  const notes: ObservedNote[] = []
  const explicit: string[] = []
  for (let i = 0; i < source.length; i++) {
    const line = source[i]!
    if (SECTION.test(line)) continue
    if (!BULLET.test(line)) continue
    const initial = line.replace(BULLET, '').trim()
    if (!initial || initial.length < 15 || SENSITIVE.test(initial)) continue
    // Terminal text often wraps long bullets. Keep adjacent continuation lines
    // without treating them as a second verified action.
    const continuation: string[] = []
    for (let j = i + 1; j < Math.min(i + 4, source.length); j++) {
      const next = source[j]!
      if (BULLET.test(next) || SECTION.test(next) || NOISE.test(next)) break
      if (continuation.join(' ').length > 240) break
      continuation.push(next)
    }
    explicit.push(boundedExcerpt([initial, ...continuation].join(' ')))
  }
  const distinct = new Set<string>()
  const chosen = explicit.length ? explicit.slice(-maxNotes) : []
  for (const note of chosen) {
    const key = note.toLocaleLowerCase()
    if (!distinct.has(key)) { notes.push({ text:note, source:'bullet' }); distinct.add(key) }
  }
  if (notes.length) return notes

  // A CLI's final answer is often a paragraph, not a Markdown list.
  // Keep its literal sentences. Do not invent "done" or "successful" labels.
  const prose = source.filter(line => !SECTION.test(line) && !BULLET.test(line))
    .join(' ').replace(/\s+/g, ' ').trim()
  if (prose.length < 65) return []
  const sentences = prose.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-ÝÉÈÊÎÔÛÇ\d])/u)
    .map(s => s.trim()).filter(s => s.length >= 28)
  const selected = (sentences.length >= 2 ? sentences : [prose]).slice(-maxNotes)
  for (const sentence of selected) {
    if (SENSITIVE.test(sentence)) continue
    const text = boundedExcerpt(sentence)
    const key = text.toLocaleLowerCase()
    if (!distinct.has(key)) { notes.push({text,source:'excerpt'});distinct.add(key) }
  }
  return notes
}
