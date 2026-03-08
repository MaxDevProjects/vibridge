<template>
  <div class="flex overflow-hidden" style="height:calc(100dvh - 3rem)">

    <!-- ══════════ PC DASHBOARD (left) ══════════ -->
    <div
      v-show="view !== 'mobile'"
      class="flex-1 min-w-0 flex flex-col overflow-hidden"
      style="border-right:1px solid var(--border)"
    >
      <!-- Header -->
      <div class="px-10 py-8 shrink-0" style="border-bottom:1px solid var(--border)">
        <h1 class="font-display font-light text-3xl tracking-tight">Dashboard</h1>
        <p class="text-[11px] mt-1 tracking-widest" style="color:var(--muted)">
          {{ agentHost }} · port {{ agentPort }} · {{ transportLabel }}
        </p>
      </div>

      <!-- Stat row -->
      <div class="grid grid-cols-3 shrink-0" style="border-bottom:1px solid var(--border)">
        <div
          v-for="(stat, i) in stats" :key="stat.label"
          class="px-8 py-6 transition-colors hover:bg-surface"
          :style="i < 2 ? 'border-right:1px solid var(--border)' : ''"
        >
          <p class="text-[9px] tracking-[0.2em] uppercase mb-2.5" style="color:var(--muted)">{{ stat.label }}</p>
          <p class="font-display font-light text-[22px] tracking-tight" v-html="stat.value" />
          <p class="text-[10px] mt-1" style="color:var(--muted)">{{ stat.meta }}</p>
        </div>
      </div>

      <!-- 2×2 panels -->
      <div class="flex-1 overflow-y-auto grid grid-cols-2" style="align-content:start">

        <!-- Tools -->
        <div style="border-right:1px solid var(--border);border-bottom:1px solid var(--border)">
          <PanelHead title="Outils disponibles" action="Config" />
          <ToolRow
            v-for="t in tools" :key="t.id"
            :name="t.label" :type="t.type" :available="t.available" :reason="t.reason" :model-value="t.active"
            @update:model-value="toggleTool(t.id, $event)"
          />
        </div>

        <!-- Activity -->
        <div style="border-bottom:1px solid var(--border)">
          <PanelHead title="Activité récente" action="Effacer" @action="activity = []" />
          <div class="overflow-y-auto" style="max-height:280px">
            <div
              v-for="e in activity" :key="e.id"
              class="grid gap-3 px-7 py-3 transition-colors hover:bg-surface"
              style="grid-template-columns:auto 1fr auto;align-items:start;border-bottom:1px solid var(--border)"
            >
              <span class="text-[9px] pt-0.5 whitespace-nowrap" style="color:var(--muted)">{{ fmtTs(e.ts) }}</span>
              <span class="text-[11px]" style="line-height:1.5">{{ e.text }}</span>
              <span class="text-[8px] tracking-[0.15em] uppercase px-1.5 py-0.5 self-start whitespace-nowrap" style="border:1px solid var(--border);color:var(--muted)">{{ e.tag }}</span>
            </div>
            <p v-if="!activity.length" class="text-[11px] px-7 py-4" style="color:var(--muted)">— Aucune activité —</p>
          </div>
        </div>

        <!-- File tree -->
        <div style="border-right:1px solid var(--border)">
          <PanelHead title="Projet ouvert" action="Ouvrir" />
          <div class="overflow-y-auto" style="max-height:280px">
            <FileTree v-if="fileTree.length" :nodes="fileTree" @select="selectedFile = $event" />
            <p v-else class="text-[11px] px-7 py-4" style="color:var(--muted)">— Non connecté —</p>
          </div>
        </div>

        <!-- Network / pairing -->
        <div>
          <PanelHead title="Réseau & Pairing" action="Nouveau QR" @action="refreshPairing" />
          <div class="px-7">
            <NetRow label="Mode" :value="tunnelModeLabel" />
            <NetRow label="Adresse" :value="agentHost" mono />
            <NetRow label="Port" :value="String(agentPort)" mono />
            <NetRow v-if="uiTunnelUrl" label="URL UI" :value="uiTunnelUrl" mono />
            <NetRow v-if="pairAgentUrl" label="URL agent" :value="pairAgentUrl" mono />
            <NetRow v-if="currentPairingCode" label="Code" :value="currentPairingCode" mono />
            <NetRow label="Statut">
              <template #value>
                <span :style="`color:var(--dot-${statusColor})`" class="uppercase text-[11px]">{{ bridge.status.value }}</span>
              </template>
            </NetRow>
            <NetRow label="Tunnel" :value="transportLabel === 'Tunnel' ? 'Activé' : 'Désactivé'" />
          </div>
          <div v-if="uiTunnelUrl || pairAgentUrl" class="px-7 mt-3">
            <div class="grid grid-cols-2 gap-2">
              <button
                v-if="uiTunnelUrl"
                class="text-[10px] uppercase tracking-widest py-2 transition-colors"
                style="border:1px solid var(--border);color:var(--text);background:none"
                @click="openTunnel(uiTunnelUrl)"
              >
                Ouvrir UI
              </button>
              <button
                v-if="uiTunnelUrl"
                class="text-[10px] uppercase tracking-widest py-2 transition-colors"
                style="border:1px solid var(--border);color:var(--text);background:none"
                @click="copyText(uiTunnelUrl, 'URL UI tunnel copiée')"
              >
                Copier UI
              </button>
              <button
                v-if="pairAgentUrl"
                class="text-[10px] uppercase tracking-widest py-2 transition-colors"
                style="border:1px solid var(--border);color:var(--text);background:none"
                @click="openTunnel(pairAgentUrl)"
              >
                Ouvrir Agent
              </button>
              <button
                v-if="pairAgentUrl"
                class="text-[10px] uppercase tracking-widest py-2 transition-colors"
                style="border:1px solid var(--border);color:var(--text);background:none"
                @click="copyText(pairAgentUrl, 'URL agent tunnel copiée')"
              >
                Copier Agent
              </button>
            </div>
          </div>
          <ClientOnly>
            <div v-if="pairingQrSvg" class="px-7 mt-4">
            <div class="p-4 flex flex-col items-center gap-3" style="border:1px solid var(--border);background:var(--surface)">
              <button
                class="p-3 bg-white transition-transform hover:scale-[1.02]"
                style="border:1px solid var(--border-bright)"
                type="button"
                aria-label="Agrandir le QR code"
                @click="showQrModal = true"
              >
                <img :src="pairingQrDataUrl" alt="QR code de pairing" class="block w-40 h-40" />
              </button>
              <p class="text-[10px] text-center uppercase tracking-[0.14em]" style="color:var(--muted)">
                Scannez pour ouvrir l'UI mobile et lancer l'appairage
              </p>
              <div class="w-full flex gap-2">
                <button
                  class="flex-1 text-[10px] uppercase tracking-widest py-2 transition-colors"
                  style="border:1px solid var(--border);color:var(--text);background:none"
                  @click="showQrModal = true"
                >
                  Agrandir
                </button>
                <button
                  class="flex-1 text-[10px] uppercase tracking-widest py-2 transition-colors"
                  style="border:1px solid var(--border);color:var(--text);background:none"
                  @click="copyPairingLink"
                >
                  Copier le lien
                </button>
              </div>
            </div>
            <!-- mDNS fallback: show IP-based QR when local IP differs from agentHost -->
            <div v-if="fallbackQrDataUrl" class="px-7 mt-3">
              <div class="p-3 flex flex-col items-center gap-2" style="border:1px dashed var(--border);background:var(--surface)">
                <p class="text-[9px] uppercase tracking-[0.14em] text-center" style="color:var(--muted)">Fallback IP — si devbridge.local échoue</p>
                <img :src="fallbackQrDataUrl" alt="QR fallback IP" class="block w-28 h-28 bg-white p-1" />
                <p class="text-[9px] font-mono" style="color:var(--muted)">{{ localIpInfo?.ip }}:{{ agentPort }}</p>
              </div>
            </div>
            </div>
          </ClientOnly>
          <!-- Pair form -->
          <div v-if="bridge.status.value === 'disconnected' && !bridge.token.value" class="px-7 pb-6 mt-3 space-y-2">
            <input
              v-model="pairAgentUrl"
              placeholder="https://xyz.trycloudflare.com"
              class="w-full text-[11px] px-3 py-2 text-text outline-none"
              style="background:var(--surface);border:1px solid var(--border)"
            />
            <div class="flex gap-2">
              <input v-model="pairHost" placeholder="192.168.x.x" class="flex-1 text-[11px] px-3 py-2 text-text outline-none" style="background:var(--surface);border:1px solid var(--border)" />
              <input v-model="pairPort" placeholder="3333"         class="w-20 text-[11px] px-3 py-2 text-text outline-none" style="background:var(--surface);border:1px solid var(--border)" />
            </div>
            <input v-model="pairCode" placeholder="CODE D'APPAIRAGE" class="w-full text-[11px] px-3 py-2 text-text outline-none uppercase tracking-widest" style="background:var(--surface);border:1px solid var(--border)" />
            <button :disabled="pairing" class="w-full text-[10px] uppercase tracking-widest py-2 transition-colors disabled:opacity-40" style="border:1px solid var(--text);color:var(--text);background:none" @click="doPair">
              {{ pairing ? 'Connexion…' : 'Appairer' }}
            </button>
            <p v-if="pairError" class="text-[10px]" style="color:var(--dot-red)">{{ pairError }}</p>
          </div>
        </div>

      </div>
    </div>

    <!-- ══════════ MOBILE FRAME (right 375px) ══════════ -->
    <div
      v-show="view !== 'pc'"
      class="shrink-0 flex flex-col overflow-hidden"
      :style="view === 'mobile' ? 'flex:1;width:100%' : 'width:375px'"
      style="background:var(--bg)"
    >
      <!-- Phone status bar -->
      <div class="flex items-center justify-between px-5 shrink-0" style="height:44px;border-bottom:1px solid var(--border)">
        <span class="font-display font-normal text-[13px] tracking-[0.05em]">{{ clock }}</span>
        <div class="flex items-center gap-1.5 text-[11px]" style="color:var(--muted)">
          <span class="w-1.5 h-1.5 rounded-full inline-block" :style="`background:var(--dot-${statusColor})`"></span>
          <span>WiFi</span><span>●●●</span>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="flex shrink-0" style="border-bottom:1px solid var(--border)">
        <button
          v-for="(tab, i) in mobileTabs" :key="tab.id"
          class="flex-1 flex flex-col items-center py-3 gap-1 transition-colors"
          :style="[
            activeTab === tab.id ? 'border-bottom:2px solid var(--text)' : 'border-bottom:2px solid transparent',
            i < mobileTabs.length - 1 ? 'border-right:1px solid var(--border)' : '',
          ].join(';')"
          @click="activeTab = tab.id"
        >
          <span class="text-base leading-none">{{ tab.icon }}</span>
          <span class="text-[7px] tracking-[0.15em] uppercase" :style="activeTab === tab.id ? 'color:var(--text)' : 'color:var(--muted)'">{{ tab.label }}</span>
        </button>
      </div>

      <!-- Screens -->
      <div class="flex-1 overflow-hidden relative">

        <!-- HOME tab -->
        <div v-show="activeTab === 'home'" class="absolute inset-0 overflow-y-auto flex flex-col">
          <!-- Auth error banner -->
          <div v-if="bridge.authError.value" class="mx-4 mt-4 px-4 py-3 flex items-center justify-between" style="border:1px solid var(--dot-red);background:rgba(239,68,68,0.08)">
            <div class="flex items-center gap-2.5">
              <span class="w-1.5 h-1.5 rounded-full" style="background:var(--dot-red)"></span>
              <p class="text-[10px] uppercase tracking-[0.1em]" style="color:var(--dot-red)">QR expiré — scannez à nouveau</p>
            </div>
            <button class="text-[9px] uppercase tracking-[0.1em]" style="color:var(--dot-red)" @click="bridge.clearStoredSession()">Effacer</button>
          </div>

          <!-- Connection banner -->
          <div class="flex items-center justify-between mx-4 my-4 px-4 py-3" style="border:1px solid var(--border)">
            <div class="flex items-center gap-2.5">
              <span class="w-1.5 h-1.5 rounded-full" :style="`background:var(--dot-${statusColor})`"></span>
              <div>
                <p class="text-[10px] uppercase tracking-[0.1em]" style="color:var(--muted)">{{ bridge.status.value }}</p>
                <p class="text-[11px] mt-0.5">{{ activeProjectLabel }} · {{ activeToolLabel }}</p>
              </div>
            </div>
            <div class="text-right text-[9px]" style="color:var(--muted)">{{ latencyLabel }}<br><span class="text-[8px]">{{ transportLabel }}</span></div>
          </div>

          <!-- Notif cards -->
          <TransitionGroup name="notif" tag="div" class="px-4 space-y-3 mb-1">
            <NotifCard
              v-for="n in pendingNotifs" :key="n.id"
              :text="n.text" :tool="n.tool" :ts="n.ts"
              @validate="handleNotif(n.id, 'validate')"
              @refuse="handleNotif(n.id, 'refuse')"
              @ignore="removeNotif(n.id)"
            />
          </TransitionGroup>

          <!-- Quick actions -->
          <div class="px-4 mt-3">
            <p class="text-[8px] tracking-[0.25em] uppercase mb-2.5" style="color:var(--muted)">Actions rapides</p>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="qa in quickActions" :key="qa.label"
                class="flex flex-col gap-1.5 text-left px-3 py-3.5 text-[10px] uppercase tracking-[0.1em] transition-colors hover:bg-surface"
                style="border:1px solid var(--border);background:none;color:var(--text)"
                @click="qa.action?.()"
              >
                <span class="text-lg leading-none">{{ qa.icon }}</span>{{ qa.label }}
              </button>
            </div>
          </div>

          <!-- Active tools -->
          <div class="px-4 mt-4 mb-6">
            <p class="text-[8px] tracking-[0.25em] uppercase mb-2.5" style="color:var(--muted)">Outils actifs</p>
            <div style="border:1px solid var(--border)">
              <div
                v-for="(t, i) in tools" :key="t.id"
                class="flex items-center justify-between px-3.5 py-2.5 text-[11px]"
                :style="i < tools.length - 1 ? 'border-bottom:1px solid var(--border)' : ''"
              >
                <span class="flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full inline-block" :style="`background:var(--dot-${t.available ? (t.active ? 'green' : 'amber') : 'red'})`"></span>
                  {{ t.label }}
                </span>
                <span class="text-[9px] uppercase tracking-[0.1em]" style="color:var(--muted)">{{ t.available ? t.type : 'missing' }}</span>
              </div>
            </div>
          </div>

          <div v-if="uiTunnelUrl || pairAgentUrl" class="px-4 mb-6">
            <p class="text-[8px] tracking-[0.25em] uppercase mb-2.5" style="color:var(--muted)">Partager</p>
            <div class="space-y-2" style="border:1px solid var(--border)">
              <div v-if="uiTunnelUrl" class="px-3.5 py-3" style="border-bottom:1px solid var(--border)">
                <p class="text-[9px] uppercase tracking-[0.12em] mb-1" style="color:var(--muted)">UI tunnel</p>
                <p class="text-[10px] break-all" style="color:var(--text)">{{ uiTunnelUrl }}</p>
              </div>
              <div v-if="pairAgentUrl" class="px-3.5 py-3" :style="uiTunnelUrl ? 'border-bottom:1px solid var(--border)' : ''">
                <p class="text-[9px] uppercase tracking-[0.12em] mb-1" style="color:var(--muted)">Agent tunnel</p>
                <p class="text-[10px] break-all" style="color:var(--text)">{{ pairAgentUrl }}</p>
              </div>
              <div class="grid grid-cols-2 gap-px" style="background:var(--border)">
                <button
                  v-if="uiTunnelUrl"
                  class="text-[10px] uppercase tracking-[0.1em] py-2.5"
                  style="background:var(--bg);color:var(--text)"
                  @click="copyText(uiTunnelUrl, 'URL UI tunnel copiée')"
                >
                  Copier UI
                </button>
                <button
                  v-if="uiTunnelUrl"
                  class="text-[10px] uppercase tracking-[0.1em] py-2.5"
                  style="background:var(--bg);color:var(--text)"
                  @click="openTunnel(uiTunnelUrl)"
                >
                  Ouvrir UI
                </button>
                <button
                  v-if="pairAgentUrl"
                  class="text-[10px] uppercase tracking-[0.1em] py-2.5"
                  style="background:var(--bg);color:var(--text)"
                  @click="copyText(pairAgentUrl, 'URL agent tunnel copiée')"
                >
                  Copier Agent
                </button>
                <button
                  class="text-[10px] uppercase tracking-[0.1em] py-2.5"
                  style="background:var(--bg);color:var(--text)"
                  @click="refreshTunnelHint"
                >
                  Rafraîchir tunnel
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- CHAT tab -->
        <div v-show="activeTab === 'chat'" class="absolute inset-0 flex flex-col">
          <div ref="chatScroll" class="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            <ChatBubble v-for="m in chatMessages" :key="m.id" :text="m.text" :direction="m.direction" :tool="m.tool" :ts="m.ts" />
            <TypingIndicator v-if="aiTyping" />
          </div>
          <div class="shrink-0 p-3" style="border-top:1px solid var(--border);background:var(--bg)">
            <div class="text-[9px] uppercase tracking-[0.12em] mb-2" style="color:var(--muted)">
              Réponse vers {{ replyTargetLabel }}
            </div>
            <div class="flex gap-2 overflow-x-auto pb-2 mb-2">
              <button
                v-for="target in activeTargets"
                :key="target.id"
                class="shrink-0 text-[9px] uppercase tracking-[0.1em] px-2.5 py-1.5"
                :style="replyTarget === target.id ? 'border:1px solid var(--text);color:var(--text);background:var(--surface)' : 'border:1px solid var(--border);color:var(--muted);background:none'"
                @click="setReplyTarget(target.id, true)"
              >
                {{ target.label }} · {{ target.support }}
              </button>
            </div>
            <div class="flex gap-2 items-end">
            <button class="w-10 h-10 flex items-center justify-center text-base shrink-0" style="border:1px solid var(--border);color:var(--muted)">🎤</button>
            <button class="w-10 h-10 flex items-center justify-center text-base shrink-0" style="border:1px solid var(--border);color:var(--muted)">📎</button>
            <textarea
              v-model="chatDraft" :rows="1" placeholder="Nouvelle instruction…"
              class="flex-1 text-[12px] px-3.5 py-2.5 text-text outline-none resize-none"
              style="background:var(--surface);border:1px solid var(--border);max-height:120px;font-family:inherit"
              @keydown.enter.exact.prevent="sendChat"
            />
            <button class="w-10 h-10 flex items-center justify-center text-sm shrink-0" style="background:var(--text);color:var(--bg);border:1px solid var(--text)" @click="sendChat">↑</button>
            </div>
          </div>
        </div>

        <!-- CODE tab -->
        <div v-show="activeTab === 'code'" class="absolute inset-0 flex flex-col">
          <div class="flex shrink-0 mx-4 my-4" style="border:1px solid var(--border)">
            <input type="text" placeholder="Rechercher un fichier…" class="flex-1 text-[11px] px-3.5 py-2.5 outline-none text-text" style="background:none;border:none;font-family:inherit" />
            <button class="w-10 flex items-center justify-center text-sm" style="border-left:1px solid var(--border);color:var(--muted)">⌕</button>
          </div>
          <div class="flex-1 overflow-y-auto text-[11px]">
            <FileTree v-if="fileTree.length" :nodes="fileTree" @select="selectedFile = $event" />
            <p v-else class="px-5 py-4" style="color:var(--muted)">— Non connecté —</p>
          </div>
        </div>

        <!-- PREVIEW tab -->
        <div v-show="activeTab === 'preview'" class="absolute inset-0 flex flex-col">
          <div class="flex items-center justify-between px-4 py-3 shrink-0" style="border-bottom:1px solid var(--border)">
            <span class="text-[10px]" style="color:var(--muted);font-family:inherit">{{ previewUrlLabel }}</span>
            <div class="flex gap-1.5">
              <button class="text-[9px] px-2.5 py-1.5 uppercase tracking-[0.1em]" style="border:1px solid var(--border);background:none;color:var(--muted)" @click="reloadPreview">↺ Refresh</button>
              <a v-if="previewUrl" :href="previewUrl" target="_blank" rel="noreferrer" class="text-[9px] px-2.5 py-1.5 uppercase tracking-[0.1em]" style="border:1px solid var(--border);background:none;color:var(--muted)">⊞ Open</a>
            </div>
          </div>
          <div class="flex-1 p-4 flex flex-col" style="background:var(--surface)">
            <div class="flex-1 flex flex-col">
              <div class="flex items-center gap-1.5 px-3 py-2 shrink-0" style="background:var(--surface2);border:1px solid var(--border)">
                <div v-for="c in 3" :key="c" class="w-2 h-2 rounded-full" style="background:var(--border-bright)"></div>
                <span class="text-[10px] ml-2" style="color:var(--muted)">{{ activeProjectLabel }}</span>
              </div>
              <div v-if="previewUrl" class="flex-1" style="border:1px solid var(--border);border-top:none">
                <iframe
                  ref="previewFrame"
                  :src="previewUrl"
                  class="w-full h-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              </div>
              <div v-else class="flex-1 flex items-center justify-center text-[10px] uppercase tracking-[0.15em]" style="border:1px solid var(--border);border-top:none;color:var(--muted)">
                — Aucune preview détectée —
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <ClientOnly>
    <div
      v-if="showQrModal && pairingQrSvg"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      style="background:rgba(10,10,10,0.8);backdrop-filter:blur(8px)"
      @click.self="showQrModal = false"
    >
      <div class="w-full max-w-[32rem] p-6" style="border:1px solid var(--border-bright);background:var(--bg)">
        <div class="flex items-start justify-between gap-4 mb-5">
          <div>
            <p class="text-[10px] uppercase tracking-[0.2em]" style="color:var(--muted)">Pairing QR</p>
            <p class="text-sm mt-1">Scannez depuis le mobile pour ouvrir l'UI et lancer l'appairage.</p>
          </div>
          <button
            class="shrink-0 w-9 h-9 text-sm"
            style="border:1px solid var(--border);color:var(--text);background:none"
            type="button"
            aria-label="Fermer la modale QR"
            @click="showQrModal = false"
          >
            ✕
          </button>
        </div>

        <div class="flex justify-center">
          <div class="p-5 bg-white" style="border:1px solid var(--border-bright)">
            <img :src="pairingQrDataUrlLarge" alt="QR code de pairing agrandi" class="block w-[22rem] max-w-full h-auto" />
          </div>
        </div>

        <div class="mt-5 pt-4 text-[11px] space-y-2" style="border-top:1px solid var(--border)">
          <p style="color:var(--muted)">Adresse: <span style="color:var(--text)">{{ pairHost }}:{{ pairPort }}</span></p>
          <p style="color:var(--muted)">Code: <span style="color:var(--text)">{{ currentPairingCode }}</span></p>
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { renderSVG } from 'uqr'
import type { ActivityEntry } from '~/components/ActivityFeed.vue'
import type { FileNode } from '~/components/FileTree.vue'
import type { WsMessage } from '~/composables/useDevBridge'

