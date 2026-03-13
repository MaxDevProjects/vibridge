<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()
const { config: netConfig } = useNetworkConfig()

onMounted(() => {
  // Extract ?agentUrl= from QR scan → pre-fill manual IP in network config
  const agentUrlParam = route.query.agentUrl as string | undefined
  if (agentUrlParam) {
    try {
      const parsed = new URL(agentUrlParam)
      netConfig.value.manualIp = parsed.hostname
      netConfig.value.manualPort = Number(parsed.port) || 3333
      if (netConfig.value.mode !== 'local') netConfig.value.mode = 'auto'
    } catch { /* invalid URL — ignore */ }
  }

  const qrToken = typeof route.query.token === 'string' ? route.query.token.trim() : ''
  const qrAgentUrl = typeof route.query.agentUrl === 'string' ? route.query.agentUrl.trim() : ''
  const qrWorkspace = typeof route.query.workspace === 'string' ? route.query.workspace.trim() : ''

  if (qrToken) {
    localStorage.setItem('vb:token', qrToken)
    if (qrWorkspace) {
      localStorage.setItem('vb:lastWorkspace', qrWorkspace)
    }
    if (qrAgentUrl) {
      localStorage.setItem('vb:bridgeMode', 'local')
      localStorage.setItem('vb:agentUrl', qrAgentUrl)
    } else {
      const relayBaseUrl = String(config.public.relayUrl ?? '').trim()
      localStorage.setItem('vb:bridgeMode', 'relay')
      if (relayBaseUrl) localStorage.setItem('vb:relayUrl', relayBaseUrl)
    }
    void router.replace({ path: '/', query: {} })
    return
  }

  // First launch: no stored session + not scanning a QR → redirect to onboarding
  const hasToken = Boolean(localStorage.getItem('vb:token'))
  const isSetup = route.path.startsWith('/setup') || route.path.startsWith('/settings')
  const relayFlag = typeof route.query.relay === 'string' ? route.query.relay.trim() : ''
  const relaySessionId = typeof route.query.sessionId === 'string' ? route.query.sessionId.trim() : ''
  const relayCode = typeof route.query.code === 'string' ? route.query.code.trim() : ''
  const hasRelayPairingQuery = relayFlag === '1' && Boolean(relaySessionId) && relayCode.length === 6
  const hasLocalPairingQuery = Boolean((qrAgentUrl || agentUrlParam) && relayCode.length === 6)
  const hasPendingPairingQuery = hasRelayPairingQuery || hasLocalPairingQuery
  if (hasToken && route.path.startsWith('/setup')) {
    void navigateTo('/')
    return
  }
  if (!hasToken && !isSetup && !hasPendingPairingQuery) {
    navigateTo('/setup')
  }
})
</script>
