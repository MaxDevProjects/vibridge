/**
 * Small, contextual, LOCAL command catalogue. Catalog entries are not remote
 * capabilities or implicit permission grants. The host agent remains the
 * authority for whether typing into this terminal is permitted.
 */
export type CliContext = 'shell' | 'codex' | 'claude' | 'unknown'
export type PaletteAction = {
  id:string; label:string; command:string; context:CliContext;
  kind:'read' | 'slash' | 'navigation'; description:string;
  source:'builtin' | 'observed';
}
const builtin:PaletteAction[]=[
  {id:'shell-pwd',label:'Dossier actuel',command:'pwd',context:'shell',kind:'read',description:'Affiche le dossier actif',source:'builtin'},
  {id:'shell-ls',label:'Fichiers du dossier',command:'ls -la',context:'shell',kind:'read',description:'Liste les fichiers, même cachés',source:'builtin'},
  {id:'shell-git',label:'Statut Git',command:'git status --short',context:'shell',kind:'read',description:'Fichiers ajoutés ou modifiés',source:'builtin'},
  {id:'shell-diff',label:'Différences Git',command:'git diff --stat',context:'shell',kind:'read',description:'Résumé des modifications non indexées',source:'builtin'},
  {id:'codex-help',label:'Aide Codex',command:'/help',context:'codex',kind:'slash',description:'Commandes de l’outil (si disponible)',source:'builtin'},
  {id:'codex-status',label:'Statut Codex',command:'/status',context:'codex',kind:'slash',description:'Informations sur la session',source:'builtin'},
  {id:'codex-review',label:'Relecture Codex',command:'/review',context:'codex',kind:'slash',description:'Lance ou configure une revue',source:'builtin'},
  {id:'claude-help',label:'Aide Claude',command:'/help',context:'claude',kind:'slash',description:'Découvrir les commandes disponibles',source:'builtin'},
  {id:'claude-context',label:'Contexte Claude',command:'/context',context:'claude',kind:'slash',description:'Visualiser la fenêtre de contexte',source:'builtin'},
  {id:'claude-compact',label:'Compacter Claude',command:'/compact',context:'claude',kind:'slash',description:'Demande de compaction (à confirmer)',source:'builtin'},
]
export function inferCliContext(name:string, explicit?:string):CliContext {
  const text=(explicit || name).trim().toLowerCase()
  if (/\b(?:codex|openai codex)\b/.test(text))return 'codex'
  if (/\b(?:claude|claude-code)\b/.test(text))return 'claude'
  if (/\b(?:bash|zsh|fish|powershell|sh|shell|ubuntu)\b/.test(text))return 'shell'
  return 'unknown'
}
export function safeSlashName(command:string):boolean {
  return /^\/[a-z][a-z\d-]{1,31}$/.test(command)
}
export function discoverSlashCommands(text:string):string[] {
  // Only recognizable slash help menus (not URLs, file paths, log lines).
  const lines=String(text).slice(-12000).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').split('\n')
  const found=new Set<string>()
  for(const line of lines){
    const match=line.trim().match(/^(?:[-*•]\s*)?(?:`)?(\/[a-z][a-z\d-]{1,31})(?:`)?(?:\s{2,}|\s+[-:–]|\s*$)/i)
    if(match&&safeSlashName(match[1]!.toLowerCase()))found.add(match[1]!.toLowerCase())
    if(found.size>=40)break
  }
  return [...found]
}
export function availableActions(context:CliContext, observed:string[]=[]):PaletteAction[]{
  const defaults=builtin.filter(a=>a.context===context)
  const added=observed.filter(safeSlashName).filter(cmd=>!defaults.some(a=>a.command===cmd))
    .slice(0,30).map(command=>({
      id:'observed-'+command.slice(1),label:command,command,
      context,kind:'slash' as const,description:'Repérée dans une sortie locale, à vérifier',
      source:'observed' as const,
    }))
  return [...defaults,...(context==='codex'||context==='claude'?added:[])]
}
export function safeWorkspaceRelativePath(path:string):boolean {
  // Never synthesize terminal commands from untrusted traversal segments.
  return path.length<=512 && !path.startsWith('/') && !path.includes('\\')
    && path.split('/').every(segment=>Boolean(segment) && segment!=='.' && segment!=='..' && !/[\r\n\0]/.test(segment))
}
export function quotePosix(value:string):string {
  if(/[\r\n\0]/.test(value))throw new Error('invalid_path')
  return "'" + value.replace(/'/g,"'\\''") + "'"
}
