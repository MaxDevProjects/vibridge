<template>
  <div class="min-h-dvh flex items-center justify-center px-4 py-10 sm:px-6">
    <section class="vb-panel vb-panel-strong w-full max-w-lg p-6 sm:p-9 text-center">
      <div class="mb-6 text-[10px] uppercase tracking-[0.3em]" style="color:var(--accent)">
        ViBridge / Connexion mobile
      </div>
      <h1 class="font-display text-2xl font-light leading-snug sm:text-3xl">
        Ton espace de travail, sur ton téléphone.
      </h1>
      <p class="mt-4 text-[13px] leading-6" style="color:var(--text-mid)">
        Scanne ce code avec l'appareil à connecter. Cette page affiche l'invitation sans l'utiliser : l'appairage se fait sur le téléphone.
      </p>

      <ClientOnly>
        <div v-if="qrDataUrl" class="mt-7">
          <div class="mx-auto w-fit bg-white p-4 sm:p-5">
            <img :src="qrDataUrl" alt="QR code pour connecter ViBridge sur un téléphone" class="block h-56 w-56 sm:h-64 sm:w-64" />
          </div>
          <p class="mt-4 text-[11px] uppercase tracking-[0.14em]" style="color:var(--text-mid)">
            {{ isRelay ? 'Connexion à distance via le relais' : 'Connexion locale (même réseau)' }}
          </p>
          <p v-if="pairingCode" class="mt-2 font-mono text-sm tracking-[0.2em]">
            Code : {{ pairingCode }}
          </p>
          <div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button type="button" class="vb-button vb-button-primary text-[11px]" @click="copyInvitation">
              {{ copied ? 'Lien copié' : 'Copier le lien' }}
            </button>
            <button type="button" class="vb-button text-[11px]" @click="closeDisplay">
              Fermer
            </button>
          </div>
          <p class="mt-5 text-[11px] leading-5" style="color:var(--muted)">
            Une invitation est temporaire. Pour un nouveau QR, relance « DevBridge: Show QR » dans VS Code.
            Un téléphone déjà appairé n'a pas besoin d'être reconnecté à chaque ouverture.
          </p>
        </div>
        <div v-else class="mt-7 px-4 py-6 text-sm" style="border:1px solid var(--border-bright);color:var(--text-mid)" role="alert">
          {{ error || 'Aucune invitation disponible. Ouvre cette page depuis la commande QR de VS Code.' }}
        </div>
      </ClientOnly>
    </section>
  </div>
</template>

<script setup lang="ts">
import { renderSVG } from 'uqr'

const invitation = ref('')
const error = ref('')
const copied = ref(false)

const parsedInvitation = computed(() => {
  if (!invitation.value) return null
  try {
    return new URL(invitation.value)
  } catch {
    return null
  }
})
const pairingCode = computed(() => parsedInvitation.value?.searchParams.get('code') || '')
const isRelay = computed(() => parsedInvitation.value?.searchParams.get('relay') === '1')
const qrDataUrl = computed(() => {
  if (!invitation.value) return ''
  try {
    const svg = renderSVG(invitation.value, { border: 2, ecc: 'M', pixelSize: 8 })
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  } catch {
    return ''
  }
})

onMounted(() => {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const candidate = fragment.get('invite') || ''

  // Never keep the one-time invitation visible in browser history or the URL.
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)

  try {
    if (!candidate || candidate.length > 4096) throw new Error('missing invitation')
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin) {
      throw new Error('invalid invitation origin')
    }
    const relay = url.searchParams.get('relay') === '1'
    const validRelay = relay
      && Boolean(url.searchParams.get('sessionId'))
      && /^\d{6}$/.test(url.searchParams.get('code') || '')
    const validLocal = !relay && Boolean(url.searchParams.get('token'))
    if (!validRelay && !validLocal) throw new Error('invalid invitation')
    invitation.value = url.toString()
  } catch {
    error.value = 'Invitation absente ou invalide. Génère un nouveau QR depuis VS Code.'
  }
})

async function copyInvitation() {
  if (!invitation.value) return
  try {
    await navigator.clipboard.writeText(invitation.value)
    copied.value = true
  } catch {
    error.value = 'Copie impossible : utilise le QR code.'
  }
}

function closeDisplay() {
  window.close()
  // Browsers may disallow closing a tab not created by window.open.
}
</script>
