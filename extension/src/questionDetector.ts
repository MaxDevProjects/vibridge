/**
 * DevBridge VS Code Extension — Question Detector
 * Heuristic analyser that decides whether an AI message requires
 * a human answer, to trigger a push notification.
 */

const PATTERNS: RegExp[] = [
  /\?(\s*)$/m,                          // ends with ?
  /shall\s+i\b/i,
  /should\s+i\b/i,
  /do\s+you\s+want\b/i,
  /would\s+you\s+like\b/i,
  /voulez-vous\b/i,
  /souhaitez-vous\b/i,
  /approve\s+or\s+deny/i,
  /yes\s+or\s+no/i,
  /confirm\b.*\?/i,
  /which\s+(option|approach|one)\b/i,
  /please\s+(choose|select|confirm|decide)\b/i,
];

export class QuestionDetector {
  private threshold: number;

  constructor(threshold = 1) {
    this.threshold = threshold;
  }

  isQuestion(text: string): boolean {
    if (!text?.trim()) return false;
    const matches = PATTERNS.filter((p) => p.test(text));
    return matches.length >= this.threshold;
  }

  score(text: string): number {
    return PATTERNS.filter((p) => p.test(text)).length;
  }
}
