/**
 * Pick the freshest REAL terminal evidence, not an arbitrary project summary.
 *
 * Monitored tmux terminals expose their last screen separately from the
 * output-event stream. A project can have a perfectly usable screen without
 * any chat output events. Do not silently hide local interpretation there.
 */
export interface TerminalReadingEvidence {
  key: string
  text: string
  ts: number
}
export interface ReadingSource extends TerminalReadingEvidence {
  kind: 'output' | 'screen'
}

function hasReadableExcerpt(text: string): boolean {
  const clean = text
    .replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g, '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim()
  return clean.length >= 40
}

export function selectReadingSource(
  output: TerminalReadingEvidence | null,
  screen: TerminalReadingEvidence | null,
): ReadingSource | null {
  const candidateOutput = output && hasReadableExcerpt(output.text)
    ? { ...output, kind: 'output' as const } : null
  const candidateScreen = screen && hasReadableExcerpt(screen.text)
    ? { ...screen, kind: 'screen' as const } : null
  if (!candidateScreen) return candidateOutput
  if (!candidateOutput) return candidateScreen
  // A newer tmux screen may contain progress not represented in the text
  // transcript. An older screen must not replace a newer actual CLI output.
  return candidateScreen.ts >= candidateOutput.ts ? candidateScreen : candidateOutput
}
