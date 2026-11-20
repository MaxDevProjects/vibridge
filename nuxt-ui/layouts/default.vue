<template>
  <div class="min-h-screen bg-bg text-text flex flex-col vb-shell" :class="colorMode.value">
    <div class="absolute inset-0 vb-grid opacity-30 pointer-events-none" />

    <!-- ── Global top bar ─────────────────────── -->
    <header
      v-if="!isMobileConversation && !isPairingDisplay"
      class="fixed top-0 left-0 right-0 h-14 z-50 flex items-center justify-between px-4 sm:px-6"
      style="background:color-mix(in srgb, var(--bg) 88%, transparent);border-bottom:1px solid var(--border);backdrop-filter:blur(12px)"
    >
      <div class="flex items-center gap-3">
        <NuxtLink to="/" class="font-display text-xs sm:text-sm tracking-[0.28em] uppercase text-text">ViBridge</NuxtLink>
        <span
          class="hidden sm:inline-flex text-[9px] tracking-[0.18em] uppercase px-2 py-1"
          style="border:1px solid var(--border);background:var(--accent-soft);color:var(--text-mid)"
        >
          {{ isSetupRoute ? 'Phase 1 Setup' : 'Workspace Relay' }}
        </span>
      </div>

      <div class="flex items-center gap-2 sm:gap-4">
        <!-- View toggle (desktop only) -->
        <div v-if="!isSetupRoute" class="hidden lg:flex" style="border:1px solid var(--border)">
          <button
            v-for="v in views"
            :key="v.id"
            class="text-[10px] tracking-[0.15em] uppercase px-3.5 py-1.5 transition-colors"
            :style="activeView === v.id
              ? 'background:var(--text);color:var(--bg)'
              : 'background:none;color:var(--muted);border-right:1px solid var(--border)'"
            :class="v.id === 'mobile' ? '!border-r-0' : ''"
            @click="setView(v.id)"
          >{{ v.label }}</button>
        </div>

        <!-- Theme toggle -->
        <button
          class="text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 transition-colors"
          style="border:1px solid var(--border-bright);background:color-mix(in srgb, var(--surface) 82%, transparent);color:var(--text-mid)"
          @click="toggleColorMode"
        >
          {{ colorMode.value === 'dark' ? 'Light' : 'Dark' }}
        </button>

        <!-- Settings link -->
        <NuxtLink
          to="/settings"
          class="text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 transition-colors"
          style="border:1px solid var(--border-bright);background:color-mix(in srgb, var(--surface) 82%, transparent);color:var(--text-mid)"
          title="Paramètres réseau"
        >⚙</NuxtLink>
      </div>
    </header>

    <div class="vb-notification-actions" :class="{'vb-notification-actions-mobile':isMobileConversation}">
      <button type="button" class="vb-notification-bell" :aria-label="'Notifications (' + notificationHistory.length + ')'"
        :aria-expanded="notificationOpen" @click="notificationOpen=!notificationOpen;toast=null">
        <span aria-hidden="true">🔔</span>
        <span v-if="unreadNotifications" class="vb-notification-count">{{ unreadNotifications > 9 ? '9+' : unreadNotifications }}</span>
      </button>
    </div>
    <Transition name="vb-toast">
      <div v-if="toast && !notificationOpen" :key="toast.id" class="vb-small-toast"
        :class="toast.status==='error'?'vb-small-toast-error':toast.status==='attention'?'vb-small-toast-warning':'vb-small-toast-info'" role="status">
        <span class="vb-toast-indicator" aria-hidden="true">{{ toast.status==='error'?'!':toast.status==='attention'?'?':'✓' }}</span>
        <span class="vb-toast-text">{{ toast.text }}</span>
        <button type="button" aria-label="Masquer la notification" @click="toast=null">×</button>
      </div>
    </Transition>
    <section v-if="notificationOpen" class="vb-notification-inbox" aria-label="Centre de notifications">
      <header>
        <strong>Notifications</strong>
        <button type="button" aria-label="Fermer les notifications" @click="notificationOpen=false">×</button>
      </header>
      <div v-if="!notificationHistory.length" class="vb-notification-empty">Aucune notification récente.</div>
      <ol v-else>
        <li v-for="item in notificationHistory" :key="item.id">
          <span :class="item.status==='error'?'vb-notice-error':'vb-notice-ok'">{{ item.status==='error'?'!':item.status==='attention'?'?':'✓' }}</span>
          <div><p>{{ item.text }}</p><small>{{ new Date(item.at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) }}</small></div>
        </li>
      </ol>
      <button type="button" class="vb-notification-clear" @click="notificationHistory=[];unreadNotifications=0">Effacer l'historique</button>
    </section>

    <!-- Control permissions are enforced on the local agent, not in this UI. -->
    <div v-if="!isSetupRoute && !isPairingDisplay && bridge.agentStatus.value?.control && bridge.agentStatus.value.control.mode === 'observe' && !isMobileConversation"
      class="fixed left-4 right-4 bottom-4 z-40 p-3 text-xs"
      style="background:var(--surface);border:1px solid var(--border-bright);color:var(--text)"
      role="status">
      Mode observation : la machine refuse les commandes distantes. Autorise le contrôle dans la configuration locale de l'agent si nécessaire.
    </div>

    <!-- ── Content ──────────────────────────────── -->
    <main class="flex-1 overflow-hidden relative z-10" :class="isMobileConversation || isPairingDisplay ? '' : 'pt-14'">
      <slot :active-view="activeView" />
    </main>

  </div>
