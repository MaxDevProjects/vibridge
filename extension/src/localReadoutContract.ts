/**
 * Narrow grammar: enforces JSON syntax, never factual accuracy.
 * Every generated evidence fragment is independently checked against SOURCE.
 */
export const LOCAL_READOUT_GRAMMAR = "root ::= \"{\" ws \"\\\"title\\\"\" ws \":\" ws string \",\" ws \"\\\"items\\\"\" ws \":\" ws \"[\" ws (item (\",\" ws item){0,2})? \"]\" ws \"}\" ws\nitem ::= \"{\" ws \"\\\"text\\\"\" ws \":\" ws string \",\" ws \"\\\"evidence\\\"\" ws \":\" ws string \",\" ws \"\\\"category\\\"\" ws \":\" ws (\"\\\"announced\\\"\" | \"\\\"remaining\\\"\" | \"\\\"uncertain\\\"\") ws \"}\" ws\nstring ::= \"\\\"\" ( [^\"\\\\\\x7F\\x00-\\x1F] | \"\\\\\" ([\"\\\\bfnrt] | \"u\" [0-9a-fA-F]{4}) )* \"\\\"\" ws\nws ::= | \" \" | \"\\n\" [ \\t]{0,12}";

/**
 * Safe CPU-free fallback: literal quotes from the redacted terminal output.
 * An observed excerpt is NOT proof a command executed or succeeded.
 */
export interface ObservedExcerpt {
  text: string;
  evidence: string;
  category: 'uncertain';
}
const SENSITIVE = /PRIVATE_KEY_REDACTED|SECRET_REDACTED|(?:^|\s)(?:password|token|api[_-]?key|bearer)\s*[:=]/i;
const SCREEN_NOISE = /^(?:worked for|thinking|working|tokens used|press enter|esc to|ctrl\+|use \/)\b|^[│┌┐└┘─━⠁-⣿]+$/i;
const BULLET = /^(?:[-*•◦]\s+|\d{1,2}[.)]\s+)/;
export function observedExcerpts(source: string, limit=3): ObservedExcerpt[] {
  if (!source || limit <= 0) return [];
  const lines=source.split(/\r?\n/).map(line=>line.trim().replace(/\s+/g,' '))
    .filter(line=>line.length>=18 && line.length<=280
      && !SENSITIVE.test(line) && !SCREEN_NOISE.test(line)
      && !/^[\\<>{}_\[\]|=#+-]{3,}$/.test(line));
  const candidates=lines.filter(line=>BULLET.test(line));
  const chosen=candidates.length ? candidates : lines;
  const seen=new Set<string>();
  const results:ObservedExcerpt[]=[];
  for(const original of chosen.slice(-15).reverse()){
    const quote=original.replace(BULLET,'').slice(0,150).trim();
    if(quote.length<18 || seen.has(quote.toLowerCase()))continue;
    seen.add(quote.toLowerCase());
    results.push({text:quote,evidence:quote,category:'uncertain'});
    if(results.length>=limit)break;
  }
  return results.reverse();
}
