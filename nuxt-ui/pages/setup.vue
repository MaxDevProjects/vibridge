<template>
  <div class="min-h-[calc(100dvh-3.5rem)] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
    <div class="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section class="vb-panel vb-panel-strong overflow-hidden">
        <div class="relative p-6 sm:p-8 lg:p-10">
          <div class="mb-10 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.24em]">
            <span class="vb-chip">Produit qui tient debout</span>
            <span class="vb-chip">Setup &lt; 10 min</span>
            <span class="vb-chip">Session persistée</span>
          </div>

          <div class="max-w-2xl space-y-6">
            <p class="text-[11px] uppercase tracking-[0.32em]" style="color:var(--accent)">Écran {{ stepLabel }}</p>
            <h1 class="font-display text-4xl font-light leading-tight sm:text-5xl lg:text-6xl">
              Ton AI travaille.
              <br>
              Toi aussi, ailleurs.
            </h1>
            <p class="max-w-xl text-[13px] leading-7 sm:text-[14px]" style="color:var(--text-mid)">
              ViBridge relie ta session VS Code, ton relay et la PWA dans une seule boucle. Le nouveau flow garde l’esthétique
              actuelle, mais clarifie l’entrée, l’auth, l’installation et la première connexion.
            </p>
          </div>

          <div class="mt-10 grid gap-3 sm:grid-cols-2">
            <div
              v-for="item in highlights"
              :key="item.title"
              class="vb-panel p-4 sm:p-5"
            >
              <p class="text-[10px] uppercase tracking-[0.22em]" style="color:var(--muted)">{{ item.kicker }}</p>
              <p class="mt-2 font-display text-lg font-light">{{ item.title }}</p>
              <p class="mt-2 text-[11px] leading-6" style="color:var(--text-mid)">{{ item.body }}</p>
            </div>
          </div>

          <div class="mt-10 grid gap-4 border-t pt-6 sm:grid-cols-3" style="border-color:var(--border)">
            <div>
              <p class="text-[10px] uppercase tracking-[0.2em]" style="color:var(--muted)">Contraste</p>
              <p class="mt-2 text-[12px] leading-6" style="color:var(--text-mid)">Mode clair renforcé, bordures lisibles, états d’action plus nets.</p>
            </div>
            <div>
              <p class="text-[10px] uppercase tracking-[0.2em]" style="color:var(--muted)">Flow</p>
              <p class="mt-2 text-[12px] leading-6" style="color:var(--text-mid)">Landing → auth → extension → attente → première liaison → session durable.</p>
            </div>
            <div>
              <p class="text-[10px] uppercase tracking-[0.2em]" style="color:var(--muted)">Statut</p>
              <p class="mt-2 text-[12px] leading-6" style="color:var(--text-mid)">{{ statusSummary }}</p>
            </div>
          </div>
        </div>
      </section>

      <section class="vb-panel overflow-hidden">
        <div class="border-b px-5 py-5 sm:px-6 sm:py-6" style="border-color:var(--border)">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-[10px] uppercase tracking-[0.24em]" style="color:var(--muted)">Onboarding guidé</p>
              <p class="mt-2 font-display text-2xl font-light">Phase 1</p>
            </div>
            <div class="text-right">
              <p class="text-[10px] uppercase tracking-[0.22em]" style="color:var(--muted)">Session</p>
              <p class="mt-2 text-[11px]" style="color:var(--text-mid)">{{ sessionModeLabel }}</p>
            </div>
          </div>

          <div class="mt-5 grid grid-cols-6 gap-2">
            <div
              v-for="item in setupStages"
              :key="item.step"
              class="h-1.5 transition-colors"
              :style="currentStageOrder >= item.order ? 'background:var(--text)' : 'background:var(--border)'"
            />
          </div>
        </div>

        <div class="p-5 sm:p-6">
          <div v-if="step === 0" class="space-y-6">
            <div class="space-y-3">
              <p class="text-[10px] uppercase tracking-[0.24em]" style="color:var(--muted)">Écran 0 — Landing page</p>
              <h2 class="font-display text-3xl font-light leading-tight">Un setup propre, sans friction ni QR à répétition.</h2>
              <p class="text-[12px] leading-7" style="color:var(--text-mid)">
                Un dev inconnu doit comprendre le produit, créer son accès, installer l’extension et arriver à une première connexion
                fiable sans bricolage.
              </p>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="vb-panel p-4">
                <p class="text-[10px] uppercase tracking-[0.18em]" style="color:var(--muted)">Promesse</p>
                <p class="mt-3 text-[12px] leading-6" style="color:var(--text-mid)">Le desktop lance l’agent. La PWA retrouve la session et reste connectée.</p>
              </div>
              <div class="vb-panel p-4">
                <p class="text-[10px] uppercase tracking-[0.18em]" style="color:var(--muted)">Cible</p>
                <p class="mt-3 text-[12px] leading-6" style="color:var(--text-mid)">Deux machines en parallèle, onboarding guidé, README utilisateur plus clair.</p>
              </div>
            </div>

            <button class="vb-button vb-button-primary w-full text-[11px] uppercase tracking-[0.22em]" @click="step = 1">
              Commencer gratuitement
            </button>
          </div>

          <div v-else-if="step === 1" class="space-y-6">
            <div class="space-y-3">
              <p class="text-[10px] uppercase tracking-[0.24em]" style="color:var(--muted)">Écran 1 — Auth</p>
              <h2 class="font-display text-3xl font-light">Créer ou récupérer le compte</h2>
              <p class="text-[12px] leading-7" style="color:var(--text-mid)">
                L’UI prépare déjà les trois entrées attendues. La persistance réelle du compte reste à brancher côté backend, mais
                l’expérience et l’ordre des choix sont prêts.
              </p>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <button
                class="vb-button text-[10px] uppercase tracking-[0.18em]"
                :style="authMode === 'signup' ? 'background:var(--text);color:var(--bg);border-color:var(--text)' : ''"
                @click="authMode = 'signup'"
              >
                Sign up
              </button>
              <button
                class="vb-button text-[10px] uppercase tracking-[0.18em]"
                :style="authMode === 'signin' ? 'background:var(--text);color:var(--bg);border-color:var(--text)' : ''"
                @click="authMode = 'signin'"
              >
                Sign in
              </button>
            </div>

            <div class="grid gap-3">
              <button
                v-for="option in authOptions"
                :key="option.id"
                class="vb-button justify-between text-left"
                :style="provider === option.id ? 'border-color:var(--accent);background:var(--accent-soft)' : ''"
                @click="selectProvider(option.id)"
              >
                <span>
                  <span class="block text-[10px] uppercase tracking-[0.18em]" style="color:var(--muted)">{{ option.kicker }}</span>
                  <span class="mt-1 block text-[12px]" :style="provider === option.id ? 'color:var(--text)' : 'color:var(--text-mid)'">{{ option.label }}</span>
                </span>
                <span class="text-[10px] uppercase tracking-[0.2em]" :style="provider === option.id ? 'color:var(--text)' : 'color:var(--muted)'">
                  {{ provider === option.id ? 'Sélectionné' : 'Choisir' }}
                </span>
              </button>
            </div>

            <div v-if="provider === 'email'" class="grid gap-3 sm:grid-cols-2">
              <input
                v-model="email"
                type="email"
                autocomplete="email"
                placeholder="dev@vibridge.app"
                class="min-h-[2.9rem] px-3 text-[12px] outline-none"
                style="background:var(--surface2);border:1px solid var(--border-bright);color:var(--text)"
              >
              <input
                v-model="password"
                type="password"
                autocomplete="current-password"
                placeholder="Mot de passe"
                class="min-h-[2.9rem] px-3 text-[12px] outline-none"
                style="background:var(--surface2);border:1px solid var(--border-bright);color:var(--text)"
              >
            </div>

            <div class="flex gap-3">
              <button class="vb-button flex-1 text-[11px] uppercase tracking-[0.2em]" @click="step = 0">Retour</button>
              <button class="vb-button vb-button-primary flex-1 text-[11px] uppercase tracking-[0.2em]" @click="submitAuth">
                {{ authMode === 'signup' ? 'Créer le compte' : 'Récupérer le compte' }}
              </button>
            </div>
          </div>

          <div v-else-if="step === 2" class="space-y-6">
            <div class="space-y-3">
              <p class="text-[10px] uppercase tracking-[0.24em]" style="color:var(--muted)">Écran 2 — Installer l’extension</p>
              <h2 class="font-display text-3xl font-light">Installe l’extension VS Code ViBridge</h2>
              <p class="text-[12px] leading-7" style="color:var(--text-mid)">
                Le CTA principal ouvre directement VS Code. Le second lien garde une voie `.vsix` locale via la doc existante tant
                qu’un build publié n’est pas encore servi par l’app.
              </p>
            </div>

            <div class="grid gap-3">
              <button
                class="vb-button vb-button-primary justify-between text-[11px] uppercase tracking-[0.2em]"
                @click="startInstallFlow('marketplace')"
              >
                Installer depuis le Marketplace
                <span>↗</span>
              </button>
              <button
                class="vb-button justify-between text-[11px] uppercase tracking-[0.2em]"
                @click="startInstallFlow('vsix')"
              >
                Guide de téléchargement .vsix
                <span>↗</span>
              </button>
            </div>

            <div class="grid gap-3 sm:grid-cols-3">
              <div class="vb-panel p-4">
                <p class="text-[10px] uppercase tracking-[0.18em]" style="color:var(--muted)">Background</p>
                <p class="mt-2 text-[11px] leading-6" style="color:var(--text-mid)">Prépare le tunnel relay et la suite du pairing côté UI.</p>
              </div>
              <div class="vb-panel p-4">
                <p class="text-[10px] uppercase tracking-[0.18em]" style="color:var(--muted)">Extension</p>
                <p class="mt-2 text-[11px] leading-6" style="color:var(--text-mid)">Commande clé : <span style="color:var(--text)">ViBridge: Show QR</span>.</p>
              </div>
              <div class="vb-panel p-4">
                <p class="text-[10px] uppercase tracking-[0.18em]" style="color:var(--muted)">Local</p>
                <p class="mt-2 text-[11px] leading-6" style="color:var(--text-mid)">Fallback manuel via IP/port si le relay n’est pas prêt.</p>
              </div>
            </div>

            <div class="flex gap-3">
              <button class="vb-button flex-1 text-[11px] uppercase tracking-[0.2em]" @click="step = 1">Retour</button>
              <button class="vb-button vb-button-primary flex-1 text-[11px] uppercase tracking-[0.2em]" @click="startInstallFlow()">
                Continuer
              </button>
            </div>
          </div>

          <div v-else-if="step === 3" class="space-y-6">
            <div class="space-y-3">
              <p class="text-[10px] uppercase tracking-[0.24em]" style="color:var(--muted)">Écran 3 — Attente</p>
              <h2 class="font-display text-3xl font-light">On installe tout ce qu’il faut...</h2>
              <p class="text-[12px] leading-7" style="color:var(--text-mid)">
                L’animation remplace le spinner générique. Aujourd’hui elle sert de transition UI vers la première liaison,
                en attendant le vrai endpoint `agent-status`.
              </p>
            </div>

            <div class="vb-panel vb-panel-strong p-6 text-center">
              <div class="vb-wave mx-auto w-fit">
                <span class="h-6" />
                <span class="h-12" />
                <span class="h-8" />
                <span class="h-14" />
                <span class="h-10" />
              </div>
              <p class="mt-6 text-[11px] uppercase tracking-[0.22em]" style="color:var(--muted)">{{ waiterStatus }}</p>
              <p class="mt-3 text-[13px]" style="color:var(--text-mid)">{{ waiterFacts[waiterMessageIndex] }}</p>
              <div class="mt-6 h-2 w-full overflow-hidden rounded-full" style="background:var(--surface2)">
                <div class="h-full transition-all duration-500" :style="`width:${waiterProgress}%;background:var(--text)`" />
              </div>
            </div>

            <button
              v-if="onboardingSession?.vscodeUri"
              class="vb-button w-full text-[11px] uppercase tracking-[0.2em]"
              @click="launchVsCodeOnboarding"
            >
              Ouvrir VS Code et lier l’installation
            </button>

            <div class="flex gap-3">
              <button class="vb-button flex-1 text-[11px] uppercase tracking-[0.2em]" @click="step = 2">Retour</button>
              <button class="vb-button vb-button-primary flex-1 text-[11px] uppercase tracking-[0.2em]" @click="step = 35">
                Voir le code
              </button>
            </div>
          </div>

          <div v-else-if="step === 35" class="space-y-6">
            <div class="space-y-3">
              <p class="text-[10px] uppercase tracking-[0.24em]" style="color:var(--muted)">Écran 3.5 — Prêt, première connexion</p>
              <h2 class="font-display text-3xl font-light">Tout est installé ✓</h2>
              <p class="text-[12px] leading-7" style="color:var(--text-mid)">
                Le pairing peut partir du code relay déjà présent dans l’URL, ou d’un code saisi manuellement depuis VS Code.
              </p>
            </div>

            <div class="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <div class="vb-panel vb-panel-strong flex items-center justify-center p-5">
                <div v-if="pairingQrDataUrl" class="text-center">
                  <img :src="pairingQrDataUrl" alt="QR de connexion ViBridge" class="mx-auto w-full max-w-[240px] rounded-sm bg-white p-3 vb-float">
                  <p class="mt-4 text-[10px] uppercase tracking-[0.22em]" style="color:var(--muted)">QR prêt pour la PWA / debug</p>
                </div>
                <div v-else class="space-y-3 text-center">
                  <p class="font-display text-xl font-light">Code manuel</p>
                  <p class="text-[11px] leading-6" style="color:var(--text-mid)">Aucun QR calculable tant qu’aucun code n’est renseigné.</p>
                </div>
              </div>

              <div class="space-y-4">
                <div class="vb-panel p-4">
                  <p class="text-[10px] uppercase tracking-[0.18em]" style="color:var(--muted)">Dans VS Code</p>
                  <p class="mt-3 text-[12px] leading-7" style="color:var(--text-mid)">`Ctrl+Shift+P` → <span style="color:var(--text)">ViBridge: Show QR</span> puis scanne ou récupère le code à 6 chiffres.</p>
                </div>

                <div class="vb-panel p-4">
                  <p class="text-[10px] uppercase tracking-[0.18em]" style="color:var(--muted)">Code de connexion</p>
                  <input
                    v-model="pairCode"
                    inputmode="numeric"
                    maxlength="6"
                    placeholder="123456"
                    class="mt-3 min-h-[3.2rem] w-full px-3 text-center text-xl tracking-[0.45em] outline-none"
                    style="background:var(--surface2);border:1px solid var(--border-bright);color:var(--text)"
                  >
                  <p class="mt-3 text-[11px] leading-6" style="color:var(--text-mid)">
                    {{ pairingHint }}
                  </p>
                </div>

                <div class="grid gap-3 sm:grid-cols-2">
                  <input
                    v-model="manualIp"
                    placeholder="devbridge.local ou 192.168.1.42"
                    class="min-h-[2.9rem] px-3 text-[12px] outline-none"
                    style="background:var(--surface2);border:1px solid var(--border-bright);color:var(--text)"
                  >
                  <input
                    v-model="manualPort"
                    type="number"
                    placeholder="3333"
                    class="min-h-[2.9rem] px-3 text-[12px] outline-none"
                    style="background:var(--surface2);border:1px solid var(--border-bright);color:var(--text)"
                  >
                </div>

                <p v-if="pairError" class="text-[11px]" style="color:var(--dot-red)">{{ pairError }}</p>
              </div>
            </div>

            <div class="flex gap-3">
              <button class="vb-button flex-1 text-[11px] uppercase tracking-[0.2em]" @click="step = 3">Retour</button>
              <button
                class="vb-button vb-button-primary flex-1 text-[11px] uppercase tracking-[0.2em] disabled:opacity-50"
                :disabled="pairing || pairCode.trim().length !== 6"
                @click="completePairing"
              >
                {{ pairing ? 'Connexion...' : 'Lier la session' }}
              </button>
            </div>
          </div>

          <div v-else-if="step === 4" class="space-y-6">
            <div class="space-y-3">
              <p class="text-[10px] uppercase tracking-[0.24em]" style="color:var(--muted)">Écran 4 — Connecté, pour toujours</p>
              <h2 class="font-display text-3xl font-light">La session est liée au compte.</h2>
              <p class="text-[12px] leading-7" style="color:var(--text-mid)">
                Le token mobile est persisté. La prochaine ouverture de VS Code et de la PWA doit retrouver la session sans repasser par le QR.
              </p>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="vb-panel p-4">
                <p class="text-[10px] uppercase tracking-[0.18em]" style="color:var(--muted)">Prochaine fois</p>
                <p class="mt-3 text-[12px] leading-7" style="color:var(--text-mid)">VS Code démarre l’agent. La PWA se reconnecte avec le token déjà stocké.</p>
              </div>
              <div class="vb-panel p-4">
                <p class="text-[10px] uppercase tracking-[0.18em]" style="color:var(--muted)">État courant</p>
                <p class="mt-3 text-[12px] leading-7" style="color:var(--text-mid)">{{ finalStatus }}</p>
              </div>
            </div>

            <button class="vb-button vb-button-primary w-full text-[11px] uppercase tracking-[0.22em]" @click="navigateTo('/')">
              Ouvrir ViBridge
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { renderSVG } from 'uqr'

