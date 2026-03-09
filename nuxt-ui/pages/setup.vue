<template>
  <div class="flex flex-col items-center justify-center min-h-[calc(100dvh-3rem)] px-6 py-10">
    <div class="w-full max-w-sm space-y-6">

      <!-- Title -->
      <div class="text-center">
        <h1 class="font-display font-light text-3xl tracking-tight">VibeBridge</h1>
        <p class="text-[11px] mt-2 tracking-widest" style="color:var(--muted)">Configuration initiale</p>
      </div>

      <!-- Step indicators -->
      <div class="flex gap-1.5 justify-center">
        <span
          v-for="i in 4"
          :key="i"
          class="h-0.5 flex-1 max-w-12 transition-colors duration-300"
          :style="i <= step ? 'background:var(--text)' : 'background:var(--border)'"
        />
      </div>

      <!-- ── Step 1: Install extension ─── -->
      <div v-if="step === 1" class="space-y-5">
        <div style="border:1px solid var(--border)">
          <div class="px-5 py-4" style="border-bottom:1px solid var(--border)">
            <p class="text-[9px] uppercase tracking-[0.2em]" style="color:var(--muted)">Étape 1 / 4</p>
            <p class="text-base mt-1 font-display font-light">Installer l'extension VS Code</p>
          </div>
          <div class="px-5 py-4 space-y-4 text-[12px]" style="color:var(--muted);line-height:1.7">
            <p>L'extension DevBridge connecte VS Code à cette application. Elle transmet le contexte de votre projet en temps réel.</p>
            <a
              href="vscode:extension/devbridge.vibebridge"
              class="flex items-center justify-between px-4 py-3 text-[11px] uppercase tracking-widest transition-colors"
              style="border:1px solid var(--text);color:var(--text);background:none;display:flex"
            >
              Ouvrir dans VS Code
              <span style="color:var(--muted)">↗</span>
            </a>
            <p class="text-[10px]">Ou cherchez <span class="font-mono" style="color:var(--text)">VibeBridge</span> dans le marketplace VS Code.</p>
          </div>
        </div>
        <button class="w-full text-[11px] uppercase tracking-widest py-3 transition-colors" style="border:1px solid var(--text);color:var(--text);background:none" @click="step = 2">
          Continuer →
        </button>
      </div>

      <!-- ── Step 2: Scan QR ───────────── -->
      <div v-if="step === 2" class="space-y-5">
        <div style="border:1px solid var(--border)">
          <div class="px-5 py-4" style="border-bottom:1px solid var(--border)">
            <p class="text-[9px] uppercase tracking-[0.2em]" style="color:var(--muted)">Étape 2 / 4</p>
            <p class="text-base mt-1 font-display font-light">Scanner le QR code</p>
          </div>
          <div class="px-5 py-4 space-y-4 text-[12px]" style="color:var(--muted);line-height:1.7">
            <p>Dans VS Code, ouvrez la palette de commandes et tapez <span class="font-mono" style="color:var(--text)">DevBridge: Show QR</span>.</p>
            <p>Scannez le QR code affiché. L'URL présentée contient automatiquement l'adresse IP et le token d'authentification.</p>

            <!-- Manual IP fallback -->
            <div class="pt-2 space-y-2">
              <p class="text-[10px] uppercase tracking-[0.12em]" style="color:var(--muted)">Ou saisir l'adresse manuellement :</p>
              <div class="flex gap-2">
                <input
                  v-model="manualIp"
                  placeholder="192.168.1.42"
                  class="flex-1 text-[11px] font-mono px-3 py-2 outline-none"
                  style="background:var(--surface);border:1px solid var(--border);color:var(--text)"
                />
                <input
                  v-model.number="manualPort"
                  type="number"
                  placeholder="3333"
                  class="w-20 text-[11px] font-mono px-3 py-2 outline-none"
                  style="background:var(--surface);border:1px solid var(--border);color:var(--text)"
                />
              </div>
              <button
                v-if="manualIp"
                class="w-full text-[10px] uppercase tracking-widest py-2 transition-colors"
                style="border:1px solid var(--border);color:var(--text);background:none"
                @click="applyManualIp"
              >
                Utiliser cette IP
              </button>
            </div>
          </div>
        </div>
        <div class="flex gap-2">
          <button class="flex-1 text-[11px] uppercase tracking-widest py-3 transition-colors" style="border:1px solid var(--border);color:var(--muted);background:none" @click="step = 1">← Retour</button>
          <button class="flex-1 text-[11px] uppercase tracking-widest py-3 transition-colors" style="border:1px solid var(--text);color:var(--text);background:none" @click="step = 3">Continuer →</button>
        </div>
      </div>

      <!-- ── Step 3: Test connexion ────── -->
      <div v-if="step === 3" class="space-y-5">
        <div style="border:1px solid var(--border)">
          <div class="px-5 py-4" style="border-bottom:1px solid var(--border)">
            <p class="text-[9px] uppercase tracking-[0.2em]" style="color:var(--muted)">Étape 3 / 4</p>
            <p class="text-base mt-1 font-display font-light">Tester la connexion</p>
          </div>
          <div class="px-5 py-4 space-y-3">
            <p class="text-[11px]" style="color:var(--muted)">Assurez-vous que PC et téléphone sont sur le même WiFi.</p>

            <button
              :disabled="testing"
              class="w-full text-[11px] uppercase tracking-widest py-2.5 transition-colors disabled:opacity-40"
              style="border:1px solid var(--text);color:var(--text);background:none"
              @click="runTest"
            >
              {{ testing ? 'Test en cours…' : 'Lancer le test' }}
            </button>

            <div v-if="testResults.length" class="space-y-1.5 pt-1">
              <div
                v-for="r in testResults"
                :key="r.url"
                class="flex items-center justify-between px-3 py-2 text-[10px]"
                style="border:1px solid var(--border)"
              >
                <div class="flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full shrink-0"
                    :style="r.status === 'ok' ? 'background:var(--dot-green)' : r.status === 'pending' ? 'background:var(--dot-amber)' : 'background:var(--dot-red)'" />
                  <span class="font-mono break-all">{{ r.url }}</span>
                </div>
                <span class="shrink-0 ml-2" :style="r.status === 'ok' ? 'color:var(--dot-green)' : 'color:var(--muted)'">
                  {{ r.status === 'pending' ? '…' : r.status === 'ok' ? `${r.ms}ms` : '✗' }}
                </span>
              </div>
            </div>

            <p v-if="noCandidate" class="text-[10px]" style="color:var(--dot-red)">
              Aucun candidat — configurez une IP manuelle à l'étape 2.
            </p>
          </div>
        </div>
        <div class="flex gap-2">
          <button class="flex-1 text-[11px] uppercase tracking-widest py-3 transition-colors" style="border:1px solid var(--border);color:var(--muted);background:none" @click="step = 2">← Retour</button>
          <button
            :disabled="!canProceed"
            class="flex-1 text-[11px] uppercase tracking-widest py-3 transition-colors disabled:opacity-40"
            style="border:1px solid var(--text);color:var(--text);background:none"
            @click="step = 4"
          >
            Continuer →
          </button>
        </div>
      </div>

      <!-- ── Step 4: Done ───────────────── -->
      <div v-if="step === 4" class="space-y-5 text-center">
        <div style="border:1px solid var(--dot-green)">
          <div class="px-5 py-8 space-y-3">
            <p class="text-3xl">✓</p>
            <p class="font-display font-light text-xl" style="color:var(--dot-green)">C'est prêt !</p>
            <p class="text-[11px]" style="color:var(--muted)">
              Connexion établie via <span class="font-mono" style="color:var(--text)">{{ bestUrl }}</span>
            </p>
          </div>
        </div>
        <button
          class="w-full text-[11px] uppercase tracking-widest py-3 transition-colors"
          style="border:1px solid var(--text);color:var(--text);background:none"
          @click="navigateTo('/')"
        >
          Ouvrir DevBridge →
        </button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
