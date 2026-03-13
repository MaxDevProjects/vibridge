<template>
  <div class="flex flex-col min-h-[calc(100dvh-3rem)] overflow-y-auto">

    <!-- Header -->
    <div class="px-6 py-6 shrink-0" style="border-bottom:1px solid var(--border)">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="font-display font-light text-2xl tracking-tight">Paramètres</h1>
          <p class="text-[11px] mt-1 tracking-widest" style="color:var(--muted)">Réseau · Connexion</p>
        </div>
        <NuxtLink
          to="/"
          class="text-[10px] uppercase tracking-widest px-3 py-1.5 transition-colors"
          style="border:1px solid var(--border);color:var(--muted)"
        >
          ← Retour
        </NuxtLink>
      </div>
    </div>

    <div class="flex-1 px-6 py-6 max-w-xl space-y-6">

      <!-- ── Mode ─────────────────────────────────────── -->

      <!-- Cloud banner when HTTPS -->
      <section v-if="httpsContext" style="border:1px solid var(--dot-amber)">
        <div class="px-5 py-3" style="border-bottom:1px solid var(--dot-amber)">
          <p class="text-[9px] uppercase tracking-[0.2em]" style="color:var(--dot-amber)">Mode Cloud Actif</p>
        </div>
        <div class="px-5 py-4 space-y-2 text-[11px]" style="color:var(--muted);line-height:1.7">
          <p>La PWA est chargée depuis <strong style="color:var(--text)">HTTPS</strong>. La connexion passe obligatoirement par le relay sécurisé.</p>
          <p v-if="netConfig.relayUrl" class="font-mono text-[10px]" style="color:var(--text)">{{ netConfig.relayUrl }}</p>
          <p v-else class="text-[10px]" style="color:var(--dot-red)">Aucun relay configuré — définissez NUXT_PUBLIC_RELAY_URL.</p>
          <p class="text-[10px]">→ Les options IP locale et mDNS ne sont pas disponibles depuis HTTPS.</p>
        </div>
      </section>

      <section v-if="!httpsContext" style="border:1px solid var(--border)">
        <div class="px-5 py-3" style="border-bottom:1px solid var(--border)">
          <p class="text-[9px] uppercase tracking-[0.2em]" style="color:var(--muted)">Mode de connexion</p>
        </div>
        <div class="px-5 py-4 space-y-3">
          <label
            v-for="opt in modeOptions"
            :key="opt.value"
            class="flex items-start gap-3 cursor-pointer group"
          >
            <input
              type="radio"
              :value="opt.value"
              v-model="netConfig.mode"
              class="mt-0.5 accent-current"
            />
            <div>
              <p class="text-[11px] uppercase tracking-[0.1em]">{{ opt.label }}</p>
              <p class="text-[10px] mt-0.5" style="color:var(--muted)">{{ opt.desc }}</p>
            </div>
          </label>
        </div>
      </section>

      <!-- ── IP manuelle ───────────────────────────────── -->
      <section v-if="!httpsContext" style="border:1px solid var(--border)">
        <div class="px-5 py-3" style="border-bottom:1px solid var(--border)">
          <p class="text-[9px] uppercase tracking-[0.2em]" style="color:var(--muted)">IP manuelle (optionnel)</p>
        </div>
        <div class="px-5 py-4 space-y-3">
          <div>
            <p class="text-[9px] uppercase tracking-[0.12em] mb-1.5" style="color:var(--muted)">Adresse IP du PC</p>
            <input
              v-model="netConfig.manualIp"
              placeholder="192.168.1.42"
              class="w-full text-[12px] font-mono px-3 py-2 outline-none"
              style="background:var(--surface);border:1px solid var(--border);color:var(--text)"
            />
          </div>
          <div>
            <p class="text-[9px] uppercase tracking-[0.12em] mb-1.5" style="color:var(--muted)">Port Agent</p>
            <input
              v-model.number="netConfig.manualPort"
              type="number"
              placeholder="3333"
              class="w-28 text-[12px] font-mono px-3 py-2 outline-none"
              style="background:var(--surface);border:1px solid var(--border);color:var(--text)"
            />
          </div>
        </div>
      </section>

      <!-- ── Relay URL ─────────────────────────────────── -->
      <section style="border:1px solid var(--border)">
        <div class="px-5 py-3" style="border-bottom:1px solid var(--border)">
          <p class="text-[9px] uppercase tracking-[0.2em]" style="color:var(--muted)">Relay (fallback cloud)</p>
        </div>
        <div class="px-5 py-4">
          <p class="text-[9px] uppercase tracking-[0.12em] mb-1.5" style="color:var(--muted)">URL du serveur relay</p>
          <input
            v-model="netConfig.relayUrl"
            placeholder="https://relay.example.com"
            class="w-full text-[12px] font-mono px-3 py-2 outline-none"
            style="background:var(--surface);border:1px solid var(--border);color:var(--text)"
          />
        </div>
      </section>

      <!-- ── Test connexion ────────────────────────────── -->
      <section style="border:1px solid var(--border)">
        <div class="px-5 py-3" style="border-bottom:1px solid var(--border)">
          <p class="text-[9px] uppercase tracking-[0.2em]" style="color:var(--muted)">Tester la connexion</p>
        </div>
        <div class="px-5 py-4 space-y-4">
          <button
            :disabled="testing"
            class="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-40"
            style="border:1px solid var(--text);color:var(--text);background:none"
            @click="testConnections"
          >
            {{ testing ? 'Test en cours…' : 'Tester la connexion' }}
          </button>

          <!-- Results -->
          <div v-if="testResults.length" class="space-y-2">
            <div
              v-for="r in testResults"
              :key="r.url"
              class="flex items-center justify-between px-3.5 py-2.5 text-[11px]"
              style="border:1px solid var(--border)"
            >
              <div class="flex items-center gap-2">
                <span v-if="r.status === 'pending'" class="w-1.5 h-1.5 rounded-full vb-pulse" style="background:var(--dot-amber)" />
                <span v-else-if="r.status === 'ok'" class="w-1.5 h-1.5 rounded-full" style="background:var(--dot-green)" />
                <span v-else class="w-1.5 h-1.5 rounded-full" style="background:var(--dot-red)" />
                <span class="font-mono text-[10px] break-all">{{ r.url }}</span>
              </div>
              <span class="text-[10px] shrink-0 ml-3" :style="r.status === 'ok' ? 'color:var(--dot-green)' : 'color:var(--muted)'">
                {{ r.status === 'pending' ? '…' : r.status === 'ok' ? `${r.ms}ms` : 'injoignable' }}
              </span>
            </div>
          </div>

          <!-- Best URL hint -->
          <p v-if="bestResult" class="text-[10px]" style="color:var(--dot-green)">
            ✓ Meilleure URL : <span class="font-mono">{{ bestResult.url }}</span>
          </p>
          <p v-else-if="testResults.length && !testing" class="text-[10px]" style="color:var(--dot-red)">
            ✗ Aucune URL joignable — vérifiez votre réseau
          </p>
        </div>
      </section>

      <!-- ── Current bridge status ─────────────────────── -->
      <section style="border:1px solid var(--border)">
        <div class="px-5 py-3" style="border-bottom:1px solid var(--border)">
          <p class="text-[9px] uppercase tracking-[0.2em]" style="color:var(--muted)">État actuel</p>
        </div>
        <div class="px-5 py-4 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-[10px] uppercase tracking-[0.12em]" style="color:var(--muted)">Statut</span>
            <StatusDot
              :state="bridge.status.value"
              :mode="bridge.mode.value"
              :latency="bridge.latencyMs.value"
            />
          </div>
          <div v-if="bridge.activeUrl.value" class="flex items-center justify-between">
            <span class="text-[10px] uppercase tracking-[0.12em]" style="color:var(--muted)">URL active</span>
            <span class="text-[10px] font-mono" style="color:var(--text)">{{ bridge.activeUrl.value }}</span>
          </div>
          <div v-if="bridge.status.value !== 'connected'" class="pt-2">
            <button
              class="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors"
              style="border:1px solid var(--border);color:var(--text);background:none"
              @click="reconnect"
            >
              Reconnecter
            </button>
          </div>
        </div>
      </section>


      <!-- ── Notifications push ───────────────────── -->
      <section style="border:1px solid var(--border)">
        <div class="px-5 py-3" style="border-bottom:1px solid var(--border)">
          <p class="text-[9px] uppercase tracking-[0.2em]" style="color:var(--muted)">Notifications push</p>
        </div>
        <div class="px-5 py-4 space-y-3">
          <div class="flex items-center justify-between gap-3">
            <span class="text-[10px] uppercase tracking-[0.12em]" style="color:var(--muted)">État</span>
            <span class="text-[10px] uppercase tracking-[0.12em]" :style="pushStatusStyle">{{ pushStatusLabel }}</span>
          </div>

          <p v-if="push.permission.value === 'denied'" class="text-[10px]" style="color:var(--dot-red)">
            Les notifications sont bloquées par le navigateur. Activez-les dans les paramètres du site.
          </p>
          <p v-else-if="push.error.value" class="text-[10px]" style="color:var(--dot-red)">
            {{ push.error.value }}
          </p>

          <button
            :disabled="push.isLoading.value || !bridge.token.value"
            class="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors disabled:opacity-40"
            style="border:1px solid var(--border);color:var(--text);background:none"
            @click="togglePush"
          >
            {{ push.isLoading.value
              ? 'Traitement…'
              : push.isSubscribed.value
                ? 'Désactiver les notifications'
                : 'Activer les notifications' }}
          </button>
        </div>
      </section>

      <!-- ── Outils CLI ──────────────────────────────── -->
      <section style="border:1px solid var(--border)">
        <div class="px-5 py-3 flex items-center justify-between" style="border-bottom:1px solid var(--border)">
          <p class="text-[9px] uppercase tracking-[0.2em]" style="color:var(--muted)">Outils CLI</p>
          <button
            :disabled="detecting"
            class="text-[9px] uppercase tracking-widest px-3 py-1 transition-colors disabled:opacity-40"
            style="border:1px solid var(--border);color:var(--muted);background:none"
            @click="detectClis"
          >
            {{ detecting ? 'Détection…' : 'Relancer la détection' }}
          </button>
        </div>

        <!-- CLI list -->
        <div>
          <div
            v-for="(cli, i) in cliList" :key="cli.id"
            class="flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-surface"
            :style="i < cliList.length - 1 ? 'border-bottom:1px solid var(--border)' : ''"
            @click="openCliEdit(cli)"
          >
            <!-- Status dot -->
            <span
              class="shrink-0 w-2 h-2 rounded-full"
              :style="`background:var(--dot-${cli.detected ? 'green' : 'red'})`"
            />
            <!-- Info -->
            <div class="flex-1 min-w-0">
              <p class="text-[11px] uppercase tracking-[0.08em]">
                {{ cli.name }}
                <span v-if="cli.isDefault" class="ml-2 text-[9px] tracking-widest" style="color:var(--dot-amber)">★ Défaut</span>
                <span v-if="cli.isCustom" class="ml-2 text-[9px] tracking-widest" style="color:var(--muted)">[custom]</span>
              </p>
              <p class="text-[10px] font-mono mt-0.5" style="color:var(--muted)">
                {{ cli.command }}{{ cli.args.length ? ' ' + cli.args.join(' ') : '' }}
              </p>
            </div>
            <!-- Actions -->
            <div class="flex items-center gap-2 shrink-0">
              <button
                v-if="!cli.isDefault"
                class="text-[9px] uppercase tracking-widest px-2 py-1"
                style="border:1px solid var(--border);color:var(--muted);background:none"
                @click.stop="setDefault(cli.id)"
              >
                Défaut
              </button>
              <button
                v-if="cli.isCustom"
                class="text-[9px] uppercase tracking-widest px-2 py-1"
                style="border:1px solid var(--dot-red);color:var(--dot-red);background:none"
                @click.stop="removeCli(cli.id)"
              >
                ✕
              </button>
            </div>
          </div>
          <p v-if="!cliList.length" class="px-5 py-4 text-[10px]" style="color:var(--muted)">Chargement…</p>
        </div>

        <!-- Add custom CLI -->
        <div class="px-5 py-4" style="border-top:1px solid var(--border)">
          <button
            class="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors w-full"
            style="border:1px solid var(--border);color:var(--text);background:none"
            @click="showAddCli = !showAddCli"
          >
            {{ showAddCli ? '✕ Annuler' : '+ Ajouter un CLI personnalisé' }}
          </button>

          <div v-if="showAddCli" class="mt-3 space-y-2">
            <input
              v-model="newCli.name"
              placeholder="Nom (ex\u00a0: Mon agent perso)"
              class="w-full text-[11px] px-3 py-2 outline-none"
              style="background:var(--surface);border:1px solid var(--border);color:var(--text)"
            />
            <input
              v-model="newCli.command"
              placeholder="Commande (ex\u00a0: python my-agent.py)"
              class="w-full text-[11px] font-mono px-3 py-2 outline-none"
              style="background:var(--surface);border:1px solid var(--border);color:var(--text)"
            />
            <input
              v-model="newCli.args"
              placeholder="Args (ex\u00a0: --model gpt-4)"
              class="w-full text-[11px] font-mono px-3 py-2 outline-none"
              style="background:var(--surface);border:1px solid var(--border);color:var(--text)"
            />
            <div class="flex gap-2">
              <button
                :disabled="!newCli.name || !newCli.command || addingCli"
                class="flex-1 text-[10px] uppercase tracking-widest py-2 transition-colors disabled:opacity-40"
                style="border:1px solid var(--text);color:var(--text);background:none"
                @click="addCli"
              >
                {{ addingCli ? 'Ajout…' : 'Ajouter' }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Danger zone ──────────────────────────────── -->
      <section style="border:1px solid var(--border)">
        <div class="px-5 py-3" style="border-bottom:1px solid var(--border)">
          <p class="text-[9px] uppercase tracking-[0.2em]" style="color:var(--dot-red)">Session</p>
        </div>
        <div class="px-5 py-4">
          <button
            class="text-[10px] uppercase tracking-widest px-4 py-2 transition-colors"
            style="border:1px solid var(--dot-red);color:var(--dot-red);background:none"
            @click="clearSession"
          >
            Effacer la session (déconnexion)
          </button>
        </div>
      </section>

    </div>
  </div>
</template>

<script setup lang="ts">
const bridge = useDevBridge()
const { config: netConfig, getCandidates, testUrl, isHttpsContext } = useNetworkConfig()
const push = usePushNotifications()

const pushStatusLabel = computed(() => {
  if (!push.isSupported.value) return 'NON SUPPORTÉ'
  if (push.permission.value === 'denied') return 'REFUSÉ'
  if (push.isSubscribed.value) return 'ACTIF'
  return 'INACTIF'
})

const pushStatusStyle = computed(() => {
  if (!push.isSupported.value || push.permission.value === 'denied') return 'color:var(--dot-red)'
  if (push.isSubscribed.value) return 'color:var(--dot-green)'
  return 'color:var(--muted)'
})

async function togglePush() {
  if (push.isLoading.value) return
  if (push.isSubscribed.value) {
    await push.unsubscribe()
    return
  }
  await push.subscribe()
}

const httpsContext = import.meta.client ? isHttpsContext() : false

const modeOptions = [
  { value: 'auto'  as const, label: 'Auto',          desc: 'Tente mDNS → IP manuelle → Relay dans l\'ordre' },
  { value: 'local' as const, label: 'Local forcé',   desc: 'N\'utilise que le réseau local (mDNS ou IP manuelle)' },
  { value: 'relay' as const, label: 'Relay forcé',   desc: 'Passe systématiquement par le serveur relay' },
]

interface TestResult {
  url: string
  ms: number | null
  status: 'pending' | 'ok' | 'fail'
}

const testResults = ref<TestResult[]>([])
const testing = ref(false)

const bestResult = computed(() =>
  testResults.value.find(r => r.status === 'ok') ?? null,
)

async function testConnections() {
  testing.value = true
  const candidates = getCandidates()
  testResults.value = candidates.map(url => ({ url, ms: null, status: 'pending' as const }))

  for (let i = 0; i < candidates.length; i++) {
    const ms = await testUrl(candidates[i])
    testResults.value[i] = { url: candidates[i], ms, status: ms !== null ? 'ok' : 'fail' }
  }

  testing.value = false
}

function reconnect() {
  bridge.clearStoredSession()
  navigateTo('/')
}

function clearSession() {
  bridge.clearStoredSession()
  navigateTo('/setup')
}

// ── CLI Registry ───────────────────────────────────────

interface CliDef {
  id: string; name: string; command: string; args: string[]
  detected: boolean; isDefault: boolean; isCustom: boolean
}

const cliList = ref<CliDef[]>([])
const detecting = ref(false)
const showAddCli = ref(false)
const addingCli = ref(false)
const newCli = reactive({ name: '', command: '', args: '' })

function agentFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = bridge.token.value ?? ''
  const base = bridge.activeUrl.value ?? ''
  return fetch(`${base}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
  }).then(r => r.json() as Promise<T>)
}

onMounted(async () => {
  try {
    const data = await agentFetch<{ clis: CliDef[] }>('/clis')
    cliList.value = data.clis ?? []
  } catch { /* not connected yet */ }
})

async function detectClis() {
  detecting.value = true
  try {
    const data = await agentFetch<{ clis: CliDef[] }>('/clis/detect', { method: 'POST' })
    cliList.value = data.clis ?? []
  } finally {
    detecting.value = false
  }
}

async function setDefault(id: string) {
  const data = await agentFetch<{ clis: CliDef[] }>('/clis/default', {
    method: 'POST', body: JSON.stringify({ id }),
  })
  cliList.value = data.clis ?? cliList.value
}

async function removeCli(id: string) {
  await agentFetch('/clis/' + id, { method: 'DELETE' })
  cliList.value = cliList.value.filter(c => c.id !== id)
}

async function addCli() {
  addingCli.value = true
  try {
    const args = newCli.args.trim().split(/\s+/).filter(Boolean)
    const data = await agentFetch<{ clis: CliDef[] }>('/clis/custom', {
      method: 'POST',
      body: JSON.stringify({ name: newCli.name, command: newCli.command, args }),
    })
    cliList.value = data.clis ?? cliList.value
    newCli.name = ''; newCli.command = ''; newCli.args = ''
    showAddCli.value = false
  } finally {
    addingCli.value = false
  }
}

function openCliEdit(_cli: CliDef) {
  // future: inline edit modal
}

// Sync CLI list from WS broadcast
useNuxtApp().$router // ensure we're client-side
onMounted(() => {
  bridge.onMessage((msg) => {
    if (msg.type === 'clis_update' && Array.isArray(msg.clis)) {
      cliList.value = msg.clis as CliDef[]
    }
  })
})

useHead({ title: 'Paramètres — VibeBridge' })
</script>