const bridge    = useDevBridge()
const view      = useViewMode()
const config    = useRuntimeConfig()
const route     = useRoute()
const router    = useRouter()
const clientReady = ref(false)
const resolvedAgentHost = ref(String(config.public.agentHost))
const publicUiHost = ref(String(config.public.agentHost))

const agentHost = computed(() => {
  if (pairAgentUrl.value) return pairAgentUrl.value
  return resolvedAgentHost.value
})
const agentPort = config.public.agentPort
const uiTunnelUrl = computed(() => normalizeBaseUrl(String(config.public.uiUrl ?? '')))
const configuredRelayUrl = computed(() => normalizeBaseUrl(String(config.public.relayUrl ?? '')))
const relayState = computed(() => bridge.agentStatus.value?.relay ?? null)
const isQuickTunnel = computed(() => {
  const url = uiTunnelUrl.value || pairAgentUrl.value
  return /trycloudflare\.com/i.test(url)
})

const statusColor = computed(() => ({ connected: 'green', connecting: 'amber', disconnected: 'red' }[bridge.status.value]))

// Clock
const clock = ref('')
onMounted(() => {
  const tick = () => {
    const d = new Date()
    clock.value = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
  }
  tick()
  setInterval(tick, 10_000)
})

function fmtTs(ts: number) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