type SetupStep = 0 | 1 | 2 | 3 | 35 | 4
type AuthMode = 'signup' | 'signin'
type AuthProvider = 'github' | 'gitlab' | 'email'

interface OnboardingSessionState {
  sessionId: string
  setupToken: string
  pairingCode: string
  expiresAt: number
  relayUrl: string
  qrUrl: string
  vscodeUri: string
  status: 'waiting' | 'paired' | 'closed'
  agentConnected: boolean
  mobileConnected: boolean
}

const route = useRoute()
const config = useRuntimeConfig()
const bridge = useDevBridge()
const { config: netConfig } = useNetworkConfig()

const marketplaceHref = 'vscode:extension/devbridge.vibebridge'
const vsixGuideHref = 'https://github.com/MaxDevProjects/vibridge/blob/main/extension/README.md'
const authMode = ref<AuthMode>('signup')
const provider = ref<AuthProvider>('github')
const email = ref('')
const password = ref('')
const manualIp = ref(netConfig.value.manualIp || String(config.public.agentHost))
const manualPort = ref(String(netConfig.value.manualPort || config.public.agentPort || '3333'))
const pairCode = ref('')
const step = ref<SetupStep>(0)
const pairing = ref(false)
const pairError = ref('')
const onboardingBusy = ref(false)
const waiterProgress = ref(14)
const waiterMessageIndex = ref(0)
const onboardingSession = ref<OnboardingSessionState | null>(null)

