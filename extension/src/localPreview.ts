/**
 * Capture an explicitly allowed localhost port on the VS Code extension host.
 *
 * Playwright is an OPTIONAL local prerequisite. There is deliberately no
 * relay-side browser, public tunnel, browser profile reuse, or arbitrary URL.
 */
import * as vscode from 'vscode'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const execFileAsync = promisify(execFile)

const captureScript = String.raw\`
'use strict'
const { chromium } = require(process.argv[1])
const port = Number(process.argv[2])
const width = Number(process.argv[3])
const height = Number(process.argv[4])
const origin = 'http://127.0.0.1:' + port
const allowedHosts = new Set(['127.0.0.1', 'localhost'])
;(async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width, height },
      permissions: [],
      serviceWorkers: 'block',
      acceptDownloads: false,
    })
    // Never follow redirects or resource loads to other ports, internal
    // services or public origins. The page may render without external fonts.
    await context.route('**/*', async route => {
      let allowed = false
      try {
        const requested = new URL(route.request().url())
        allowed = requested.protocol === 'http:' && allowedHosts.has(requested.hostname)
          && Number(requested.port) === port
      } catch {}
      if (allowed) await route.continue()
      else await route.abort('blockedbyclient')
    })
    const page = await context.newPage()
    await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 10000 })
    const image = await page.screenshot({ type: 'png', animations: 'disabled', timeout: 10000 })
    if (image.byteLength > 500000) throw new Error('screenshot_too_large')
    process.stdout.write(image.toString('base64'))
  } finally {
    await browser.close()
  }
})().catch(e => { console.error(e && e.message ? e.message : String(e)); process.exitCode = 1 })
\`

export async function captureLocalPreview(port: number, device: 'mobile' | 'desktop'): Promise<string> {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('invalid_port')
  if (device !== 'mobile' && device !== 'desktop') throw new Error('invalid_device')

  const config = vscode.workspace.getConfiguration('devbridge')
  // Only trusted *user-level* settings can authorize a local dev port.
  const configured = config.inspect<number[]>('previewPorts')?.globalValue
  const allowedPorts = Array.isArray(configured) ? configured : []
  if (!allowedPorts.includes(port)) throw new Error('preview_port_not_authorized_on_pc')

  const moduleConfig = config.inspect<string>('previewPlaywrightModule')?.globalValue
  const playwrightModule = typeof moduleConfig === 'string' && moduleConfig.trim()
    ? moduleConfig.trim() : 'playwright'
  const [width, height] = device === 'mobile' ? [390, 844] : [1280, 800]
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      '-e', captureScript, playwrightModule, String(port), String(width), String(height),
    ], { timeout: 25000, maxBuffer: 800000, windowsHide: true })
    if (!/^[A-Za-z0-9+/=]+$/.test(stdout) || stdout.length > 700000) throw new Error('invalid_capture')
    return stdout
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Cannot find module')) throw new Error('playwright_not_installed_on_pc')
    if (message.includes('Executable doesn')) throw new Error('playwright_chromium_not_installed')
    if (message.includes('screenshot_too_large')) throw new Error('screenshot_too_large')
    throw new Error('preview_capture_failed')
  }
}