// Redirect to / if already configured and connected
onMounted(() => {
  const hasToken = Boolean(localStorage.getItem('vb:token'))
  if (hasToken && !route.query.setup) {
    navigateTo('/')
  }
})

const route = useRoute()
const { config: netConfig, getCandidates, testUrl } = useNetworkConfig()

const step = ref(1)
const manualIp = ref(netConfig.value.manualIp)
const manualPort = ref(netConfig.value.manualPort)

function applyManualIp() {
  netConfig.value.manualIp = manualIp.value.trim()
  netConfig.value.manualPort = manualPort.value || 3333
  netConfig.value.mode = 'auto'
}

interface TestResult { url: string; ms: number | null; status: 'pending' | 'ok' | 'fail' }
const testResults = ref<TestResult[]>([])
const testing = ref(false)
const noCandidate = ref(false)

const bestUrl = computed(() => testResults.value.find(r => r.status === 'ok')?.url ?? '')
const canProceed = computed(() => testResults.value.some(r => r.status === 'ok'))

async function runTest() {
  const candidates = getCandidates()
  if (!candidates.length) {
    noCandidate.value = true
    return
  }
  noCandidate.value = false
  testing.value = true
  testResults.value = candidates.map(url => ({ url, ms: null, status: 'pending' as const }))

  for (let i = 0; i < candidates.length; i++) {
    const ms = await testUrl(candidates[i])
    testResults.value[i] = { url: candidates[i], ms, status: ms !== null ? 'ok' : 'fail' }
    if (ms !== null) break // found a working URL, no need to try further
  }
  testing.value = false
}

useHead({ title: 'Configuration — VibeBridge' })
</script>