const highlights = [
  { kicker: 'Landing', title: 'Positionnement plus clair', body: 'Une promesse produit nette avant toute complexité technique.' },
  { kicker: 'Auth', title: 'Trois portes d’entrée', body: 'GitHub, GitLab ou email, dans un écran unique et lisible.' },
  { kicker: 'Install', title: 'Extension d’abord', body: 'Le parcours pousse l’action utile avant d’exposer les détails réseau.' },
  { kicker: 'Connect', title: 'Session durable', body: 'Le flow insiste sur le fait que le QR ne doit servir qu’une seule fois.' },
]

const authOptions = [
  { id: 'github' as const, kicker: 'OAuth', label: 'Continuer avec GitHub' },
  { id: 'gitlab' as const, kicker: 'OAuth', label: 'Continuer avec GitLab' },
  { id: 'email' as const, kicker: 'Email', label: 'Continuer avec email + mot de passe' },
]

const waiterFacts = [
  'Préparation du canal de relais et du token mobile.',
  'Recherche d’un point de contact entre extension, agent et PWA.',
  'Préparation du premier écran de connexion persistée.',
]

const setupStages = [
  { step: 0 as SetupStep, order: 0 },
  { step: 1 as SetupStep, order: 1 },
  { step: 2 as SetupStep, order: 2 },
  { step: 3 as SetupStep, order: 3 },
  { step: 35 as SetupStep, order: 4 },
  { step: 4 as SetupStep, order: 5 },
]