function shortText(value: string, max = 90) {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

function lastPathSegment(value: string) {
  return value.split(/[\\/]/).filter(Boolean).pop() ?? value
}

function stripAnsi(value: string) {
  return value
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    .replace(/[\u0000-\u0008\u000B-\u001A\u001C-\u001F\u007F]/g, '')
}

// Stats
const stats = computed(() => [
  { label: 'Statut',        value: `<span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--dot-${statusColor.value})"></span>${bridge.status.value}</span>`, meta: transportLabel.value },
  { label: 'Projet actif',  value: `<span style="font-size:16px">${activeProjectLabel.value}</span>`, meta: projectRootLabel.value },
  { label: 'Adapters',      value: `${tools.value.length}<span style="font-size:14px;font-weight:200"> online</span>`, meta: activeToolLabel.value },
])

interface Tool { id: string; label: string; type: string; active: boolean; available: boolean; reason: string | null }
const tools = computed<Tool[]>(() => (bridge.agentStatus.value?.adapters ?? []).map((adapter) => ({
  id: adapter.id,
  label: adapter.label,
  type: adapter.id.includes('cli') ? 'Terminal' : 'VS Code',
  active: adapter.active,
  available: adapter.available !== false,
  reason: typeof adapter.reason === 'string' ? adapter.reason : null,
})))
const ideState = computed(() => bridge.agentStatus.value?.ideState ?? null)
const activeTool = computed(() => tools.value.find(t => t.active) ?? null)
const activeToolLabel = computed(() => activeTool.value?.label ?? '—')
const activeProjectLabel = computed(() => {
  const workspace = Array.isArray(ideState.value?.workspaceFolders) ? ideState.value?.workspaceFolders[0] : ''
  if (workspace) return shortText(lastPathSegment(String(workspace)), 26)
  if (previewUrl.value) return shortText(new URL(previewUrl.value).hostname, 26)
  return 'Bridge idle'
})
const projectRootLabel = computed(() => {
  const activeFile = ideState.value?.activeFile
  if (typeof activeFile === 'string' && activeFile) return shortText(activeFile, 42)
  return fileTree.value.length ? '/workspace' : 'No files loaded'
})
const transportLabel = computed(() => {
  if (bridge.mode.value === 'relay') return 'Relay'
  return currentAgentBaseUrl().startsWith('https://') ? 'Tunnel' : 'WiFi'
})
const tunnelModeLabel = computed(() => {
  if (transportLabel.value === 'Relay') return 'Relay cloud'
  if (transportLabel.value !== 'Tunnel') return 'WiFi local'
  return isQuickTunnel.value ? 'Quick Tunnel' : 'Tunnel Cloudflare stable'
})
const latencyLabel = computed(() => bridge.agentStatus.value ? `${Math.max(1, Math.round((Date.now() - bridge.agentStatus.value.timestamp) / 1000))}s` : '—')

function toggleTool(id: string, val: boolean) {
  const tool = tools.value.find((item) => item.id === id)
  if (val && tool?.available) {
    bridge.send({ type: 'adapter_toggle', id, active: true })
    void bridge.fetchAgentStatus()
  }
}

// Activity feed
const activity = ref<ActivityEntry[]>([])

function pushActivity(tag: ActivityEntry['tag'], text: string) {
  activity.value.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ts: Date.now(), tag, text })
  activity.value = activity.value.slice(0, 120)
}

