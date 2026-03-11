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

        <!-- Tools / CLIs -->
        <div style="border-right:1px solid var(--border);border-bottom:1px solid var(--border)">
          <PanelHead title="Outils CLI" />
          <div class="overflow-y-auto" style="max-height:280px">
            <div
              v-for="(cli, i) in cliList" :key="cli.id"
              class="flex items-center gap-3 px-5 py-2.5 text-[11px]"
              :style="i < cliList.length - 1 ? 'border-bottom:1px solid var(--border)' : ''"
            >
              <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="`background:var(--dot-${cli.detected ? 'green' : 'red'})`" />
              <span class="flex-1 truncate">{{ cli.name }}</span>
              <span class="text-[9px] uppercase tracking-[0.1em] shrink-0" style="color:var(--muted)">Terminal</span>
              <button
                v-if="cli.detected"
                :disabled="!!cliLaunching[cli.id]"
                class="text-[9px] uppercase tracking-widest px-2 py-1 shrink-0 transition-colors disabled:opacity-40"
                style="border:1px solid var(--border);color:var(--text);background:none"
                @click="launchCli(cli.id)"
              >
                {{ cliLaunching[cli.id] ? '…' : 'Lancer' }}
              </button>
              <span v-else class="text-[9px] shrink-0" style="color:var(--dot-red)">non détecté</span>
            </div>
            <p v-if="!cliList.length" class="text-[11px] px-7 py-4" style="color:var(--muted)">— Non connecté —</p>
          </div>
          <!-- Adapter toggles below CLIs -->
          <div v-if="tools.length" style="border-top:1px solid var(--border)">
            <ToolRow
              v-for="t in tools" :key="t.id"
              :name="t.label" :type="t.type" :available="t.available" :reason="t.reason" :model-value="t.active"
              @update:model-value="toggleTool(t.id, $event)"
            />
          </div>
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

        <!-- Projets disponibles -->
        <div style="border-right:1px solid var(--border)">
          <PanelHead title="Projets disponibles" />
          <div class="overflow-y-auto" style="max-height:280px">
            <div
              v-for="(proj, i) in projectsList" :key="proj.path"
              class="flex items-center justify-between px-5 py-2.5 text-[11px]"
              :style="i < projectsList.length - 1 ? 'border-bottom:1px solid var(--border)' : ''"
            >
              <span class="flex items-center gap-2 truncate">
                <span v-if="proj.isActive" class="shrink-0" style="color:var(--dot-amber)">★</span>
                <span class="truncate">{{ proj.name }}</span>
              </span>
              <span v-if="proj.isActive" class="text-[9px] uppercase tracking-[0.1em] shrink-0 ml-2" style="color:var(--muted)">actif</span>
              <button
                v-else
                :disabled="Boolean(projectOpening[proj.path]) && projectOpening[proj.path] !== 'done'"
                class="text-[9px] uppercase tracking-widest px-2 py-1 shrink-0 ml-2 transition-colors disabled:opacity-40"
                :style="projectOpening[proj.path] === 'done'
                  ? 'border:1px solid var(--dot-green);color:var(--dot-green);background:none'
                  : 'border:1px solid var(--border);color:var(--text);background:none'"
                @click="openProject(proj.path, proj.name)"
              >
                {{ projectOpening[proj.path] && projectOpening[proj.path] !== 'done' ? 'Ouverture…' : projectOpening[proj.path] === 'done' ? 'Ouvert ✓' : 'Ouvrir →' }}
              </button>
            </div>
            <p v-if="!projectsList.length" class="text-[11px] px-7 py-4" style="color:var(--muted)">— Non connecté —</p>
          </div>
        </div>

        <!-- Network / pairing -->
        <div>
          <PanelHead title="Réseau & Pairing" />
          <!-- Key info rows -->
          <div class="px-7">
            <NetRow label="Adresse" :value="currentAgentBaseUrl() || String(agentHost)" mono />
            <NetRow label="Port" :value="String(agentPort)" mono />
            <NetRow label="Mode" :value="tunnelModeLabel" />
            <NetRow label="Statut">
              <template #value>
                <StatusDot :state="bridge.status.value" :mode="bridge.mode.value" :latency="bridge.latencyMs.value" />
              </template>
            </NetRow>
          </div>
          <!-- 3 action buttons -->
          <div class="px-7 mt-4 grid grid-cols-3 gap-2">
            <button
              class="text-[10px] uppercase tracking-widest py-2 transition-colors"
              style="border:1px solid var(--border);color:var(--text);background:none"
              @click="openTunnel(currentAgentBaseUrl())"
            >
              Ouvrir
            </button>
            <button
              class="text-[10px] uppercase tracking-widest py-2 transition-colors"
              style="border:1px solid var(--border);color:var(--text);background:none"
              @click="copyText(currentAgentBaseUrl(), 'URL Agent copiée')"
            >
              Copier
            </button>
            <ClientOnly>
              <button
                :disabled="!pairingQrSvg"
                class="text-[10px] uppercase tracking-widest py-2 transition-colors disabled:opacity-30"
                style="border:1px solid var(--border);color:var(--text);background:none"
                @click="showQrModal = true"
              >
                QR ▣
              </button>
            </ClientOnly>
          </div>
          <!-- Pair form — only code field inline -->
          <div v-if="bridge.status.value === 'disconnected' && !bridge.token.value" class="px-7 pb-6 mt-4 space-y-2">
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
          <NuxtLink to="/settings" class="ml-1 leading-none" style="color:var(--muted)" title="Paramètres">⚙</NuxtLink>
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
                <p class="text-[10px] uppercase tracking-[0.1em]" style="color:var(--muted)">{{ bridge.status.value }} · {{ activeWorkspaceLabel }} · {{ transportLabel }} · {{ latencyLabel }}</p>
                <p class="text-[11px] mt-0.5">{{ activeProjectLabel }} · {{ activeToolLabel }}</p>
              </div>
            </div>
            <div class="text-right text-[9px]" style="color:var(--muted)">{{ latencyLabel }}<br><span class="text-[8px]">{{ transportLabel }}</span></div>
          </div>

          <div class="px-4 mb-4">
            <WorkspaceSwitcher
              :workspaces="relayWorkspaceOptions"
              :active-workspace-id="activeWorkspaceKey"
              :projects="projectsList"
              :loading-projects="projectsLoading"
              :project-opening="projectOpening"
              @select="bridge.setActiveWorkspace"
              @open-project="requestProjects"
              @request-projects="requestProjects"
              @open-listed-project="openListedProject"
            />
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

          <!-- Active tools / CLIs -->
          <div class="px-4 mt-4 mb-6">
            <p class="text-[8px] tracking-[0.25em] uppercase mb-2.5" style="color:var(--muted)">Outils actifs</p>
            <div style="border:1px solid var(--border)">
              <!-- Detected CLIs -->
              <div
                v-for="(cli, i) in cliList.filter(c => c.detected)" :key="cli.id"
                class="flex items-center justify-between px-3.5 py-2.5 text-[11px]"
                :style="(i < cliList.filter(c => c.detected).length - 1 || tools.length) ? 'border-bottom:1px solid var(--border)' : ''"
              >
                <span class="flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full inline-block" style="background:var(--dot-green)" />
                  {{ cli.name }}
                </span>
                <div class="flex items-center gap-2">
                  <span class="text-[9px] uppercase tracking-[0.1em]" style="color:var(--muted)">Terminal</span>
                  <button
                    :disabled="!!cliLaunching[cli.id]"
                    class="text-[9px] uppercase tracking-widest px-2 py-1 transition-colors disabled:opacity-40"
                    style="border:1px solid var(--border);color:var(--text);background:none"
                    @click="launchCli(cli.id)"
                  >
                    {{ cliLaunching[cli.id] ? '…' : 'Lancer' }}
                  </button>
                </div>
              </div>
              <!-- Adapters (IDE/extension) -->
              <div
                v-for="(t, i) in tools" :key="t.id"
                class="flex items-center justify-between px-3.5 py-2.5 text-[11px]"
                :style="i < tools.length - 1 ? 'border-bottom:1px solid var(--border)' : ''"
              >
                <span class="flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full inline-block" :style="`background:var(--dot-${t.available ? (t.active ? 'green' : 'amber') : 'red'})`" />
                  {{ t.label }}
                </span>
                <span class="text-[9px] uppercase tracking-[0.1em]" style="color:var(--muted)">{{ t.available ? t.type : 'missing' }}</span>
              </div>
              <p v-if="!cliList.filter(c => c.detected).length && !tools.length" class="px-3.5 py-2.5 text-[10px]" style="color:var(--muted)">— Aucun outil —</p>
            </div>
          </div>

          <!-- Agent access -->
          <div class="px-4 mb-6">
            <p class="text-[8px] tracking-[0.25em] uppercase mb-2.5" style="color:var(--muted)">Agent</p>
            <div class="grid grid-cols-3 gap-px" style="border:1px solid var(--border);background:var(--border)">
              <button
                class="text-[10px] uppercase tracking-[0.1em] py-2.5"
                style="background:var(--bg);color:var(--text)"
                @click="openTunnel(currentAgentBaseUrl())"
              >
                Ouvrir
              </button>
              <button
                class="text-[10px] uppercase tracking-[0.1em] py-2.5"
                style="background:var(--bg);color:var(--text)"
                @click="copyText(currentAgentBaseUrl(), 'URL Agent copiée')"
              >
                Copier
              </button>
              <ClientOnly>
                <button
                  :disabled="!pairingQrSvg"
                  class="text-[10px] uppercase tracking-[0.1em] py-2.5 disabled:opacity-30"
                  style="background:var(--bg);color:var(--text)"
                  @click="showQrModal = true"
                >
                  QR ▣
                </button>
              </ClientOnly>
            </div>
          </div>
        </div>

        <!-- CHAT tab -->
        <div v-show="activeTab === 'chat'" class="absolute inset-0 flex flex-col">
          <div class="shrink-0 px-4 py-3" style="border-bottom:1px solid var(--border)">
            <WorkspaceSwitcher
              :workspaces="relayWorkspaceOptions"
              :active-workspace-id="activeWorkspaceKey"
              :projects="projectsList"
              :loading-projects="projectsLoading"
              :project-opening="projectOpening"
              @select="bridge.setActiveWorkspace"
              @open-project="requestProjects"
              @request-projects="requestProjects"
              @open-listed-project="openListedProject"
            />
          </div>
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
                v-for="target in chatTargets"
                :key="target.id"
                :disabled="target.state === 'starting'"
                class="shrink-0 text-[10px] uppercase tracking-[0.14em] px-3 py-1.5 font-mono disabled:pointer-events-none"
                :style="targetButtonStyle(target)"
                @click="selectChatTarget(target)"
              >
                {{ targetButtonLabel(target) }}
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
            <button :disabled="!selectedChatTargetReady" class="w-10 h-10 flex items-center justify-center text-sm shrink-0 disabled:opacity-30" style="background:var(--text);color:var(--bg);border:1px solid var(--text)" @click="sendChat">↑</button>
            </div>
          </div>
        </div>

        <!-- CODE tab -->
        <div v-show="activeTab === 'code'" class="absolute inset-0 flex flex-col">
          <!-- Projects list -->
          <div class="shrink-0" style="border-bottom:1px solid var(--border)">
            <div class="px-4 py-2 flex items-center justify-between" style="border-bottom:1px solid var(--border)">
              <p class="text-[9px] uppercase tracking-[0.2em]" style="color:var(--muted)">Projets disponibles</p>
            </div>
            <div class="overflow-y-auto" style="max-height:160px">
              <div
                v-for="(proj, i) in projectsList" :key="proj.path"
                class="flex items-center justify-between px-4 py-2 text-[11px]"
                :style="i < projectsList.length - 1 ? 'border-bottom:1px solid var(--border)' : ''"
              >
                <span class="flex items-center gap-1.5 truncate">
                  <span v-if="proj.isActive" style="color:var(--dot-amber)">★</span>
                  <span class="truncate">{{ proj.name }}</span>
                </span>
                <span v-if="proj.isActive" class="text-[9px] shrink-0 ml-2" style="color:var(--muted)">actif</span>
                <button
                  v-else
                  :disabled="Boolean(projectOpening[proj.path]) && projectOpening[proj.path] !== 'done'"
                  class="text-[9px] uppercase tracking-widest px-2 py-1 shrink-0 ml-2 transition-colors disabled:opacity-40"
                  :style="projectOpening[proj.path] === 'done'
                    ? 'border:1px solid var(--dot-green);color:var(--dot-green);background:none'
                    : 'border:1px solid var(--border);color:var(--text);background:none'"
                  @click="openProject(proj.path, proj.name)"
                >
                  {{ projectOpening[proj.path] && projectOpening[proj.path] !== 'done' ? '…' : projectOpening[proj.path] === 'done' ? '✓' : '→' }}
                </button>
              </div>
              <p v-if="!projectsList.length" class="px-4 py-3 text-[10px]" style="color:var(--muted)">— Non connecté —</p>
            </div>
          </div>
          <!-- File tree -->
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
      <div class="w-full max-w-[32rem]" style="border:1px solid var(--border-bright);background:var(--bg)">
        <!-- Modal header -->
        <div class="flex items-center justify-between px-6 py-4" style="border-bottom:1px solid var(--border)">
          <div>
            <p class="text-[9px] uppercase tracking-[0.2em]" style="color:var(--muted)">Pairing QR</p>
            <p class="text-sm mt-0.5">Scannez depuis le mobile pour lancer l'appairage.</p>
          </div>
          <button
            class="shrink-0 w-9 h-9 text-sm"
            style="border:1px solid var(--border);color:var(--text);background:none"
            type="button"
            aria-label="Fermer la modale QR"
            @click="showQrModal = false"
          >✕</button>
        </div>

        <!-- Main QR -->
        <div class="flex justify-center px-6 pt-5">
          <div class="p-5 bg-white" style="border:1px solid var(--border-bright)">
            <img :src="pairingQrDataUrlLarge" alt="QR code de pairing" class="block w-64 h-64" />
          </div>
        </div>

        <!-- Fallback QR -->
        <div v-if="fallbackQrDataUrl" class="flex justify-center gap-8 px-6 pt-4">
          <div class="flex flex-col items-center gap-1">
            <div class="p-2 bg-white" style="border:1px dashed var(--border)">
              <img :src="fallbackQrDataUrl" alt="QR fallback IP" class="block w-24 h-24" />
            </div>
            <p class="text-[9px] uppercase tracking-[0.12em] text-center" style="color:var(--muted)">Fallback IP<br/>{{ localIpInfo?.ip }}</p>
          </div>
        </div>

        <!-- Actions + details -->
        <div class="px-6 pb-5 mt-4 space-y-3" style="border-top:1px solid var(--border);padding-top:1rem">
          <div class="grid grid-cols-2 gap-2">
            <button
              class="text-[10px] uppercase tracking-widest py-2 transition-colors"
              style="border:1px solid var(--text);color:var(--text);background:none"
              @click="copyPairingLink"
            >
              Copier le lien
            </button>
            <button
              class="text-[10px] uppercase tracking-widest py-2 transition-colors"
              style="border:1px solid var(--border);color:var(--text);background:none"
              @click="refreshPairing"
            >
              Nouveau QR
            </button>
          </div>
          <div class="text-[10px] space-y-1" style="color:var(--muted)">
            <p>Adresse : <span class="font-mono" style="color:var(--text)">{{ currentAgentBaseUrl() || agentHost }}</span></p>
            <p v-if="currentPairingCode">Code : <span class="font-mono" style="color:var(--text)">{{ currentPairingCode }}</span></p>
            <p>Mode : <span style="color:var(--text)">{{ tunnelModeLabel }}</span></p>
          </div>
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
import { loadWorkspaceChatHistory, saveWorkspaceChatHistory } from '~/composables/useWorkspaceChatHistory'

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
const activeWorkspaceLabel = computed(() => bridge.mode.value === 'relay'
  ? bridge.activeWorkspace.value?.name ?? 'Aucun workspace'
  : 'Workspace local')