let waiterProgressTimer: ReturnType<typeof setInterval> | null = null
let waiterMessageTimer: ReturnType<typeof setInterval> | null = null
let waiterAdvanceTimer: ReturnType<typeof setTimeout> | null = null
let onboardingStatusTimer: ReturnType<typeof setInterval> | null = null

const routeRelayUrl = computed(() => normalizeBaseUrl(queryValue(route.query.relayUrl as string | string[] | undefined) || String(config.public.relayUrl || '')))
const routeSessionId = computed(() => queryValue(route.query.sessionId as string | string[] | undefined))
const routeCode = computed(() => queryValue(route.query.code as string | string[] | undefined))
const routeRelayFlag = computed(() => queryValue(route.query.relay as string | string[] | undefined) === '1')
const routeAgentUrl = computed(() => normalizeBaseUrl(queryValue(route.query.agentUrl as string | string[] | undefined)))
const hasRelayPairingQuery = computed(() => routeRelayFlag.value && Boolean(routeRelayUrl.value && routeSessionId.value && routeCode.value.length === 6))
const hasLocalPairingQuery = computed(() => Boolean(routeAgentUrl.value && routeCode.value.length === 6))
const hasPairingContext = computed(() => hasRelayPairingQuery.value || hasLocalPairingQuery.value)
const resolvedManualAgentUrl = computed(() => {
  const target = manualIp.value.trim()
  if (!target) return ''
  if (/^https?:\/\//i.test(target)) return normalizeBaseUrl(target)
  return normalizeBaseUrl(`${target}:${manualPort.value.trim()}`)
})
const resolvedLocalAgentUrl = computed(() => routeAgentUrl.value || resolvedManualAgentUrl.value)

const currentStageOrder = computed(() => setupStages.find(item => item.step === step.value)?.order ?? 0)
const stepLabel = computed(() => step.value === 35 ? '3.5' : String(step.value))
const activeRelaySessionId = computed(() => onboardingSession.value?.sessionId || routeSessionId.value)
const activeRelayBaseUrl = computed(() => onboardingSession.value?.relayUrl || routeRelayUrl.value)
const sessionModeLabel = computed(() => {
  if (bridge.mode.value === 'relay' && bridge.relaySessionId.value) return `Relay · ${bridge.relaySessionId.value}`
  if (onboardingSession.value?.sessionId) return `Onboarding · ${onboardingSession.value.sessionId}`
  if (bridge.mode.value === 'local' && bridge.activeUrl.value) return `Local · ${bridge.activeUrl.value}`
  if (hasRelayPairingQuery.value) return `Relay prêt · ${routeSessionId.value}`
  return 'Aucune session persistée'
})
const statusSummary = computed(() => {
  if (bridge.token.value) return 'Token stocké localement, prêt à reconnecter la session.'
  if (hasPairingContext.value) return 'Code de pairing déjà détecté dans l’URL.'
  return 'Setup visuel prêt, en attente du premier lien agent ↔ PWA.'
})
const waiterStatus = computed(() => hasPairingContext.value ? 'Signal d’extension détecté' : 'Préparation de la première connexion')
const pairingHint = computed(() => {
  if (onboardingSession.value?.sessionId) return `Session d’onboarding ${onboardingSession.value.sessionId} prête côté relay.`
  if (hasRelayPairingQuery.value) return `Mode relay prêt pour la session ${routeSessionId.value}.`
  if (hasLocalPairingQuery.value) return `L’URL agent ${routeAgentUrl.value} sera utilisée pour le pairing.`
  return 'Si aucun QR n’est disponible, saisis simplement le code à 6 chiffres puis utilise IP/port.'
})
const finalStatus = computed(() => {
  if (bridge.mode.value === 'relay' && bridge.relaySessionId.value) {
    return `Relay lié sur ${bridge.relaySessionId.value}. Le token mobile est présent en localStorage.`
  }
  if (bridge.mode.value === 'local' && bridge.activeUrl.value) {
    return `Connexion locale active sur ${bridge.activeUrl.value}.`
  }
  return 'Le flux UI est prêt, mais la persistance compte + relay doit encore être branchée côté backend.'
})

const pairingUrl = computed(() => {
  const normalizedCode = pairCode.value.trim()
  if (!normalizedCode || normalizedCode.length !== 6) return ''

  const base = import.meta.client
    ? window.location.origin
    : String(config.public.uiUrl || '').trim() || 'http://localhost:3000'
  const url = new URL('/', base)

  if (activeRelaySessionId.value && activeRelayBaseUrl.value) {
    url.searchParams.set('relay', '1')
    url.searchParams.set('relayUrl', activeRelayBaseUrl.value)
    url.searchParams.set('sessionId', activeRelaySessionId.value)
    url.searchParams.set('code', normalizedCode)
    return url.toString()
  }

  if (resolvedLocalAgentUrl.value) {
    url.searchParams.set('view', 'mobile')
    url.searchParams.set('agentUrl', resolvedLocalAgentUrl.value)
    url.searchParams.set('code', normalizedCode)
    return url.toString()
  }

  return ''
})

const pairingQrDataUrl = computed(() => {
  if (!pairingUrl.value) return ''
  const svg = renderSVG(pairingUrl.value, {
    border: 1,
    ecc: 'M',
    pixelSize: 9,
    whiteColor: '#ffffff',
    blackColor: '#111111',
  })
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
})

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, '')
  return `http://${trimmed}`.replace(/\/+$/, '')
}

