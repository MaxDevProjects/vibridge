const ANSI_RE = /\u001B\[[0-9;?]*[ -/]*[@-~]/g
const FENCED_CODE_RE = /^```/
const INDENTED_CODE_RE = /^(?: {4}|\t)/
const PATH_RE = /(?:^|[\s([{"'])((?:\/[\w.@~\-]+(?:\/[\w.@~\-]+)+|\.{1,2}\/[\w.@~\-]+(?:\/[\w.@~\-]+)+|[\w.@-]+\/[\w./@~-]+))(?:[:#][A-Za-z0-9._-]+)?/g

export interface TerminalInlineSegment {
  type: 'text' | 'path'
  text: string
}

export interface TerminalFormattedLine {
  raw: string
  preview: string
  isLong: boolean
}

export interface TerminalFormattedBlock {
  type: 'text' | 'code'
  lines: TerminalFormattedLine[]
}

export interface TerminalFormattedMessage {
  blocks: TerminalFormattedBlock[]
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '')
}

function compressBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n')
}

function createLine(raw: string): TerminalFormattedLine {
  const isLong = raw.length > 80
  return {
    raw,
    preview: isLong ? `${raw.slice(0, 80).trimEnd()}…` : raw,
    isLong,
  }
}

function tokenizeText(lines: string[]): TerminalFormattedBlock[] {
  const blocks: TerminalFormattedBlock[] = []
  let current: string[] = []

  const flush = () => {
    if (!current.length) return
    blocks.push({ type: 'text', lines: current.map(createLine) })
    current = []
  }

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx]

    if (FENCED_CODE_RE.test(line)) {
      flush()
      const codeLines: string[] = []
      idx += 1
      while (idx < lines.length && !FENCED_CODE_RE.test(lines[idx])) {
        codeLines.push(lines[idx])
        idx += 1
      }
      blocks.push({ type: 'code', lines: codeLines.map(createLine) })
      continue
    }

    if (INDENTED_CODE_RE.test(line)) {
      flush()
      const codeLines = [line.replace(INDENTED_CODE_RE, '')]
      while (idx + 1 < lines.length && INDENTED_CODE_RE.test(lines[idx + 1])) {
        idx += 1
        codeLines.push(lines[idx].replace(INDENTED_CODE_RE, ''))
      }
      blocks.push({ type: 'code', lines: codeLines.map(createLine) })
      continue
    }

    current.push(line)
  }

  flush()
  return blocks
}

export function splitTerminalInlineSegments(text: string): TerminalInlineSegment[] {
  const segments: TerminalInlineSegment[] = []
  let cursor = 0

  for (const match of text.matchAll(PATH_RE)) {
    const full = match[0] ?? ''
    const path = match[1] ?? ''
    const start = match.index ?? 0
    const pathOffset = full.lastIndexOf(path)
    const pathStart = start + Math.max(pathOffset, 0)
    const pathEnd = pathStart + path.length

    if (pathStart > cursor) segments.push({ type: 'text', text: text.slice(cursor, pathStart) })
    segments.push({ type: 'path', text: path })
    cursor = pathEnd
  }

  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) })
  return segments.length ? segments : [{ type: 'text', text }]
}

export function formatTerminalMessage(text: string): TerminalFormattedMessage {
  const normalized = compressBlankLines(stripAnsi(String(text ?? '').replace(/\r\n?/g, '\n')).trim())
  if (!normalized) return { blocks: [] }
  return { blocks: tokenizeText(normalized.split('\n')) }
}