const activeWorkspaceKey = computed(() => bridge.mode.value === 'relay' ? (bridge.activeWorkspaceId.value || 'default') : 'local')
const relayWorkspaceOptions = computed(() => bridge.mode.value === 'relay'
  ? bridge.relayWorkspaces.value
  : [{ id: 'local', name: 'Workspace local', active: true }])
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
  if (bridge.mode.value === 'relay') return 'Relay cloud'
  return currentAgentBaseUrl().startsWith('https://') ? 'HTTPS tunnel' : 'WiFi local'
})
const latencyLabel = computed(() => bridge.agentStatus.value ? `${Math.max(1, Math.round((Date.now() - bridge.agentStatus.value.timestamp) / 1000))}s` : '—')

function toggleTool(id: string, val: boolean) {
  const tool = tools.value.find((item) => item.id === id)
  if (val && tool?.available) {
    bridge.send({ type: 'adapter_toggle', id, active: true })
    void bridge.fetchAgentStatus()
  }
}

// ── CLI Registry ───────────────────────────────────────
interface CliItem { id: string; name: string; command: string; args: string[]; detected: boolean; isDefault: boolean; isCustom: boolean }
const cliList = ref<CliItem[]>([])
const cliLaunching = ref<Record<string, boolean>>({})

function launchCli(cliId: string) {
  if (cliLaunching.value[cliId]) return
  cliLaunching.value[cliId] = true
  bridge.send({ type: 'start_cli', cliId })
  // Optimistic: clear busy flag after 5s (cli_started message will update UI too)
  setTimeout(() => { cliLaunching.value[cliId] = false }, 5_000)
}