function clearWaiterTimers() {
  if (waiterProgressTimer) clearInterval(waiterProgressTimer)
  if (waiterMessageTimer) clearInterval(waiterMessageTimer)
  if (waiterAdvanceTimer) clearTimeout(waiterAdvanceTimer)
  if (onboardingStatusTimer) clearInterval(onboardingStatusTimer)
  waiterProgressTimer = null
  waiterMessageTimer = null
  waiterAdvanceTimer = null
  onboardingStatusTimer = null
}

async function fetchOnboardingStatus() {
  if (!onboardingSession.value?.setupToken || !onboardingSession.value.relayUrl) return
  try {
    const res = await fetch(`${onboardingSession.value.relayUrl}/api/onboarding/agent-status`, {
      headers: { Authorization: `Bearer ${onboardingSession.value.setupToken}` },
    })
    if (!res.ok) return
    const data = await res.json() as Partial<OnboardingSessionState>
    onboardingSession.value = {
      ...onboardingSession.value,
      pairingCode: typeof data.pairingCode === 'string' ? data.pairingCode : onboardingSession.value.pairingCode,
      status: (typeof data.status === 'string' ? data.status : onboardingSession.value.status) as OnboardingSessionState['status'],
      agentConnected: Boolean(data.agentConnected),
      mobileConnected: Boolean(data.mobileConnected),
      qrUrl: typeof data.qrUrl === 'string' ? data.qrUrl : onboardingSession.value.qrUrl,
    }
    if (onboardingSession.value.pairingCode.length === 6) {
      pairCode.value = onboardingSession.value.pairingCode
    }
    if (step.value === 3 && onboardingSession.value.agentConnected) {
      clearWaiterTimers()
      step.value = 35
    }
  } catch {
    // ignore transient onboarding polling failures
  }
}

