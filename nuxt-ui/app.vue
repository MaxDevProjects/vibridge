<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
const route = useRoute()
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

  // First launch: no stored session + not scanning a QR → redirect to onboarding
  const hasToken = Boolean(localStorage.getItem('vb:token'))
  const hasQrToken = Boolean(route.query.token)
  const isSetup = route.path.startsWith('/setup') || route.path.startsWith('/settings')
  if (!hasToken && !hasQrToken && !isSetup) {
    navigateTo('/setup')
  }
})
</script>