</template>

<script setup lang="ts">
const colorMode = useColorMode()
const activeView = useViewMode()
const route = useRoute()
const { notice } = useBridgeDeliveryNotice()
type DisplayNotice = { id:number; text:string; status:'received'|'error'|'attention'; at:number }
const toast=ref<DisplayNotice|null>(null)
const notificationOpen=ref(false)
const notificationHistory=ref<DisplayNotice[]>([])
const unreadNotifications=ref(0)
let toastDismissTimer:ReturnType<typeof setTimeout>|null=null
let pendingNoticeTimer:ReturnType<typeof setTimeout>|null=null

let sequence=0
watch(notice, value=>{
  if(toastDismissTimer)clearTimeout(toastDismissTimer)
  if(pendingNoticeTimer)clearTimeout(pendingNoticeTimer)
  if(!value || value.status==='pending'){toast.value=null;return}
  // An ACK is a receipt, not proof that the command succeeded.
  const duration=value.status==='error'?5500:2700
  const recent=notificationHistory.value.find(item=>item.text===value.text && Date.now()-item.at<20000)
  if(recent)return
  const item:DisplayNotice={id:++sequence,text:value.text.slice(0,190),status:value.status,at:Date.now()}
  notificationHistory.value=[item,...notificationHistory.value].slice(0,25)
  if(!notificationOpen.value)unreadNotifications.value=Math.min(25,unreadNotifications.value+1)
  // Non-error receipts appear after a short grace period so that chat isn't
  // interrupted for an ACK that arrives immediately.
  const show=()=>{if(!notificationOpen.value){toast.value=item;toastDismissTimer=setTimeout(()=>{if(toast.value?.id===item.id)toast.value=null},duration)}}
  if(item.status==='received')pendingNoticeTimer=setTimeout(show,450)
  else show()

})
watch(notificationOpen,open=>{if(open){unreadNotifications.value=0;toast.value=null}})
// Heuristic questions are an information signal only; the host delays them.
// Keep them in the same inbox as delivery notices, never as approval cards.
let stopNotifications:(()=>void)|null=null
onMounted(()=>{
 stopNotifications=bridge.onMessage(message=>{
  if(message.type!=='notification'||message.isQuestion!==true)return
  const raw=typeof message.text==='string'?message.text:'Intervention peut-être nécessaire'
  const text=raw.slice(0,140)
  if(notificationHistory.value.some(item=>item.text===text&&Date.now()-item.at<300000))return
  const item:DisplayNotice={id:++sequence,text,status:'attention',at:Date.now()}
  notificationHistory.value=[item,...notificationHistory.value].slice(0,25)
  if(notificationOpen.value)return
  unreadNotifications.value=Math.min(25,unreadNotifications.value+1)
  toast.value=item
  if(toastDismissTimer)clearTimeout(toastDismissTimer)
  toastDismissTimer=setTimeout(()=>{if(toast.value?.id===item.id)toast.value=null},5500)
 })
})