// File tree
const fileTree = ref<FileNode[]>([])
const selectedFile = ref<string | null>(null)
const previewUrl = ref('')
const previewFrame = ref<HTMLIFrameElement | null>(null)
const previewUrlLabel = computed(() => previewUrl.value ? shortText(previewUrl.value, 42) : 'No preview URL')
const actionBusy = ref<Record<string, boolean>>({})

// Pairing
const pairHost  = ref(String(config.public.agentHost))
const pairPort  = ref(String(config.public.agentPort))
const pairAgentUrl = ref('')
const relaySessionId = ref('')
const relayPairingCode = ref('')
const pairCode  = ref('')
const pairing   = ref(false)
const pairError = ref('')
const currentPairingCode = ref('')
const showQrModal = ref(false)

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

const pairingUrl = computed(() => {
  const relaySession = relayState.value
  const effectiveCode = relaySession?.pairingCode || currentPairingCode.value
  if (!clientReady.value || (!effectiveCode && !preIssuedToken.value)) return ''
  const agentBaseUrl = pairAgentUrl.value || currentAgentBaseUrl()
  const base = uiTunnelUrl.value || window.location.href
  const url = new URL(base)
  if (!uiTunnelUrl.value) {
    url.hostname = publicUiHost.value
    url.port = window.location.port
    url.pathname = window.location.pathname
  }
  url.search = ''
  url.hash = ''
  url.searchParams.set('view', 'mobile')
  if (relaySession?.sessionId && configuredRelayUrl.value) {
    url.searchParams.set('relay', '1')
    url.searchParams.set('relayUrl', configuredRelayUrl.value)
    url.searchParams.set('sessionId', relaySession.sessionId)
    url.searchParams.set('code', relaySession.pairingCode)
  } else if (preIssuedToken.value) {
    // Auto-pair path: pre-issued JWT — no code entry needed on mobile
    url.searchParams.set('agentUrl', agentBaseUrl)
    url.searchParams.set('token', preIssuedToken.value)
  } else {
    url.searchParams.set('host', pairHost.value)
    url.searchParams.set('port', pairPort.value)
    url.searchParams.set('code', effectiveCode)
    if (agentBaseUrl) {
      url.searchParams.set('agentUrl', agentBaseUrl)
    }
  }
  return url.toString()
})