function cliButtonName(cli: CliItem) {
  if (cli.id === 'claude-code') return 'CLAUDE'
  if (cli.id === 'copilot') return 'COPILOT'
  if (cli.id === 'codex') return 'CODEX'
  if (cli.id === 'aider') return 'AIDER'
  const firstToken = String(cli.command ?? '').trim().split(/\s+/)[0] ?? ''
  return (firstToken || cli.name).replace(/[^a-z0-9]+/gi, '').toUpperCase()
}

function targetButtonLabel(target: ChatTarget) {
  if (target.state === 'starting') return `▶ ${target.label}`
  if (target.state === 'active') return `${target.label} ●`
  return target.label
}

function targetButtonStyle(target: ChatTarget) {
  if (target.state === 'active') {
    return 'border:1px solid var(--text);color:var(--text);background:var(--surface)'
  }
  if (target.state === 'starting') {
    return 'border:1px solid var(--border);color:var(--muted);background:none;opacity:0.45'
  }
  return 'border:1px solid var(--border);color:var(--muted);background:none'
}

function isChatTargetId(value: unknown) {
  const id = String(value ?? '').trim()
  return id === 'bash' || cliList.value.some(cli => cli.id === id)
}

function killCli(terminalName: string) {
  bridge.send({ type: 'kill_cli', terminalName })
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

// Projects list
interface ProjectItem { name: string; path: string; isActive: boolean }
const projectsList = ref<ProjectItem[]>([])
const projectsLoading = ref(false)
const projectOpening = ref<Record<string, string>>({})

async function loadProjects() {
  projectsLoading.value = true
  try {
    const token = bridge.token.value ?? ''
    const base = bridge.activeUrl.value ?? currentAgentBaseUrl()
    const res = await fetch(`${base}/projects`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const data = await res.json() as { projects?: ProjectItem[] }
      projectsList.value = data.projects ?? []
    }
  } catch { /* silent if not connected */ }
  finally {
    projectsLoading.value = false
  }
}

async function openProject(projPath: string, projName: string, newWindow = true) {
  projectOpening.value[projPath] = newWindow ? 'parallel' : 'replace'
  try {
    const token = bridge.token.value ?? ''
    const base = bridge.activeUrl.value ?? currentAgentBaseUrl()
    const res = await fetch(`${base}/projects/open`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: projPath, newWindow }),
    })
    if (res.ok) {
      projectOpening.value[projPath] = 'done'
      pushActivity('sys', `${projName} ouvert dans VS Code`)
      setTimeout(() => { delete projectOpening.value[projPath] }, 4_000)
    } else {
      projectOpening.value[projPath] = ''
    }
  } catch {
    projectOpening.value[projPath] = ''
  }
}

