/**
 * Lightweight preflight for the optional WSL local model.
 * Never starts inference, reads transcripts, or logs secrets.
 * All results stay in the VS Code Output panel on this machine.
 */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { modelFitsBudget, parseLinuxMemoryAvailable, sampleLinuxCpuUtilization } from './aiResourceGovernor'

export interface LocalAiDiagnosticConfig {
  enabled: boolean
  binary: string
  modelPath: string
  memoryMb: number
  reserveMb: number
  threads: number
}
export async function findLocalExecutable(executable: string, searchPath: string = process.env.PATH ?? ''): Promise<boolean> {
  if (!executable || /[\x00\r\n]/.test(executable)) return false
  const candidates = executable.includes('/')
    ? [executable]
    : searchPath.split(path.delimiter).filter(Boolean).map(root => path.join(root, executable))
  for (const candidate of candidates) {
    try {
      const info = await fs.stat(candidate)
      if (!info.isFile()) continue
      await fs.access(candidate, constants.X_OK)
      return true
    } catch { /* Try next location. */ }
  }
  return false
}
export async function diagnoseLocalAi(config: LocalAiDiagnosticConfig): Promise<string[]> {
  const result: string[] = ['ViBridge : diagnostic IA locale (aucune analyse lancée)']
  result.push('Plateforme : ' + process.platform)
  result.push('Modèle activé dans les paramètres Utilisateur : ' + (config.enabled ? 'oui' : 'non'))
  const bin = config.binary.trim() || 'llama-cli'
  const binaryOK = await findLocalExecutable(bin)
  result.push('llama-cli accessible au processus VS Code : ' + (binaryOK ? 'oui' : 'non'))
  const deps = await Promise.all(['timeout', 'flock', 'nice'].map(async command => ({
    command, available: await findLocalExecutable(command),
  })))
  for (const dep of deps) result.push(dep.command + ' disponible : ' + (dep.available ? 'oui' : 'non'))

  let modelBytes = 0
  if (path.isAbsolute(config.modelPath) && config.modelPath.toLowerCase().endsWith('.gguf')) {
    try {
      const info = await fs.stat(config.modelPath)
      if (info.isFile()) {
        await fs.access(config.modelPath, constants.R_OK)
        modelBytes = info.size
      }
    } catch { /* Missing or inaccessible file. */ }
  }
  result.push('Modèle GGUF lisible : ' + (modelBytes ? 'oui' : 'non'))
  if (modelBytes) {
    result.push('Taille du modèle : ' + Math.round(modelBytes / (1024*1024)) + ' Mio')
    result.push('Compatible avec le budget estimé : ' + (modelFitsBudget(modelBytes, config.memoryMb) ? 'oui' : 'non'))
  }
  const memory=process.platform==='linux'
    ?parseLinuxMemoryAvailable(await fs.readFile('/proc/meminfo','utf8').catch(()=>'')):null
  result.push('RAM disponible dans WSL : ' + (memory===null?'inconnue':memory+' Mio'))
  result.push('Budget IA : '+config.memoryMb+' Mio, réserve : '+config.reserveMb+' Mio, CPU : '+config.threads+' thread(s)')
  if(memory!==null)result.push('Précondition RAM disponible : '
    +(memory >= config.memoryMb+config.reserveMb?'satisfaite':'insuffisante'))
  const cpu=process.platform==='linux'?await sampleLinuxCpuUtilization(250):null
  result.push('Utilisation CPU réelle (échantillon 250 ms) : '
    +(cpu===null?'indisponible':Math.round(cpu*100)+' %'))
  result.push('Protection CPU : deux échantillons consécutifs >= 92 % bloquent le démarrage')
  result.push('Charge Linux moyenne (1 min, informative seulement) : '+os.loadavg()[0].toFixed(2))
  result.push('Ces contrôles ne prouvent pas qu’une génération fonctionne. Ils ne chargent pas le modèle.')
  return result
}