const pairingQrSvg = computed(() => {
  if (!pairingUrl.value) return ''
  return renderSVG(pairingUrl.value, {
    border: 1,
    ecc: 'M',
    pixelSize: 7,
    whiteColor: '#ffffff',
    blackColor: '#111111',
  })
})

const pairingQrDataUrl = computed(() => {
  if (!pairingQrSvg.value) return ''
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pairingQrSvg.value)}`
})

// Fallback QR — same URL but host replaced by raw LAN IP
const fallbackQrDataUrl = computed(() => {
  if (!clientReady.value || !localIpInfo.value || !preIssuedToken.value) return ''
  const uiPort = import.meta.client ? (window.location.port || '8080') : '8080'
  const fallbackUrl = `http://${localIpInfo.value.ip}:${uiPort}/?view=mobile&agentUrl=${encodeURIComponent(localIpInfo.value.agentUrl)}&token=${encodeURIComponent(preIssuedToken.value)}`
  const svg = renderSVG(fallbackUrl, { border: 1, ecc: 'M', pixelSize: 5, whiteColor: '#ffffff', blackColor: '#111111' })
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
})

const pairingQrSvgLarge = computed(() => {
  if (!pairingUrl.value) return ''
  return renderSVG(pairingUrl.value, {
    border: 1,
    ecc: 'M',
    pixelSize: 12,
    whiteColor: '#ffffff',
    blackColor: '#111111',
  })
})

const pairingQrDataUrlLarge = computed(() => {
  if (!pairingQrSvgLarge.value) return ''
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pairingQrSvgLarge.value)}`
})

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, '')
  }
  return `http://${trimmed}`.replace(/\/+$/, '')
}

function currentAgentBaseUrl() {
  if (!import.meta.client) return ''
  const routeAgentUrl = normalizeBaseUrl(queryValue(route.query.agentUrl as string | string[] | undefined))
  if (routeAgentUrl) return routeAgentUrl
  const explicitAgentUrl = normalizeBaseUrl(pairAgentUrl.value)
  if (explicitAgentUrl) return explicitAgentUrl
  const storedAgentUrl = normalizeBaseUrl(localStorage.getItem('vb:agentUrl') ?? '')
  if (storedAgentUrl) return storedAgentUrl
  const configuredAgentUrl = normalizeBaseUrl(String(config.public.agentUrl ?? ''))
  if (configuredAgentUrl) return configuredAgentUrl
  return `http://${window.location.hostname || String(config.public.agentHost)}:${config.public.agentPort}`
}

const preIssuedToken = ref('')
const localIpInfo = ref<{ ip: string; agentUrl: string } | null>(null)

async function loadPairingCode() {
  if (!import.meta.client) return
  if (bridge.mode.value === 'relay') {
    currentPairingCode.value = relayState.value?.pairingCode ?? ''
    return
  }
  try {
    const res = await fetch(`${currentAgentBaseUrl()}/pairing-code`)
    if (!res.ok) return
    const data = await res.json() as { code?: string; relay?: { sessionId?: string; pairingCode?: string; relayUrl?: string } | null }
    if (data.code) currentPairingCode.value = data.code
    if (data.relay?.sessionId) relaySessionId.value = String(data.relay.sessionId)
    if (data.relay?.pairingCode) relayPairingCode.value = String(data.relay.pairingCode)
    if (data.relay?.relayUrl && !pairAgentUrl.value) pairAgentUrl.value = String(data.relay.relayUrl)
  } catch {
    // ignore transient network errors
  }
  // Also fetch a pre-issued token for the auto-pair QR code
  try {
    const uiPort = window.location.port || '8080'
    const res2 = await fetch(
      `${currentAgentBaseUrl()}/pairing-url?uiHost=${encodeURIComponent(String(config.public.agentHost))}&uiPort=${uiPort}`
    )
    if (res2.ok) {
      const d = await res2.json() as { token?: string }
      if (d.token) preIssuedToken.value = d.token
    }
  } catch {
    // pre-issued token is optional — fall back to code pairing
  }
  // Fetch actual LAN IP for mDNS-failure fallback QR
  try {
    const res3 = await fetch(`${currentAgentBaseUrl()}/local-ip`)
    if (res3.ok) {
      const d = await res3.json() as { ip?: string; agentUrl?: string }
      if (d.ip && d.agentUrl) localIpInfo.value = { ip: d.ip, agentUrl: d.agentUrl }
    }
  } catch {
    // ignore
  }
}