async function requestProjects() {
  if (bridge.mode.value === 'relay') {
    projectsLoading.value = true
    bridge.send({ type: 'list_projects' })
    return
  }
  await loadProjects()
}

function openListedProject(payload: { path: string; newWindow: boolean }) {
  const project = projectsList.value.find(item => item.path === payload.path)
  if (!project) return
  void openProject(project.path, project.name, payload.newWindow)
}

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
const preIssuedWorkspace = ref('')

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

const pairingUrl = computed(() => {
  const relaySession = relayState.value
  const effectiveCode = relaySession?.pairingCode || currentPairingCode.value
  if (!clientReady.value || (!effectiveCode && !preIssuedToken.value)) return ''
  if (relaySession?.qrUrl) {
    return relaySession.qrUrl
  }
  const agentBaseUrl = pairAgentUrl.value || currentAgentBaseUrl()
  const relayUiBase = uiTunnelUrl.value || window.location.origin
  const localUiBase = uiTunnelUrl.value || window.location.href
  const base = relaySession?.sessionId ? relayUiBase : localUiBase
  const url = new URL(base)
  if (!relaySession?.sessionId && !uiTunnelUrl.value) {
    url.hostname = publicUiHost.value
    url.port = window.location.port
    url.pathname = window.location.pathname
  }
  url.search = ''
  url.hash = ''
  if (relaySession?.sessionId && configuredRelayUrl.value) {
    url.searchParams.set('relay', '1')
    url.searchParams.set('relayUrl', configuredRelayUrl.value)
    url.searchParams.set('sessionId', relaySession.sessionId)
    url.searchParams.set('code', relaySession.pairingCode)
  } else if (preIssuedToken.value) {
    url.searchParams.set('token', preIssuedToken.value)
    if (preIssuedWorkspace.value) {
      url.searchParams.set('workspace', preIssuedWorkspace.value)
    }
    const shouldUseDirectAgent = url.protocol === 'http:' && !configuredRelayUrl.value
    if (shouldUseDirectAgent && agentBaseUrl) {
      url.searchParams.set('agentUrl', agentBaseUrl)
    }
  } else {
    url.searchParams.set('view', 'mobile')
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
  if (!clientReady.value || !localIpInfo.value || !preIssuedToken.value || window.location.protocol === 'https:') return ''
  const uiPort = import.meta.client ? (window.location.port || '8080') : '8080'
  const fallbackUrl = new URL(`http://${localIpInfo.value.ip}:${uiPort}/`)
  fallbackUrl.searchParams.set('token', preIssuedToken.value)
  if (preIssuedWorkspace.value) {
    fallbackUrl.searchParams.set('workspace', preIssuedWorkspace.value)
  }
  fallbackUrl.searchParams.set('agentUrl', localIpInfo.value.agentUrl)
  const svg = renderSVG(fallbackUrl.toString(), { border: 1, ecc: 'M', pixelSize: 5, whiteColor: '#ffffff', blackColor: '#111111' })
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
  // On HTTPS (production), the agent is behind Nginx — no direct port access
  if (window.location.protocol === 'https:') return window.location.origin
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
      const d = await res2.json() as { token?: string; workspace?: string }
      if (d.token) preIssuedToken.value = d.token
      if (d.workspace) preIssuedWorkspace.value = d.workspace
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
    // Persist relay URL into network config so Settings shows it auto-filled
    try {
      const stored = localStorage.getItem('vb:network')
      const net = stored ? JSON.parse(stored) as Record<string, unknown> : {}
      net.relayUrl = routeRelayUrl
      net.mode = 'relay'
      localStorage.setItem('vb:network', JSON.stringify(net))
    } catch { /* ignore */ }
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
  { icon: '⚙', label: 'Paramètres',           action: () => { void router.push('/settings') } },
])

// Chat
interface ChatMsg { id: string; text: string; direction: 'user' | 'ai'; tool?: string; ts: number }
type ChatTargetState = 'idle' | 'starting' | 'active'
interface ChatTarget { id: string; label: string; terminalName?: string; state: ChatTargetState }
const chatMessages = ref<ChatMsg[]>([])
const chatDraft  = ref('')
const aiTyping   = ref(false)
const chatScroll = ref<HTMLElement | null>(null)
const outputBuffer = new Map<string, string>()
const outputTimers = new Map<string, ReturnType<typeof setTimeout>>()
const REPLY_TARGET_KEY = 'vb:chatTarget'
const replyTarget = ref(
  import.meta.client ? (localStorage.getItem(REPLY_TARGET_KEY) ?? 'bash') : 'bash'
)
const replyTargetPinned = ref(false)
const replyTargetLabel = computed(() => {
  const target = chatTargets.value.find((item) => item.id === replyTarget.value)
  return target?.label ?? 'BASH'
})
const chatTargets = computed<ChatTarget[]>(() => {
  const terminals = Array.isArray(ideState.value?.terminals) ? ideState.value?.terminals : []
  const targets: ChatTarget[] = [
    { id: 'bash', label: 'BASH', terminalName: 'bash', state: replyTarget.value === 'bash' ? 'active' : 'idle' },
  ]
  for (const cli of cliList.value) {
    const terminalName = `DevBridge ${cli.name}`
    const isLaunched = terminals.some(terminal => String(terminal?.name ?? '').trim() === terminalName)
    const isStarting = Boolean(cliLaunching.value[cli.id])
    targets.push({
      id: cli.id,
      label: cliButtonName(cli),
      terminalName,
      state: isStarting ? 'starting' : (replyTarget.value === cli.id && isLaunched ? 'active' : 'idle'),
    })
  }
  return targets
})

const selectedChatTargetReady = computed(() => {
  if (replyTarget.value === 'bash') return true
  const terminals = Array.isArray(ideState.value?.terminals) ? ideState.value?.terminals : []
  const target = chatTargets.value.find((item) => item.id === replyTarget.value)
  return Boolean(target && target.state !== 'starting' && target.terminalName && terminals.some(
    terminal => String(terminal?.name ?? '').trim() === target.terminalName
  ))
})

function sendChat() {
  const text = chatDraft.value.trim()
  if (!text || !selectedChatTargetReady.value) return
  chatMessages.value.push({ id: Date.now().toString(), direction: 'user', text, ts: Date.now() })
  saveWorkspaceChatHistory(activeWorkspaceKey.value, chatMessages.value)
  pushActivity('user', `Instruction envoyée — ${shortText(text, 70)}`)
  bridge.send({
    type: 'message',
    text,
    target: replyTarget.value,
    sendEnter: true,
  })
  chatDraft.value = ''
  aiTyping.value = true
  nextTick(() => { if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight })
}

function requestOpenProject() {
  void requestProjects()
  pushActivity('sys', 'Chargement de la liste des projets')
}

function appendAiMessage(text: string, tool?: string, merge = false) {
  const clean = stripAnsi(text).trim()
  if (!clean) return
  const last = chatMessages.value.at(-1)
  if (merge && last && last.direction === 'ai' && last.tool === tool && Date.now() - last.ts < 1500) {
    last.text = `${last.text}${last.text.endsWith('\n') ? '' : '\n'}${clean}`
    last.ts = Date.now()
    saveWorkspaceChatHistory(activeWorkspaceKey.value, chatMessages.value)
    return
  }
  chatMessages.value.push({ id: Date.now().toString(), direction: 'ai', text: clean, tool, ts: Date.now() })
  saveWorkspaceChatHistory(activeWorkspaceKey.value, chatMessages.value)
}

function setReplyTarget(nextTarget: string, pinned = false) {
  if (!nextTarget) return
  replyTarget.value = nextTarget
  if (import.meta.client) localStorage.setItem(REPLY_TARGET_KEY, nextTarget)
  if (pinned) replyTargetPinned.value = true
}

function selectChatTarget(target: ChatTarget) {
  if (target.state === 'starting') return
  setReplyTarget(target.id, true)
  if (target.id === 'bash') return
  const isLaunched = Boolean(target.terminalName && Array.isArray(ideState.value?.terminals) && ideState.value?.terminals?.some(
    terminal => String(terminal?.name ?? '').trim() === target.terminalName
  ))
  if (!cliList.value.some(cli => cli.id === target.id) || isLaunched) return
  launchCli(target.id)
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
  if (bridge.mode.value === 'relay') {
    const msgWorkspaceId = typeof msg.workspaceId === 'string' ? msg.workspaceId : ''
    if (msgWorkspaceId && msgWorkspaceId !== activeWorkspaceKey.value) return
  }
  if (msg.type === 'notification') {
    pendingNotifs.value.push({ id: Date.now().toString(), text: msg.text ?? '', tool: (msg.tool as string) ?? '', ts: Date.now() })
    pushActivity('ai', `Validation requise — ${shortText(msg.text ?? '', 70)}`)
  } else if (msg.type === 'chat_response' || msg.type === 'ai_message') {
    flushBufferedOutput((msg.tool as string) ?? 'agent')
    aiTyping.value = false
    if (!replyTargetPinned.value && isChatTargetId(msg.target)) {
      setReplyTarget(String(msg.target))
    }
    appendAiMessage(msg.text ?? '', msg.tool as string)
    saveWorkspaceChatHistory(activeWorkspaceKey.value, chatMessages.value)
    pushActivity('ai', shortText(msg.text ?? '', 70))
    nextTick(() => { if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight })
  } else if (msg.type === 'output' && msg.text) {
    aiTyping.value = false
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
  } else if (msg.type === 'clis_update' && Array.isArray(msg.clis)) {
    cliList.value = msg.clis as CliItem[]
  } else if (msg.type === 'projects_update' && Array.isArray(msg.projects)) {
    projectsList.value = msg.projects as ProjectItem[]
  } else if (msg.type === 'projects_list' && Array.isArray(msg.projects)) {
    projectsLoading.value = false
    projectsList.value = msg.projects as ProjectItem[]
  } else if (msg.type === 'cli_started') {
    const cliId = String(msg.cliId ?? '')
    cliLaunching.value[cliId] = false
    pushActivity('sys', `✓ ${String(msg.terminalName ?? cliId)} prêt`)
    if (cliId) setReplyTarget(cliId, true)
    if (activeTab.value !== 'chat') activeTab.value = 'chat'
  } else if (msg.type === 'terminal_closed') {
    pushActivity('sys', `Terminal fermé : ${String(msg.terminalName ?? '')}`)
    const terminalName = String(msg.terminalName ?? '')
    const closedCli = cliList.value.find(cli => `DevBridge ${cli.name}` === terminalName)
    if (closedCli && replyTarget.value === closedCli.id) {
      replyTargetPinned.value = false
      setReplyTarget('bash')
    }
  }
})

watch(() => bridge.status.value, (next) => {
  if (next === 'connected') {
    void loadFileTree()
    void bridge.fetchAgentStatus()
    void loadPreviewUrl()
    bridge.send({ type: 'get_preview_url' })
    if (bridge.mode.value === 'local') bridge.send({ type: 'get_pairing_code' })
    // Fetch CLI list and project list on connect
    const token = bridge.token.value ?? ''
    const base = bridge.activeUrl.value ?? currentAgentBaseUrl()
    if (base) {
      fetch(`${base}/clis`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json() as Promise<{ clis?: CliItem[] }>)
        .then(d => { if (d.clis) cliList.value = d.clis })
        .catch(() => {})
      void requestProjects()
    }
  }
}, { immediate: true })

watch(chatTargets, (targets) => {
  if (!targets.some((target) => target.id === replyTarget.value)) {
    replyTargetPinned.value = false
    replyTarget.value = 'bash'
  }
  if (!replyTarget.value && targets.length) {
    setReplyTarget('bash')
  }
}, { immediate: true })

watch(activeWorkspaceKey, (workspaceId) => {
  chatMessages.value = loadWorkspaceChatHistory(workspaceId)
  aiTyping.value = false
  nextTick(() => { if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight })
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