async function createOnboardingSession() {
  const relayBaseUrl = routeRelayUrl.value
  if (!relayBaseUrl || onboardingSession.value?.setupToken) return
  onboardingBusy.value = true
  try {
    const res = await fetch(`${relayBaseUrl}/api/onboarding/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: email.value.trim() || provider.value,
      }),
    })
    if (!res.ok) return
    const data = await res.json() as Omit<OnboardingSessionState, 'status' | 'agentConnected' | 'mobileConnected'> & Partial<OnboardingSessionState>
    onboardingSession.value = {
      sessionId: String(data.sessionId ?? ''),
      setupToken: String(data.setupToken ?? ''),
      pairingCode: String(data.pairingCode ?? ''),
      expiresAt: Number(data.expiresAt ?? Date.now()),
      relayUrl: String(data.relayUrl ?? relayBaseUrl),
      qrUrl: String(data.qrUrl ?? ''),
      vscodeUri: String(data.vscodeUri ?? ''),
      status: 'waiting',
      agentConnected: false,
      mobileConnected: false,
    }
    if (onboardingSession.value.pairingCode.length === 6) {
      pairCode.value = onboardingSession.value.pairingCode
    }
  } finally {
    onboardingBusy.value = false
  }
}

function launchVsCodeOnboarding() {
  if (!import.meta.client || !onboardingSession.value?.vscodeUri) return
  window.location.assign(onboardingSession.value.vscodeUri)
}

function startWaiter() {
  clearWaiterTimers()
  step.value = 3
  waiterProgress.value = hasPairingContext.value || onboardingSession.value ? 62 : 14
  waiterMessageIndex.value = 0

  waiterProgressTimer = setInterval(() => {
    waiterProgress.value = Math.min(waiterProgress.value + (hasPairingContext.value ? 6 : 4), 94)
  }, 500)

  waiterMessageTimer = setInterval(() => {
    waiterMessageIndex.value = (waiterMessageIndex.value + 1) % waiterFacts.length
  }, 1600)

  if (onboardingSession.value?.setupToken) {
    void fetchOnboardingStatus()
    onboardingStatusTimer = setInterval(() => {
      void fetchOnboardingStatus()
    }, 3_000)
  }

  waiterAdvanceTimer = setTimeout(() => {
    if (onboardingSession.value?.agentConnected) {
      clearWaiterTimers()
      step.value = 35
      return
    }
    clearWaiterTimers()
    if (routeCode.value.length === 6) pairCode.value = routeCode.value
    if (onboardingSession.value?.pairingCode.length === 6) pairCode.value = onboardingSession.value.pairingCode
    step.value = 35
  }, hasPairingContext.value || onboardingSession.value ? 2200 : 3400)
}

function selectProvider(nextProvider: AuthProvider) {
  provider.value = nextProvider
}

function submitAuth() {
  if (provider.value === 'email' && !email.value.trim()) return
  if (import.meta.client) {
    localStorage.setItem('vb:onboarding-auth', JSON.stringify({
      authMode: authMode.value,
      provider: provider.value,
      email: email.value.trim(),
    }))
  }
  step.value = 2
}

async function startInstallFlow(target?: 'marketplace' | 'vsix') {
  if (!hasPairingContext.value) {
    await createOnboardingSession()
  }
  startWaiter()
  if (!import.meta.client || !target) return
  const href = target === 'marketplace' ? marketplaceHref : vsixGuideHref
  window.open(href, target === 'marketplace' ? '_self' : '_blank', target === 'marketplace' ? undefined : 'noopener,noreferrer')
}

async function completePairing() {
  pairError.value = ''
  pairing.value = true

  let ok = false
  if (activeRelaySessionId.value && activeRelayBaseUrl.value) {
    ok = await bridge.pairRelay(activeRelayBaseUrl.value, activeRelaySessionId.value, pairCode.value.trim())
  } else if (resolvedLocalAgentUrl.value) {
    ok = await bridge.pairAt(resolvedLocalAgentUrl.value, pairCode.value.trim())
  } else {
    ok = await bridge.pair(manualIp.value.trim(), manualPort.value.trim(), pairCode.value.trim())
  }

  pairing.value = false

  if (!ok) {
    pairError.value = 'Connexion impossible. Vérifie le code, puis régénère-le depuis VS Code si besoin.'
    return
  }

  await bridge.fetchAgentStatus()
  step.value = 4
}

watch(step, (nextStep) => {
  if (nextStep !== 3) clearWaiterTimers()
})

onMounted(() => {
  const hasToken = Boolean(localStorage.getItem('vb:token'))
  if (hasToken && !route.query.setup) {
    navigateTo('/')
    return
  }

  const savedAuth = localStorage.getItem('vb:onboarding-auth')
  if (savedAuth) {
    try {
      const parsed = JSON.parse(savedAuth) as { authMode?: AuthMode; provider?: AuthProvider; email?: string }
      if (parsed.authMode === 'signin' || parsed.authMode === 'signup') authMode.value = parsed.authMode
      if (parsed.provider === 'github' || parsed.provider === 'gitlab' || parsed.provider === 'email') provider.value = parsed.provider
      if (typeof parsed.email === 'string') email.value = parsed.email
    } catch {
      // ignore malformed onboarding cache
    }
  }

  if (routeCode.value.length === 6) pairCode.value = routeCode.value
  if (hasPairingContext.value) {
    step.value = 35
    return
  }
  step.value = 0
})

onBeforeUnmount(() => {
  clearWaiterTimers()
})

useHead({ title: 'Phase 1 Setup — ViBridge' })
</script>