async function loadFileTree() {
  if (bridge.mode.value === 'relay') {
    const snapshotTree = bridge.agentStatus.value?.fileTree as FileNode[] | undefined
    if (Array.isArray(snapshotTree)) fileTree.value = snapshotTree
    return
  }
  const t = bridge.token.value
  if (!t) return
  try {
    const res = await fetch(`${currentAgentBaseUrl()}/files`, {
      headers: { Authorization: `Bearer ${t}` },
    })
    if (res.ok) {
      const root = await res.json() as FileNode
      fileTree.value = root.children ?? []
    }
  } catch {
    // ignore transient network errors
  }
}

async function loadPreviewUrl() {
  if (bridge.mode.value === 'relay') {
    previewUrl.value = String(bridge.agentStatus.value?.previewUrl ?? '')
    return
  }
  const t = bridge.token.value
  if (!t) return
  try {
    const res = await fetch(`${currentAgentBaseUrl()}/preview-url`, {
      headers: { Authorization: `Bearer ${t}` },
    })
    if (!res.ok) return
    const data = await res.json() as { url?: string | null }
    previewUrl.value = data.url ?? ''
  } catch {
    // ignore transient network errors
  }
}

async function runAgentAction(action: string, args: string[] = []) {
  const t = bridge.token.value
  if (!t) return false
  if (bridge.mode.value === 'relay') {
    bridge.send({ type: 'action', action, args })
    pushActivity('sys', `Action relay envoyée — ${action} ${args.join(' ')}`.trim())
    return true
  }
  actionBusy.value = { ...actionBusy.value, [action]: true }
  try {
    const res = await fetch(`${currentAgentBaseUrl()}/action`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, args }),
    })
    if (!res.ok) {
      pushActivity('err', `Action échouée — ${action} ${args.join(' ')}`.trim())
      return false
    }
    pushActivity('sys', `Action envoyée — ${action} ${args.join(' ')}`.trim())
    return true
  } catch {
    pushActivity('err', `Action inaccessible — ${action} ${args.join(' ')}`.trim())
    return false
  } finally {
    actionBusy.value = { ...actionBusy.value, [action]: false }
  }
}

async function doPair() {
  pairError.value = ''
  pairing.value = true
  const relayBaseUrl = normalizeBaseUrl(queryValue(route.query.relayUrl as string | string[] | undefined) || configuredRelayUrl.value || pairAgentUrl.value)
  const sessionId = relaySessionId.value || queryValue(route.query.sessionId as string | string[] | undefined)
  const shouldUseRelay = queryValue(route.query.relay as string | string[] | undefined) === '1' || Boolean(sessionId && relayBaseUrl)
  const explicitAgentUrl = normalizeBaseUrl(pairAgentUrl.value)
  const ok = shouldUseRelay
    ? await bridge.pairRelay(relayBaseUrl, sessionId, pairCode.value)
    : explicitAgentUrl
      ? await bridge.pairAt(explicitAgentUrl, pairCode.value)
      : await bridge.pair(pairHost.value, pairPort.value, pairCode.value)
  pairing.value = false
  if (!ok) {
    pairError.value = 'Échec — adresse invalide ou code expiré. Rafraîchissez le QR.'
    await loadPairingCode()
  } else {
    await loadFileTree()
    await bridge.fetchAgentStatus()
    await loadPreviewUrl()
    await loadPairingCode()
  }
}
async function refreshPairing() {
  if (relayState.value?.pairingCode) {
    currentPairingCode.value = relayState.value.pairingCode
    return
  }
  if (bridge.status.value === 'connected' && bridge.mode.value === 'local') {
    bridge.send({ type: 'get_pairing_code' })
  } else {
    await loadPairingCode()
  }
}

async function copyPairingLink() {
  if (!pairingUrl.value) return
  await copyText(pairingUrl.value, 'Lien de pairing copié dans le presse-papiers')
}

async function copyText(value: string, label: string) {
  if (!value || !navigator.clipboard) return
  await navigator.clipboard.writeText(value)
  activity.value.unshift({ id: Date.now().toString(), ts: Date.now(), tag: 'sys', text: label })
}

function openTunnel(value: string) {
  if (!import.meta.client || !value) return
  window.open(value, '_blank', 'noopener,noreferrer')
}

async function refreshTunnelHint() {
  const command = isQuickTunnel.value
    ? 'docker compose --profile cloud-quick up -d --force-recreate cloudflared-agent cloudflared-ui && bash scripts/sync-tunnels.sh && docker compose up -d --build ui'
    : 'docker compose --profile cloud up -d cloudflared && docker compose up -d --build ui'
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(command)
  }
  activity.value.unshift({
    id: Date.now().toString(),
    ts: Date.now(),
    tag: 'sys',
    text: isQuickTunnel.value
      ? 'Commande quick tunnel copiée — recréer les tunnels, resynchroniser, puis rebuild ui'
      : 'Commande tunnel stable copiée — relancer cloudflared puis rebuild ui',
  })
}

function reloadPreview() {
  if (previewFrame.value && previewUrl.value) {
    previewFrame.value.src = previewUrl.value
  }
}

async function pairFromRoute() {
  if (!import.meta.client) return

  const relayFlag = queryValue(route.query.relay as string | string[] | undefined)
  const routeRelayUrl = normalizeBaseUrl(queryValue(route.query.relayUrl as string | string[] | undefined) || configuredRelayUrl.value)
  const routeSessionId = queryValue(route.query.sessionId as string | string[] | undefined)
  const host = queryValue(route.query.host as string | string[] | undefined)
  const port = queryValue(route.query.port as string | string[] | undefined)
  const code = queryValue(route.query.code as string | string[] | undefined)
  const agentUrl = normalizeBaseUrl(queryValue(route.query.agentUrl as string | string[] | undefined))
  const preIssuedToken = queryValue(route.query.token as string | string[] | undefined)
  const targetView = queryValue(route.query.view as string | string[] | undefined)

  if (targetView === 'mobile') {
    view.value = 'mobile'
  }

  // ── Fast path: QR code contains pre-issued token — no code exchange needed
  if (preIssuedToken && (agentUrl || (host && port))) {
    const effectiveAgentUrl = agentUrl || `http://${host}:${port}`
    bridge.clearStoredSession()
    bridge.connectWithToken(effectiveAgentUrl, preIssuedToken)
    if (agentUrl) pairAgentUrl.value = agentUrl
    if (host) pairHost.value = host
    if (port) pairPort.value = port
    await router.replace({ query: { view: targetView || 'mobile' } })
    return
  }

  const hasExplicitPairing = Boolean(
    (relayFlag === '1' && routeSessionId && routeRelayUrl && code.length === 6) ||
    ((host || agentUrl) && code.length === 6)
  )

  if (hasExplicitPairing) {
    bridge.clearStoredSession()
  } else if (bridge.token.value) {
    return
  }

  if (host) pairHost.value = host
  if (port) pairPort.value = port
  if (agentUrl) pairAgentUrl.value = agentUrl
  if (routeSessionId) relaySessionId.value = routeSessionId
  if (routeRelayUrl && relayFlag === '1') pairAgentUrl.value = routeRelayUrl
  if (code) pairCode.value = code
  if (relayFlag === '1' && routeSessionId && routeRelayUrl && code.length === 6) {
    await doPair()
    if (!pairError.value) {
      await router.replace({ query: { view: targetView || 'mobile' } })
    }
    return
  }
  if ((!host || !port) && !agentUrl) return
  if (code.length !== 6) return

  await doPair()

  if (!pairError.value) {
    await router.replace({ query: {} })
  }
}