onUnmounted(()=>{stopNotifications?.();if(toastDismissTimer)clearTimeout(toastDismissTimer);if(pendingNoticeTimer)clearTimeout(pendingNoticeTimer)})
const bridge = useDevBridge()

const views = [
  { id: 'both' as const,   label: 'Both' },
  { id: 'pc' as const,     label: 'PC' },
  { id: 'mobile' as const, label: 'Mobile' },
]

const isSetupRoute = computed(() => route.path.startsWith('/setup'))
const isMobileConversation = computed(() => route.path === '/mobile')
const isPairingDisplay = computed(() => route.path === '/pairing/display')

function setView(v: 'both' | 'pc' | 'mobile') {
  activeView.value = v
}

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<style scoped>
.vb-notification-actions{position:fixed;top:66px;right:14px;z-index:58}
.vb-notification-actions-mobile{top:calc(16px + env(safe-area-inset-top));right:70px}
.vb-notification-bell{width:37px;height:37px;display:grid;place-items:center;position:relative;border:1px solid var(--border-bright);background:var(--surface);color:var(--text);font-size:22px;box-shadow:0 3px 15px rgba(0,0,0,.18)}
.vb-notification-bell:focus-visible,.vb-small-toast button:focus-visible,.vb-notification-inbox button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.vb-notification-count{position:absolute;right:-5px;top:-7px;background:var(--dot-amber);border-radius:50%;color:var(--bg);font:600 10px/17px monospace;min-width:17px;padding:0 3px}
.vb-small-toast{position:fixed;right:12px;top:calc(64px + env(safe-area-inset-top));z-index:56;width:min(306px,calc(100vw - 24px));display:flex;gap:10px;align-items:flex-start;padding:11px 12px;background:color-mix(in srgb,var(--surface) 88%,white 12%);border:1px solid var(--border-bright);border-left:3px solid var(--accent);box-shadow:0 9px 28px rgba(0,0,0,.3);color:var(--text);font:11px/1.5 "DM Mono",monospace}
.vb-small-toast-error{border-left-color:var(--dot-red)}
.vb-small-toast-info{border-left-color:var(--dot-green)}
.vb-small-toast-warning{border-left-color:var(--dot-amber)}
.vb-small-toast-warning .vb-toast-indicator{color:var(--dot-amber)}
.vb-toast-indicator{font-weight:700;color:var(--accent)}
.vb-small-toast-error .vb-toast-indicator{color:var(--dot-red)}
.vb-toast-text{flex:1;min-width:0;overflow-wrap:anywhere}
.vb-small-toast button{color:var(--text-mid);font-size:16px;line-height:1}
.vb-toast-enter-active,.vb-toast-leave-active{transition:transform 200ms ease,opacity 200ms ease}
.vb-toast-enter-from,.vb-toast-leave-to{transform:translateX(32px);opacity:0}
.vb-notification-inbox{position:fixed;top:calc(60px + env(safe-area-inset-top));right:12px;z-index:60;width:min(350px,calc(100vw - 24px));max-height:min(65dvh,460px);display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border-bright);box-shadow:0 12px 35px rgba(0,0,0,.3);color:var(--text)}
.vb-notification-inbox header{display:flex;justify-content:space-between;align-items:center;padding:13px;border-bottom:1px solid var(--border)}
.vb-notification-inbox header strong{font:500 12px "DM Mono",monospace}
.vb-notification-inbox header button{font-size:20px}
.vb-notification-inbox ol{list-style:none;overflow-y:auto;margin:0;padding:0}
.vb-notification-inbox li{display:flex;gap:10px;padding:12px 13px;border-bottom:1px solid var(--border);font:11px/1.6 "DM Mono",monospace}
.vb-notification-inbox li p{margin:0;overflow-wrap:anywhere}
.vb-notification-inbox li small{font-size:9px;color:var(--text-mid)}
.vb-notice-error{color:var(--dot-red)}.vb-notice-ok{color:var(--dot-green)}
.vb-notification-empty{padding:18px;font:11px monospace;color:var(--text-mid)}
.vb-notification-clear{padding:11px 13px;border-top:1px solid var(--border);text-align:left;font-size:10px;color:var(--text-mid)}
@media(prefers-reduced-motion:reduce){.vb-toast-enter-active,.vb-toast-leave-active{transition:none}}
</style>