// Mobile tabs
const activeTab = ref<'home' | 'chat' | 'code' | 'preview'>('home')
const mobileTabs = [
  { id: 'home'    as const, label: 'Home',    icon: '⊙' },
  { id: 'chat'    as const, label: 'Chat',    icon: '⌨' },
  { id: 'code'    as const, label: 'Code',    icon: '⟨⟩' },
  { id: 'preview' as const, label: 'Preview', icon: '▣' },
]

// Notifications
interface NotifItem { id: string; text: string; tool: string; ts: number }
const pendingNotifs = ref<NotifItem[]>([])

function removeNotif(id: string) { pendingNotifs.value = pendingNotifs.value.filter(n => n.id !== id) }
function handleNotif(id: string, action: 'validate' | 'refuse') {
  const n = pendingNotifs.value.find(x => x.id === id)
  bridge.send({ type: 'notif_response', id, action })
  removeNotif(id)
  activity.value.unshift({ id: Date.now().toString(), ts: Date.now(), tag: action === 'validate' ? 'user' : 'sys', text: `${action === 'validate' ? 'Validé' : 'Refusé'} — ${n?.text.slice(0, 60) ?? ''}` })
}

// Quick actions
const quickActions = computed(() => [
  { icon: '⌨', label: 'Nouvelle instruction', action: () => { activeTab.value = 'chat' } },
  { icon: '▣', label: 'Preview app', action: previewUrl.value ? () => { activeTab.value = 'preview' } : undefined },
  { icon: '⤴', label: actionBusy.value.git ? 'Git push…' : 'Git push', action: () => { void runAgentAction('git', ['push']) } },
  { icon: '◎', label: actionBusy.value.npm ? 'Tests…' : 'Run tests', action: () => { void runAgentAction('npm', ['test']) } },
])

// Chat
interface ChatMsg { id: string; text: string; direction: 'user' | 'ai'; tool?: string; ts: number }
const chatMessages = ref<ChatMsg[]>([])
const chatDraft  = ref('')
const aiTyping   = ref(false)
const chatScroll = ref<HTMLElement | null>(null)
const outputBuffer = new Map<string, string>()
const outputTimers = new Map<string, ReturnType<typeof setTimeout>>()
const REPLY_TARGET_KEY = 'vb:replyTarget'
const replyTarget = ref(
  import.meta.client ? (localStorage.getItem(REPLY_TARGET_KEY) ?? 'terminal:DevBridge Codex') : 'terminal:DevBridge Codex'
)
const replyTargetPinned = ref(false)
const replyTargetLabel = computed(() => {
  const target = activeTargets.value.find((item) => item.id === replyTarget.value)
  return target?.label ?? replyTarget.value ?? activeToolLabel.value ?? 'adapter actif'
})
const activeTargets = computed(() => {
  const targets: Array<{ id: string; label: string; support: 'direct' | 'vscode' | 'local' }> = []
  const terminals = Array.isArray(ideState.value?.terminals) ? ideState.value?.terminals : []

  // DevBridge Codex terminal always first
  targets.push({ id: 'terminal:DevBridge Codex', label: '⟨⟩ DevBridge Codex', support: 'direct' })

  for (const terminal of terminals) {
    const name = String(terminal?.name ?? '').trim()
    const cwd = String(terminal?.cwd ?? '').trim()
    if (!name) continue
    const project = cwd ? lastPathSegment(cwd) : ''
    targets.push({
      id: `terminal:${name}`,
      label: project ? `Terminal ${name} · ${project}` : `Terminal ${name}`,
      support: 'direct',
    })
  }

  for (const tool of tools.value) {
    if (!tool.available) continue
    if (targets.some((item) => item.id === tool.id)) continue
    targets.push({
      id: tool.id,
      label: tool.active ? `${tool.label} · par défaut` : tool.label,
      support: tool.id.includes('cli') ? 'local' : 'vscode',
    })
  }

  targets.push({ id: 'chat:devbridge', label: '◈ DevBridge Chat', support: 'vscode' })

  return targets
})

function resolveChatDestination(target: string) {
  const normalized = target.trim()
  if (!normalized) return { target: undefined, tool: undefined }
  const tool = tools.value.find((item) => item.id === normalized)
  if (tool) return { target: undefined, tool: tool.id }
  return { target: normalized, tool: undefined }
}

function sendChat() {
  const text = chatDraft.value.trim()
  if (!text) return
  chatMessages.value.push({ id: Date.now().toString(), direction: 'user', text, ts: Date.now() })
  pushActivity('user', `Instruction envoyée — ${shortText(text, 70)}`)
  const destination = resolveChatDestination(replyTarget.value || activeTool.value?.id || '')
  const isTerminalTarget = (destination.target ?? '').startsWith('terminal:')
  bridge.send({
    type: 'message',
    text,
    target: destination.target,
    tool: destination.tool,
    sendEnter: isTerminalTarget,
  })
  chatDraft.value = ''
  aiTyping.value = true
  nextTick(() => { if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight })
}

function appendAiMessage(text: string, tool?: string, merge = false) {
  const clean = stripAnsi(text).trim()
  if (!clean) return
  const last = chatMessages.value.at(-1)
  if (merge && last && last.direction === 'ai' && last.tool === tool && Date.now() - last.ts < 1500) {
    last.text = `${last.text}${last.text.endsWith('\n') ? '' : '\n'}${clean}`
    last.ts = Date.now()
    return
  }
  chatMessages.value.push({ id: Date.now().toString(), direction: 'ai', text: clean, tool, ts: Date.now() })
}

function setReplyTarget(nextTarget: string, pinned = false) {
  if (!nextTarget) return
  replyTarget.value = nextTarget
  if (import.meta.client) localStorage.setItem(REPLY_TARGET_KEY, nextTarget)
  if (pinned) replyTargetPinned.value = true
}

function flushBufferedOutput(tool = 'agent') {
  const pending = stripAnsi(outputBuffer.get(tool) ?? '').trim()
  const timer = outputTimers.get(tool)
  if (timer) {
    clearTimeout(timer)
    outputTimers.delete(tool)
  }
  if (!pending) return
  outputBuffer.delete(tool)
  appendAiMessage(pending, tool, true)
  pushActivity('info', `${tool} — ${shortText(pending, 70)}`)
  void loadPreviewUrl()
  nextTick(() => { if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight })
}

function queueOutputChunk(text: string, tool?: string) {
  const key = tool ?? 'agent'
  const previous = outputBuffer.get(key) ?? ''
  outputBuffer.set(key, `${previous}${text}`)
  const oldTimer = outputTimers.get(key)
  if (oldTimer) clearTimeout(oldTimer)
  outputTimers.set(key, setTimeout(() => flushBufferedOutput(key), 350))
}

// WS
const offMsg = bridge.onMessage((msg: WsMessage) => {
  if (msg.type === 'notification') {
    pendingNotifs.value.push({ id: Date.now().toString(), text: msg.text ?? '', tool: (msg.tool as string) ?? '', ts: Date.now() })
    pushActivity('ai', `Validation requise — ${shortText(msg.text ?? '', 70)}`)
  } else if (msg.type === 'chat_response' || msg.type === 'ai_message') {
    flushBufferedOutput((msg.tool as string) ?? 'agent')
    aiTyping.value = false
    if (!replyTargetPinned.value) {
      setReplyTarget(String(msg.target ?? msg.tool ?? replyTarget.value ?? ''))
    }
    appendAiMessage(msg.text ?? '', msg.tool as string)
    pushActivity('ai', shortText(msg.text ?? '', 70))
    nextTick(() => { if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight })
  } else if (msg.type === 'output' && msg.text) {
    aiTyping.value = false
    if (!replyTargetPinned.value) {
      setReplyTarget(String(msg.tool ?? replyTarget.value ?? ''))
    }
    queueOutputChunk(msg.text, msg.tool as string)
  } else if (msg.type === 'adapter_exit') {
    flushBufferedOutput((msg.tool as string) ?? 'agent')
    pushActivity('err', `${String(msg.tool ?? 'adapter')} exited`)
    void bridge.fetchAgentStatus()
  } else if (msg.type === 'ai_typing') {
    aiTyping.value = true
  } else if (msg.type === 'event') {
    pushActivity('sys', (msg.event as string) ?? msg.type)
    if (String(msg.event ?? '').startsWith('active_adapter:')) {
      void bridge.fetchAgentStatus()
    }
  } else if (msg.type === 'ide_snapshot') {
    const state = (msg.state as Record<string, unknown> | undefined) ?? {}
    const activeFile = String(state.activeFile ?? '')
    const activeTerminal = String(state.activeTerminal ?? '')
    pushActivity('sys', `IDE synchronisé — ${shortText(activeFile || activeTerminal || 'snapshot reçu', 70)}`)
    void bridge.fetchAgentStatus()
  } else if (msg.type === 'status_snapshot') {
    const payload = typeof msg.payload === 'object' && msg.payload ? msg.payload as Record<string, unknown> : msg
    previewUrl.value = String(payload.previewUrl ?? previewUrl.value ?? '')
    const snapshotTree = payload.fileTree as FileNode[] | undefined
    if (Array.isArray(snapshotTree)) fileTree.value = snapshotTree
    pushActivity('sys', 'Session relay synchronisée')
  } else if (msg.type === 'ide_event') {
    const kind = String(msg.kind ?? 'ide_event')
    const terminal = String(msg.terminal ?? '')
    const commandLine = String(msg.commandLine ?? '')
    const activeFile = String(msg.activeFile ?? '')
    const target = String(msg.target ?? '')
    const textPreview = String(msg.textPreview ?? '')
    const workspaceFolders = Array.isArray(msg.workspaceFolders) ? String(msg.workspaceFolders[0] ?? '') : ''
    const label = textPreview || commandLine || activeFile || terminal || workspaceFolders || kind
    if (target && !replyTargetPinned.value) setReplyTarget(target)
    pushActivity('sys', `VS Code — ${shortText(label, 80)}`)
  } else if (msg.type === 'pairing_code' && msg.code) {
    currentPairingCode.value = String(msg.code)
    showQrModal.value = false
    pushActivity('sys', `Code d'appairage disponible — ${currentPairingCode.value}`)
  } else if (msg.type === 'relay_session') {
    const payload = typeof msg.payload === 'object' && msg.payload ? msg.payload as Record<string, unknown> : {}
    if (payload.pairingCode) currentPairingCode.value = String(payload.pairingCode)
    if (payload.sessionId) relaySessionId.value = String(payload.sessionId)
  } else if (msg.type === 'dev_server_url') {
    previewUrl.value = String(msg.url ?? '')
    if (previewUrl.value) pushActivity('sys', `Preview détectée — ${shortText(previewUrl.value, 70)}`)
  } else if (msg.type === 'file_changed') {
    pushActivity('sys', `Fichier changé — ${String(msg.path ?? '')}`)
    void loadFileTree()
  }
})

watch(() => bridge.status.value, (next) => {
  if (next === 'connected') {
    void loadFileTree()
    void bridge.fetchAgentStatus()
    void loadPreviewUrl()
    bridge.send({ type: 'get_preview_url' })
    if (bridge.mode.value === 'local') bridge.send({ type: 'get_pairing_code' })
  }
}, { immediate: true })

watch(activeTargets, (targets) => {
  // Only reset if the stored target is truly gone AND it's not the static Codex entry
  const isStaticTerminal = replyTarget.value === 'terminal:DevBridge Codex'
  if (!isStaticTerminal && !targets.some((target) => target.id === replyTarget.value)) {
    replyTargetPinned.value = false
    replyTarget.value = ''
  }
  if (!replyTarget.value && targets.length) {
    setReplyTarget(targets[0]?.id ?? '')
  }
}, { immediate: true })

onMounted(() => {
  clientReady.value = true
  // Always use the configured mDNS hostname for the QR code URL so it works
  // even when the desktop operator accessed the UI via a raw IP address.
  publicUiHost.value = String(config.public.agentHost) || window.location.hostname
  const configured = normalizeBaseUrl(String(config.public.agentUrl ?? ''))
  const stored = localStorage.getItem('vb:agentUrl')
  const preferredAgentUrl = stored ? normalizeBaseUrl(stored) : configured
  if (!preferredAgentUrl) {
    resolvedAgentHost.value = publicUiHost.value
  } else {
    pairAgentUrl.value = preferredAgentUrl
    try {
      resolvedAgentHost.value = new URL(preferredAgentUrl).hostname
    } catch {
      resolvedAgentHost.value = preferredAgentUrl
    }
  }
  pairHost.value = resolvedAgentHost.value || publicUiHost.value
  void loadPairingCode()
  void pairFromRoute()
})

onUnmounted(() => {
  outputTimers.forEach((timer) => clearTimeout(timer))
  outputTimers.clear()
  outputBuffer.clear()
  offMsg()
})
useHead({ title: 'DevBridge — Dashboard' })
</script>

<style scoped>
.notif-enter-active, .notif-leave-active { transition: all 0.28s ease; }
.notif-enter-from, .notif-leave-to { transform: translateY(-6px); opacity: 0; }
</style>
