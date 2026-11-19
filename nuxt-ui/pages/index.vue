<template>
  <div class="flex overflow-hidden" style="height:calc(100dvh - 3rem)">
    <!-- The QR opens the root on phones too. Complete the exchange before /mobile. -->
    <div v-if="mobilePairingState !== 'idle'" class="fixed inset-0 z-[80] flex items-center justify-center px-6"
      style="background:var(--bg);color:var(--text)">
      <section class="w-full max-w-md text-center">
        <p class="text-[10px] uppercase tracking-[0.25em] mb-6" style="color:var(--accent)">ViBridge / Connexion mobile</p>
        <h1 class="font-display text-2xl font-light mb-4">Ton espace de travail, sur ton téléphone.</h1>
        <p v-if="mobilePairingState === 'connecting'" role="status" class="text-sm" style="color:var(--text-mid)">
          Appairage avec le relais en cours…
        </p>
        <template v-else>
          <p role="alert" class="text-sm leading-6" style="color:var(--dot-red)">
            {{ pairError || 'Appairage impossible. Génère un nouveau QR depuis VS Code.' }}
          </p>
          <p class="text-xs mt-4 leading-5" style="color:var(--text-mid)">
            Un QR est temporaire et ne peut être utilisé qu'une fois. Reviens dans VS Code et relance « DevBridge: Show QR ».
          </p>
        </template>
      </section>
    </div>

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
                <span v-if="projectIsActive(proj.path, bridge.activeProjectPath.value)" class="shrink-0" style="color:var(--dot-amber)">★</span>
                <span class="truncate">{{ proj.name }}</span>
              </span>
              <span v-if="projectIsActive(proj.path, bridge.activeProjectPath.value)" class="text-[9px] uppercase tracking-[0.1em] shrink-0 ml-2" style="color:var(--muted)">actif</span>
              <div class="flex shrink-0 items-center gap-1 ml-2">
                <button v-if="!projectIsActive(proj.path, bridge.activeProjectPath.value)"
                  :disabled="Boolean(projectOpening[proj.path]) && projectOpening[proj.path] !== 'done'"
                  class="text-[9px] px-2 py-1 disabled:opacity-40"
                  style="border:1px solid var(--border);color:var(--text)"
                  title="Remplacer le dossier de la fenêtre VS Code sélectionnée"
                  @click="openProject(proj.path, proj.name, false)">
                  {{ projectOpening[proj.path] === 'replace' ? 'Ouverture…' : 'Ouvrir ici' }}
                </button>
                <button
                  :disabled="Boolean(projectOpening[proj.path]) && projectOpening[proj.path] !== 'done'"
                  class="text-[9px] px-2 py-1 disabled:opacity-40"
                  style="border:1px solid var(--border);color:var(--text)"
                  title="Créer une autre fenêtre VS Code sans fermer celle-ci"
                  @click="openProject(proj.path, proj.name, true)">
                  {{ projectOpening[proj.path] === 'parallel' ? 'Ouverture…' : 'En parallèle' }}
                </button>
              </div>
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
                :disabled="pairingQrBusy || !bridge.token.value"
                class="text-[10px] uppercase tracking-widest py-2 transition-colors disabled:opacity-30"
                style="border:1px solid var(--border);color:var(--text);background:none"
                @click="openPairingModal"
              >
                QR ▣
              </button>
            </ClientOnly>
          </div>
          <p v-if="pairingDisplayError" role="alert" class="px-7 mt-3 text-[11px]" style="color:var(--dot-red)">{{ pairingDisplayError }}</p>
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

          <WindowStrip :windows="bridge.windows.value" :selected-window-id="bridge.activeWindowId.value"
            :activity="bridge.windowActivity.value" @select="bridge.selectWindow" />

          <div class="px-4 mb-4">
            <WorkspaceSwitcher
              :workspaces="relayWorkspaceOptions"
              :active-workspace-id="bridge.activeWorkspaceId.value"
              :active-project-path="bridge.activeProjectPath.value"
              :projects="projectsList"
              :loading-projects="projectsLoading"
              :project-opening="projectOpening"
              @select="selectWorkspaceOrSession"
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
                  :disabled="pairingQrBusy || !bridge.token.value"
                  class="text-[10px] uppercase tracking-[0.1em] py-2.5 disabled:opacity-30"
                  style="background:var(--bg);color:var(--text)"
                  @click="openPairingModal"
                >
                  QR ▣
                </button>
              </ClientOnly>
            </div>
          </div>
        </div>

        <!-- CHAT tab -->
        <div v-show="activeTab === 'chat'" class="absolute inset-0 flex flex-col">
          <WindowStrip :windows="bridge.windows.value" :selected-window-id="bridge.activeWindowId.value"
            :activity="bridge.windowActivity.value" @select="bridge.selectWindow" />
          <div class="shrink-0 px-4 py-3" style="border-bottom:1px solid var(--border)">
            <WorkspaceSwitcher
              :workspaces="relayWorkspaceOptions"
              :active-workspace-id="bridge.activeWorkspaceId.value"
              :active-project-path="bridge.activeProjectPath.value"
              :projects="projectsList"
              :loading-projects="projectsLoading"
              :project-opening="projectOpening"
              @select="selectWorkspaceOrSession"
              @open-project="requestProjects"
              @request-projects="requestProjects"
              @open-listed-project="openListedProject"
            />
          </div>
          <div v-if="bridge.projectTransition.value" class="shrink-0 px-4 py-2 text-[11px]" role="status"
            style="background:var(--surface2);border-bottom:1px solid var(--border)">
            Ouverture de {{ projectName(bridge.projectTransition.value.path) }} dans VS Code.
            Réponses suspendues jusqu'à confirmation.
          </div>
          <div ref="chatScroll" class="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            <ChatBubble
              v-for="m in filteredChatMessages"
              :key="m.id"
              :text="m.text"
              :direction="m.direction"
              :tool="m.tool"
              :ts="m.ts"
              :show-quick-replies="m.direction === 'ai' && m.id === lastFilteredAiMessageId"
              @quick-reply="sendQuickReply"
            />
            <TypingIndicator v-if="aiTyping" />
          </div>
          <div class="shrink-0 p-3" style="border-top:1px solid var(--border);background:var(--bg)">
            <div class="text-[9px] uppercase tracking-[0.12em] mb-2" style="color:var(--muted)">
              Dans {{ bridge.activeProjectName.value || 'aucun projet synchronisé' }} · Réponse vers {{ replyTargetLabel }}
            </div>
            <div class="flex items-center gap-2 mb-2">
              <label for="vibridge-terminal" class="shrink-0 text-[10px]" style="color:var(--muted)">Terminal</label>
              <select id="vibridge-terminal"
                :value="terminalTargets.some(t => t.id === replyTarget) ? replyTarget : ''"
                :disabled="Boolean(bridge.projectTransition.value)"
                class="min-w-0 flex-1 px-2 py-2 text-[11px] outline-none"
                style="background:var(--surface);color:var(--text);border:1px solid var(--border)"
                @change="chooseTerminalFromSelect">
                <option value="">Choisir un terminal…</option>
                <option v-for="target in terminalTargets" :key="target.id" :value="target.id">
                  {{ target.label }} · {{ target.caption }}
                </option>
              </select>
              <button :disabled="creatingTerminal || Boolean(bridge.projectTransition.value)"
                class="shrink-0 px-3 py-2 text-xs disabled:opacity-30"
                style="border:1px solid var(--border);color:var(--text)"
                title="Créer un terminal dans cette fenêtre"
                @click="createNewTerminal">+ Terminal</button>
            </div>
            <details class="mb-3 text-[10px]" style="color:var(--muted)">
              <summary class="cursor-pointer py-1">Lancer un outil (Codex, AGY, Claude…)</summary>
              <div class="flex flex-wrap gap-2 pt-2">
                <button v-for="cli in cliList.filter(cli => cli.detected)" :key="cli.id"
                  :disabled="Boolean(cliLaunching[cli.id]) || Boolean(bridge.projectTransition.value)"
                  class="px-3 py-2 text-[10px] disabled:opacity-30"
                  style="border:1px solid var(--border);color:var(--text)"
                  @click="launchCli(cli.id)">
                  {{ cliLaunching[cli.id] ? 'Démarrage…' : cli.name }}
                </button>
                <span v-if="!cliList.some(cli => cli.detected)">Aucun outil détecté</span>
              </div>
            </details>
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
          <!-- Codebase root list -->
          <div class="shrink-0" style="border-bottom:1px solid var(--border)">
            <div class="px-4 py-2 flex items-center justify-between" style="border-bottom:1px solid var(--border)">
              <p class="text-[9px] uppercase tracking-[0.2em]" style="color:var(--muted)">Racine du projet</p>
            </div>
            <div class="overflow-y-auto" style="max-height:160px">
              <div
                v-for="(entry, i) in codebaseRootEntries" :key="entry.path"
                class="flex items-center justify-between px-4 py-2 text-[11px]"
                :style="i < codebaseRootEntries.length - 1 ? 'border-bottom:1px solid var(--border)' : ''"
              >
                <span class="flex items-center gap-1.5 truncate">
                  <span :style="entry.type === 'dir' ? 'color:var(--dot-amber)' : 'color:var(--muted)'">
                    {{ entry.type === 'dir' ? '▣' : '·' }}
                  </span>
                  <span class="truncate">{{ entry.name }}</span>
                </span>
                <button
                  v-if="entry.type === 'file'"
                  class="text-[9px] uppercase tracking-widest px-2 py-1 shrink-0 ml-2 transition-colors disabled:opacity-40"
                  :style="selectedFile === entry.path
                    ? 'border:1px solid var(--text);color:var(--text);background:none'
                    : 'border:1px solid var(--border);color:var(--text);background:none'"
                  @click="openCodeFile(entry.path)"
                >
                  {{ selectedFile === entry.path ? 'actif' : 'ouvrir' }}
                </button>
                <span v-else class="text-[9px] shrink-0 ml-2" style="color:var(--muted)">dossier</span>
              </div>
              <p v-if="!codebaseRootEntries.length" class="px-4 py-3 text-[10px]" style="color:var(--muted)">
                {{ bridge.status.value !== 'connected' ? '— Non connecté —' : fileTreeTimedOut ? '— Aucun fichier —' : '— Chargement… —' }}
              </p>
            </div>
          </div>
          <div class="flex shrink-0 mx-4 mt-4" style="border:1px solid var(--border)">
            <input
              v-model="fileQuery"
              type="text"
              placeholder="Rechercher un fichier…"
              class="flex-1 text-[11px] px-3.5 py-2.5 outline-none text-text"
              style="background:none;border:none;font-family:inherit"
            />
            <button class="w-10 flex items-center justify-center text-sm" style="border-left:1px solid var(--border);color:var(--muted)" @click="loadFileTree">↺</button>
          </div>
          <div class="px-4 py-2 text-[9px] uppercase tracking-[0.12em]" style="color:var(--muted)">
            {{ selectedFile ? `Lecture de ${selectedFile}` : 'Sélectionnez un fichier pour lire son contenu' }}
          </div>
          <div class="min-h-0 flex-1 flex flex-col">
            <div class="basis-[42%] min-h-0 overflow-y-auto text-[11px]">
              <FileTree v-if="filteredFileTree.length" :nodes="filteredFileTree" @select="openCodeFile" />
              <p v-else class="px-5 py-4" style="color:var(--muted)">
                {{ bridge.status.value !== 'connected' ? '— Non connecté —' : fileTreeTimedOut ? '— Aucun fichier —' : '— Chargement… —' }}
              </p>
            </div>
            <div class="shrink-0 mx-4" style="border-top:1px solid var(--border)"></div>
            <div class="basis-[58%] min-h-0 overflow-y-auto px-4 py-3">
              <p v-if="selectedFileLoading" class="text-[10px] uppercase tracking-[0.12em]" style="color:var(--muted)">Chargement…</p>
              <pre v-else-if="selectedFileContent" class="text-[11px] leading-relaxed whitespace-pre-wrap break-words" style="color:var(--text);font-family:var(--font-mono)">{{ selectedFileContent }}</pre>
              <p v-else-if="selectedFileError" class="text-[10px] uppercase tracking-[0.12em]" style="color:var(--dot-red)">{{ selectedFileError }}</p>
              <p v-else class="text-[10px] uppercase tracking-[0.12em]" style="color:var(--muted)">— Aucun fichier sélectionné —</p>
            </div>
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
            <p class="text-sm mt-0.5">Scanne ce QR depuis le téléphone à connecter.</p>
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
            <p v-if="bridge.mode.value === 'relay'">Attention : connecter un autre téléphone remplace la connexion mobile précédente.</p>
          </div>
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup lang="ts">
import { projectIsActive, projectName } from '~/composables/projectContext'

import { renderSVG } from 'uqr'
import { hasPairingInvitation } from '~/utils/pairingRoute'
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

// ── Debounce helpers ─────────────────────────────────────
function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: unknown[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; fn(...args) }, ms)
  }) as unknown as T
}
const debouncedLoadFileTree = debounce(() => void loadFileTree(), 800)
const debouncedFetchAgentStatus = debounce(() => void bridge.fetchAgentStatus(), 500)
const debouncedLoadPreviewUrl = debounce(() => void loadPreviewUrl(), 2000)
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
const activeWorkspaceLabel = computed(() => bridge.activeProjectName.value
  || bridge.activeWorkspace.value?.name
  || (bridge.mode.value === 'relay' ? 'Projet non synchronisé' : 'Workspace local'))
const activeWorkspaceKey = bridge.chatHistoryKey
function resolveWorkspaceName(workspace: { id: string; name: string }): string {
  // Only the live IDE snapshot can name the project being controlled.
  return workspace.id === bridge.activeWorkspaceId.value && bridge.activeProjectName.value
    ? bridge.activeProjectName.value : workspace.name
}
const relayWorkspaceOptions = computed(() => bridge.mode.value === 'relay'
  ? (bridge.relayWorkspaces.value.length
      ? bridge.relayWorkspaces.value.map(w => ({ id: w.id, name: resolveWorkspaceName(w), active: w.id === bridge.activeWorkspaceId.value }))
      : bridge.relaySessions.value.map(session => ({
          id: session.id,
          name: session.label,
          active: session.id === bridge.relaySessionId.value,
        })))
  : [{ id: 'local', name: 'Workspace local', active: true }])
const activeProjectLabel = computed(() => {
  const workspace = Array.isArray(ideState.value?.workspaceFolders) ? ideState.value?.workspaceFolders[0] : ''
  if (workspace) return shortText(lastPathSegment(String(workspace)), 26)
  return 'Projet non synchronisé'
})
const projectRootLabel = computed(() => {
  const activeFile = ideState.value?.activeFile
  if (typeof activeFile === 'string' && activeFile) return shortText(activeFile, 42)
  return bridge.activeProjectPath.value || 'Aucun dossier VS Code confirmé'
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

function selectWorkspaceOrSession(id: string) {
  if (bridge.mode.value === 'relay' && !bridge.relayWorkspaces.value.length && bridge.relaySessions.value.length) {
    void bridge.switchRelaySession(id)
    return
  }
  bridge.setActiveWorkspace(id)
}

// ── CLI Registry ───────────────────────────────────────
interface CliItem { id: string; name: string; command: string; args: string[]; detected: boolean; isDefault: boolean; isCustom: boolean }
const cliList = ref<CliItem[]>([])
const cliLaunching = ref<Record<string, boolean>>({})

function launchCli(cliId: string) {
  if (cliLaunching.value[cliId] || bridge.projectTransition.value) return
  cliLaunching.value[cliId] = true
  if (!bridge.send({ type: 'start_cli', cliId })) {
    cliLaunching.value[cliId] = false
    return
  }
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

function targetSupportLabel(target: ChatTarget) {
  if (target.support === 'direct') return 'direct'
  if (target.support === 'vscode') return 'VS Code'
  return 'lanceur'
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
  return id.startsWith('terminal:')
    && terminalTargets.value.some(terminal => terminal.id === id)
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
const selectedFileContent = ref('')
const selectedFileLoading = ref(false)
const selectedFileError = ref('')
const fileQuery = ref('')
const previewUrl = ref('')

// Projects list
interface ProjectItem { name: string; path: string; isActive: boolean }
const projectsList = ref<ProjectItem[]>([])
const projectsLoading = ref(false)
const projectOpening = ref<Record<string, string>>({})
const projectsTimedOut = ref(false)
const fileTreeTimedOut = ref(false)

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

async function openProject(projPath: string, projName: string, newWindow = false) {
  if (bridge.mode.value === 'relay') {
    if (!bridge.requestOpenProject(projPath, newWindow)) {
      pushActivity('err', 'Ouverture impossible : projet en cours de changement ou agent indisponible')
      return
    }
    projectOpening.value[projPath] = newWindow ? 'parallel' : 'replace'
    pushActivity('sys', newWindow
      ? `Ouverture en parallèle demandée pour ${projName}. La fenêtre contrôlée ne change pas automatiquement.`
      : `Ouverture de ${projName} demandée. En attente de la confirmation VS Code.`)
    if (newWindow) setTimeout(() => { delete projectOpening.value[projPath] }, 4_000)
    return
  }
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
      pushActivity('sys', `Demande d'ouverture de ${projName} acceptée par l'agent local`)
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
const mobilePairingState = ref<'idle' | 'connecting' | 'error'>('idle')
const currentPairingCode = ref('')
const freshRelayPairingUrl = ref('')
const pairingQrBusy = ref(false)
const pairingDisplayError = ref('')
const showQrModal = ref(false)
const preIssuedWorkspace = ref('')

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

const pairingUrl = computed(() => {
  if (bridge.mode.value === 'relay' && freshRelayPairingUrl.value) {
    return freshRelayPairingUrl.value
  }
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
    const res = await fetch(`${currentAgentBaseUrl()}/pairing-code`, { headers: { Authorization: `Bearer ${bridge.token.value}` } })
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
      `${currentAgentBaseUrl()}/pairing-url?uiHost=${encodeURIComponent(String(config.public.agentHost))}&uiPort=${uiPort}`,
      { headers: { Authorization: `Bearer ${bridge.token.value}` } },
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
    try {
      const token = bridge.token.value ?? ''
      const relayBase = bridge.relayUrl.value || configuredRelayUrl.value
      const workspaceId = bridge.activeWorkspaceId.value
      const windowId = bridge.activeWindowId.value
      if (!windowId && bridge.windows.value.length > 1) {
        fileTree.value = []
        return
      }
      if (relayBase && bridge.relaySessionId.value) {
        const res = await fetch(
          `${relayBase}/api/relay/sessions/${bridge.relaySessionId.value}/files?workspaceId=${encodeURIComponent(workspaceId)}&windowId=${encodeURIComponent(windowId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (res.ok) {
          const data = await res.json() as { tree?: FileNode[] }
          if (Array.isArray(data.tree)) {
            if (windowId !== bridge.activeWindowId.value) return
            fileTree.value = data.tree
            return
          }
        }
      }
    } catch {
      // fall back to the latest cached snapshot below
    }
    // Never show the last focused window's cached tree for another window.
    if (!bridge.activeWindowId.value) {
      const snapshotTree = bridge.agentStatus.value?.fileTree as FileNode[] | undefined
      fileTree.value = Array.isArray(snapshotTree) ? snapshotTree : []
    } else fileTree.value = []
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

function filterFileNodes(nodes: FileNode[], query: string): FileNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return nodes
  return nodes.flatMap((node) => {
    if (node.type === 'file') {
      return node.path.toLowerCase().includes(needle) || node.name.toLowerCase().includes(needle) ? [node] : []
    }
    const children = filterFileNodes(node.children ?? [], needle)
    if (children.length || node.name.toLowerCase().includes(needle)) {
      return [{ ...node, children }]
    }
    return []
  })
}

const filteredFileTree = computed(() => filterFileNodes(fileTree.value, fileQuery.value))

async function loadSelectedFileContent(path: string) {
  selectedFile.value = path
  selectedFileLoading.value = true
  selectedFileError.value = ''
  selectedFileContent.value = ''

  if (bridge.mode.value === 'relay') {
    try {
      const token = bridge.token.value ?? ''
      const relayBase = bridge.relayUrl.value || configuredRelayUrl.value
      const workspaceId = bridge.activeWorkspaceId.value
      const windowId = bridge.activeWindowId.value
      const res = await fetch(
        `${relayBase}/api/relay/sessions/${bridge.relaySessionId.value}/files?workspaceId=${encodeURIComponent(workspaceId)}&windowId=${encodeURIComponent(windowId)}&path=${encodeURIComponent(path)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) {
        selectedFileError.value = `[ERREUR ${res.status}]`
        return
      }
      const data = await res.json() as { content?: string }
      if (windowId !== bridge.activeWindowId.value) return
      selectedFileContent.value = data.content ?? ''
      return
    } catch {
      selectedFileError.value = '[IMPOSSIBLE DE CHARGER]'
      return
    } finally {
      selectedFileLoading.value = false
    }
  }

  try {
    const token = bridge.token.value ?? ''
    const res = await fetch(`${currentAgentBaseUrl()}/files/${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      selectedFileError.value = `[ERREUR ${res.status}]`
      return
    }
    const data = await res.json() as { content?: string }
    selectedFileContent.value = data.content ?? ''
  } catch {
    selectedFileError.value = '[IMPOSSIBLE DE CHARGER]'
  } finally {
    selectedFileLoading.value = false
  }
}

function openCodeFile(path: string) {
  void loadSelectedFileContent(path)
}

async function loadPreviewUrl() {
  if (bridge.mode.value === 'relay') {
    // The old preview detector is global to the agent, not scoped to a VS Code
    // window. Hide it rather than show project B's localhost URL under project A.
    previewUrl.value = bridge.windows.value.length > 1
      ? '' : String(bridge.agentStatus.value?.previewUrl ?? '')
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
  } else if (mobilePairingState.value !== 'connecting') {
    // The phone should navigate immediately after a successful token exchange.
    // Desktop-only status/preview requests must not block the QR workflow.
    await loadFileTree()
    await bridge.fetchAgentStatus()
    await loadPreviewUrl()
    await loadPairingCode()
  }
}
async function openPairingModal() {
  await refreshPairing()
  if (pairingQrSvg.value && !pairingDisplayError.value) {
    showQrModal.value = true
  }
}

async function refreshPairing() {
  if (pairingQrBusy.value) return
  pairingQrBusy.value = true
  pairingDisplayError.value = ''
  try {
    if (bridge.mode.value === 'relay') {
      const relayBaseUrl = bridge.relayUrl.value || configuredRelayUrl.value
      const token = bridge.token.value
      if (!relayBaseUrl || !token) throw new Error('relay not connected')
      // Explicit user action only. The relay never publishes this code in snapshots.
      const response = await fetch(`${relayBaseUrl.replace(/\/$/, '')}/api/relay/pairing-code`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('pairing code unavailable')
      const payload = await response.json() as { qrUrl?: string; pairingCode?: string }
      if (!payload.qrUrl || !/^\d{6}$/.test(payload.pairingCode || '')) {
        throw new Error('invalid pairing response')
      }
      freshRelayPairingUrl.value = payload.qrUrl
      currentPairingCode.value = payload.pairingCode
    } else {
      freshRelayPairingUrl.value = ''
      await loadPairingCode()
      if (!pairingQrSvg.value) throw new Error('pairing invitation unavailable')
    }
  } catch {
    freshRelayPairingUrl.value = ''
    currentPairingCode.value = ''
    pairingDisplayError.value = 'Impossible de générer un QR. Vérifie la connexion à l’agent ou au relais.'
  } finally {
    pairingQrBusy.value = false
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

  // Local QR invitation exchange
  if (preIssuedToken && (agentUrl || (host && port))) {
    const effectiveAgentUrl = agentUrl || `http://${host}:${port}`
    if (!await bridge.connectWithToken(effectiveAgentUrl, preIssuedToken)) {
      pairError.value = 'Ce QR code a expiré ou a déjà été utilisé. Génère un nouveau QR code dans VS Code.'
    }
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

  // Keep an already valid connection to this same session, without
  // consuming a one-time QR. But never reuse a *stale* token blindly:
  // another device may have replaced its credential in the meantime.
  if (hasExplicitPairing && relayFlag === '1' && routeSessionId
    && localStorage.getItem('vb:relaySessionId') === routeSessionId
    && localStorage.getItem('vb:bridgeMode') === 'relay') {
    const storedToken = localStorage.getItem('vb:token')
    if (storedToken) {
      try {
        const response = await fetch(`${routeRelayUrl}/api/relay/sessions/${encodeURIComponent(routeSessionId)}`, {
          headers: { Authorization: `Bearer ${storedToken}` },
          signal: AbortSignal.timeout(5000),
        })
        if (response.ok) {
          await router.replace({ query: { view: targetView || 'mobile' } })
          return
        }
      } catch {
        // Connectivity/authentication errors must not mask a fresh QR.
      }
    }
  }
  if (!hasExplicitPairing && bridge.token.value) return

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
  // This heuristic notification is not a structured CLI approval.
  activeTab.value = 'chat'
  return
  removeNotif(id)
  activity.value.unshift({ id: Date.now().toString(), ts: Date.now(), tag: action === 'validate' ? 'user' : 'sys', text: `${action === 'validate' ? 'Validé' : 'Refusé'} — ${n?.text.slice(0, 60) ?? ''}` })
}

// Quick actions
const quickActions = computed(() => [
  { icon: '⌨', label: 'Nouvelle instruction', action: () => { activeTab.value = 'chat' } },
  { icon: '▣', label: 'Preview app', action: previewUrl.value ? () => { activeTab.value = 'preview' } : undefined },
  // Generic remote shell actions are forbidden by host policy: do not show unusable buttons.
  { icon: '⚙', label: 'Paramètres',           action: () => { void router.push('/settings') } },
])

// Chat
interface ChatMsg { id: string; text: string; direction: 'user' | 'ai'; tool?: string; target?: string; ts: number }
type ChatTargetState = 'idle' | 'starting' | 'active'
type ChatTargetKind = 'terminal' | 'vscode' | 'launcher'
interface ChatTarget {
  id: string
  label: string
  caption: string
  support: 'direct' | 'vscode' | 'launcher'
  kind: ChatTargetKind
  terminalName?: string
  cliId?: string
  state: ChatTargetState
}
const chatMessages = ref<ChatMsg[]>([])
const chatDraft  = ref('')
const aiTyping   = ref(false)
let aiTypingTimeout: ReturnType<typeof setTimeout> | null = null
let aiTypingDeadline = 0
let chatHistorySaveTimer: ReturnType<typeof setTimeout> | null = null

function setAiTyping(value: boolean) {
  aiTyping.value = value
  if (aiTypingTimeout) { clearTimeout(aiTypingTimeout); aiTypingTimeout = null }
  if (value) {
    const now = Date.now()
    // First activation sets a hard 30s deadline; subsequent ai_typing events
    // only refresh the timer up to that deadline so it can't spin forever.
    if (!aiTypingDeadline) aiTypingDeadline = now + 30_000
    const remaining = Math.max(aiTypingDeadline - now, 0)
    if (remaining === 0) {
      aiTyping.value = false
      aiTypingDeadline = 0
      appendAiMessage('Pas de réponse', 'timeout')
      return
    }
    aiTypingTimeout = setTimeout(() => {
      aiTyping.value = false
      aiTypingDeadline = 0
      appendAiMessage('Pas de réponse', 'timeout')
    }, remaining)
  } else {
    aiTypingDeadline = 0
  }
}

const creatingTerminal = ref(false)
const chatScroll = ref<HTMLElement | null>(null)
const REPLY_TARGET_KEY = 'vb:chatTarget'
const replyTarget = ref('')
const pendingTerminalSelection = ref('')
function targetStorageKey(): string {
  return `${REPLY_TARGET_KEY}:${bridge.projectContextKey.value}`
}
const replyTargetPinned = ref(false)
const replyTargetLabel = computed(() => {
  const target = terminalTargets.value.find((item) => item.id === replyTarget.value)
  return target ? `${target.label} · ${target.caption}` : 'aucun terminal sélectionné'
})
const chatTargets = computed<ChatTarget[]>(() => {
  const terminals = Array.isArray(ideState.value?.terminals) ? ideState.value?.terminals : []
  const targets: ChatTarget[] = []
  const seenTerminalNames = new Set<string>()

  for (const terminal of terminals) {
    const terminalName = String(terminal?.name ?? '').trim()
    const terminalKey = String(terminal?.id ?? terminalName).trim()
    if (!terminalName || !terminalKey || seenTerminalNames.has(terminalKey)) continue
    seenTerminalNames.add(terminalKey)
    const cwd = typeof terminal?.cwd === 'string' ? terminal.cwd : ''
    targets.push({
      id: `terminal:${terminalKey}`,
      label: terminalName,
      caption: cwd ? `terminal direct · ${lastPathSegment(cwd)}` : 'terminal direct',
      support: 'direct',
      kind: 'terminal',
      terminalName,
      state: replyTarget.value === `terminal:${terminalKey}` ? 'active' : 'idle',
    })
  }

  // Only existing terminal instances are valid reply channels.
  // CLI launchers are actions, displayed separately in the composer.
  return targets
})

const terminalTargets = computed(() => chatTargets.value.filter(target => target.kind === 'terminal'
  && target.id.startsWith('terminal:')))

const selectedChatTargetReady = computed(() => Boolean(!bridge.projectTransition.value
  && terminalTargets.value.some(target => target.id === replyTarget.value)))

function chooseTerminalFromSelect(event: Event) {
  const chosen = (event.target as HTMLSelectElement).value
  if (!terminalTargets.value.some(target => target.id === chosen)) return
  setReplyTarget(chosen, true)
}

const filteredChatMessages = computed(() => {
  const target = replyTarget.value
  return chatMessages.value.filter(m => !m.target || m.target === target)
})

const codebaseRootEntries = computed(() => fileTree.value)

const lastFilteredAiMessageId = computed(() => {
  for (let idx = filteredChatMessages.value.length - 1; idx >= 0; idx -= 1) {
    if (filteredChatMessages.value[idx]?.direction === 'ai') return filteredChatMessages.value[idx]!.id
  }
  return ''
})

function sendChat() {
  const text = chatDraft.value.trim()
  if (!text || !selectedChatTargetReady.value) return
  if (!bridge.send({
    type: 'message',
    text,
    target: replyTarget.value,
    sendEnter: true,
  })) return
  appendUserChatMessage(text)
  pushActivity('user', `Instruction transmise — ${shortText(text, 70)}`)
  chatDraft.value = ''
  setAiTyping(true)
  nextTick(() => { if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight })
}

function appendUserChatMessage(text: string) {
  chatMessages.value.push({ id: Date.now().toString(), direction: 'user', text, target: replyTarget.value, ts: Date.now() })
  scheduleChatHistorySave()
}

function sendQuickReply(value: string) {
  if (!value || !selectedChatTargetReady.value) return
  if (!bridge.send({
    type: 'message',
    text: value,
    target: replyTarget.value,
    sendEnter: true,
  })) return
  appendUserChatMessage(value)
  pushActivity('user', `Réponse rapide — ${value}`)
  setAiTyping(true)
  nextTick(() => { if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight })
}

function requestOpenProject() {
  void requestProjects()
  pushActivity('sys', 'Chargement de la liste des projets')
}

function appendAiMessage(text: string, tool?: string, merge = false, target?: string) {
  const clean = stripAnsi(text).trim()
  if (!clean) return
  const msgTarget = target || replyTarget.value
  const last = chatMessages.value.at(-1)
  if (merge && last && last.direction === 'ai' && last.tool === tool && last.target === msgTarget && Date.now() - last.ts < 1500) {
    last.text = `${last.text}${last.text.endsWith('\n') ? '' : '\n'}${clean}`
    last.ts = Date.now()
    scheduleChatHistorySave()
    return
  }
  chatMessages.value.push({ id: Date.now().toString(), direction: 'ai', text: clean, tool, target: msgTarget, ts: Date.now() })
  scheduleChatHistorySave()
}

function setReplyTarget(nextTarget: string, pinned = false) {
  if (!nextTarget) return
  replyTarget.value = nextTarget
  if (import.meta.client && bridge.projectContextKey.value) localStorage.setItem(targetStorageKey(), nextTarget)
  if (pinned) replyTargetPinned.value = true
}

function createNewTerminal() {
  const existing = new Set(
    (Array.isArray(ideState.value?.terminals) ? ideState.value!.terminals! : [])
      .map(t => String((t as { name?: string }).name ?? '').trim())
      .filter(Boolean),
  )
  let idx = 1
  while (existing.has(`DevBridge ${idx}`)) idx += 1
  const terminalName = `DevBridge ${idx}`
  creatingTerminal.value = true
  if (!bridge.send({ type: 'create_terminal', terminalName, payload: { terminalName } })) {
    creatingTerminal.value = false
    return
  }
  // Wait for terminal_created with its actual instance ID before selecting it.
  setTimeout(() => { creatingTerminal.value = false }, 3_000)
}

function selectChatTarget(target: ChatTarget) {
  if (target.state === 'starting' || bridge.projectTransition.value) return
  setReplyTarget(target.id, true)
  if (target.kind === 'terminal' && target.terminalName) {
    bridge.send({ type: 'focus_terminal', terminalName: target.terminalName,
      terminalId: target.id.startsWith('terminal:') ? target.id.slice('terminal:'.length) : undefined,
      payload: { terminalName: target.terminalName } })
    return
  }
  if (target.kind !== 'launcher') return
  const existingTerminal = target.terminalName && Array.isArray(ideState.value?.terminals)
    ? ideState.value.terminals.find(t => t.name === target.terminalName) : null
  if (existingTerminal) {
    // CLI is a launcher, not a reply channel. Reply to the actual terminal ID.
    const terminalId = String(existingTerminal.id ?? existingTerminal.name)
    setReplyTarget(`terminal:${terminalId}`, true)
    bridge.send({ type: 'focus_terminal', terminalId, terminalName: existingTerminal.name })
    return
  }
  if (target.cliId) launchCli(target.cliId)
}

function scheduleChatHistorySave() {
  if (chatHistorySaveTimer) clearTimeout(chatHistorySaveTimer)
  const workspaceKey = activeWorkspaceKey.value
  const messages = chatMessages.value
  chatHistorySaveTimer = setTimeout(() => {
    saveWorkspaceChatHistory(workspaceKey, messages)
    chatHistorySaveTimer = null
  }, 180)
}

function pushStreamingOutput(text: string, tool?: string, target?: string) {
  appendAiMessage(text, tool, true, target)
  debouncedLoadPreviewUrl()
  nextTick(() => { if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight })
}

function queueOutputChunk(text: string, tool?: string, target?: string) {
  pushStreamingOutput(text, tool, target)
}

// WS
const offMsg = bridge.onMessage((msg: WsMessage) => {
  if (bridge.mode.value === 'relay') {
    const msgWorkspaceId = typeof msg.workspaceId === 'string' ? msg.workspaceId : ''
    if (msgWorkspaceId && msgWorkspaceId !== bridge.activeWorkspaceId.value) return
  }
  if (msg.type === 'notification') {
    pendingNotifs.value.push({ id: Date.now().toString(), text: msg.text ?? '', tool: (msg.tool as string) ?? '', ts: Date.now() })
    pushActivity('ai', `Validation requise — ${shortText(msg.text ?? '', 70)}`)
  } else if (msg.type === 'chat_response' || msg.type === 'ai_message') {
    setAiTyping(false)
    if (!replyTargetPinned.value && isChatTargetId(msg.target)) {
      setReplyTarget(String(msg.target))
    }
    appendAiMessage(msg.text ?? '', msg.tool as string, false, typeof msg.target === 'string' ? msg.target : undefined)
    pushActivity('ai', shortText(msg.text ?? '', 70))
    nextTick(() => { if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight })
  } else if (msg.type === 'output' && msg.text) {
    setAiTyping(false)
    const tool = typeof msg.tool === 'string' ? msg.tool : undefined
    queueOutputChunk(msg.text, tool, tool?.startsWith('terminal:') ? tool : undefined)
  } else if (msg.type === 'adapter_exit') {
    setAiTyping(false)
    pushActivity('err', `${String(msg.tool ?? 'adapter')} exited`)
    debouncedFetchAgentStatus()
  } else if (msg.type === 'ai_typing') {
    setAiTyping(true)
  } else if (msg.type === 'event') {
    pushActivity('sys', (msg.event as string) ?? msg.type)
    if (String(msg.event ?? '').startsWith('active_adapter:')) {
      debouncedFetchAgentStatus()
    }
  } else if (msg.type === 'ide_snapshot') {
    const state = (msg.state as Record<string, unknown> | undefined) ?? {}
    const activeFile = String(state.activeFile ?? '')
    const activeTerminal = String(state.activeTerminal ?? '')
    pushActivity('sys', `IDE synchronisé — ${shortText(activeFile || activeTerminal || 'snapshot reçu', 70)}`)
    debouncedFetchAgentStatus()
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
    void bridge.fetchRelaySessions()
  } else if (msg.type === 'dev_server_url') {
    previewUrl.value = String(msg.url ?? '')
    if (previewUrl.value) pushActivity('sys', `Preview détectée — ${shortText(previewUrl.value, 70)}`)
  } else if (msg.type === 'file_changed') {
    pushActivity('sys', `Fichier changé — ${String(msg.path ?? '')}`)
    debouncedLoadFileTree()
    if (selectedFile.value && String(msg.path ?? '') === selectedFile.value) {
      void loadSelectedFileContent(selectedFile.value)
    }
  } else if (msg.type === 'clis_update' && Array.isArray(msg.clis)) {
    cliList.value = msg.clis as CliItem[]
  } else if (msg.type === 'projects_update' && Array.isArray(msg.projects)) {
    projectsLoading.value = false
    projectsList.value = msg.projects as ProjectItem[]
  } else if (msg.type === 'projects_list' && Array.isArray(msg.projects)) {
    projectsLoading.value = false
    projectsList.value = msg.projects as ProjectItem[]
  } else if (msg.type === 'projects_list') {
    const payload = typeof msg.payload === 'object' && msg.payload ? msg.payload as { projects?: ProjectItem[] } : {}
    projectsLoading.value = false
    projectsList.value = Array.isArray(payload.projects) ? payload.projects : []
  } else if (msg.type === 'cli_started') {
    const cliId = String(msg.cliId ?? '')
    cliLaunching.value[cliId] = false
    pushActivity('sys', `Commande de lancement transmise : ${String(msg.terminalName ?? cliId)}. État CLI à confirmer.`)
    if (msg.terminalId) pendingTerminalSelection.value = `terminal:${String(msg.terminalId)}`
    else pushActivity('sys', 'Terminal créé, en attente de son identifiant réel')
    if (activeTab.value !== 'chat') activeTab.value = 'chat'
  } else if (msg.type === 'terminal_created') {
    const terminalName = String(msg.terminalName ?? '')
    creatingTerminal.value = false
    pushActivity('sys', `✓ Terminal ${terminalName} créé`)
    if (msg.terminalId) pendingTerminalSelection.value = `terminal:${String(msg.terminalId)}`
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
  if (next === 'disconnected' && aiTyping.value) {
    setAiTyping(false)
  }
  if (next === 'connected') {
    // Stagger network requests to avoid overwhelming the connection
    void bridge.fetchAgentStatus()
    bridge.send({ type: 'get_preview_url' })
    if (bridge.mode.value === 'local') bridge.send({ type: 'get_pairing_code' })
    // Defer heavier fetches
    setTimeout(() => { void loadFileTree() }, 100)
    setTimeout(() => { void loadPreviewUrl() }, 200)
    if (bridge.mode.value === 'relay') setTimeout(() => { void bridge.fetchRelaySessions() }, 300)
    const token = bridge.token.value ?? ''
    const base = bridge.activeUrl.value ?? currentAgentBaseUrl()
    if (base) {
      setTimeout(() => {
        fetch(`${base}/clis`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json() as Promise<{ clis?: CliItem[] }>)
          .then(d => { if (d.clis) cliList.value = d.clis })
          .catch(() => {})
      }, 400)
      setTimeout(() => { void requestProjects() }, 500)
    }
  }
}, { immediate: true })

watch(terminalTargets, (targets) => {
  if (pendingTerminalSelection.value && targets.some(t => t.id === pendingTerminalSelection.value)) {
    setReplyTarget(pendingTerminalSelection.value, true)
    pendingTerminalSelection.value = ''
  }
  if (replyTarget.value && !targets.some(t => t.id === replyTarget.value)) {
    replyTargetPinned.value = false
    replyTarget.value = ''
  }
}, { immediate: true })

watch(() => bridge.projectContextKey.value, (scope) => {
  replyTargetPinned.value = false
  const saved = import.meta.client && scope ? localStorage.getItem(targetStorageKey()) : null
  const activeId = bridge.agentStatus.value?.ideState?.activeTerminalId
  replyTarget.value = saved || (activeId ? `terminal:${activeId}` : '')
}, { immediate: true })

watch(() => bridge.projectTransition.value, (pending, previous) => {
  if (pending || !previous) return
  if (projectIsActive(previous.path, bridge.activeProjectPath.value)) {
    projectOpening.value[previous.path] = 'done'
    pushActivity('sys', `Projet actif confirmé : ${projectName(previous.path)}`)
    setTimeout(() => { delete projectOpening.value[previous.path] }, 2_000)
    void requestProjects()
    void loadFileTree()
  } else {
    delete projectOpening.value[previous.path]
    pushActivity('err', 'Le changement de projet n’a pas été confirmé par VS Code')
  }
})

watch(() => bridge.activeWindowId.value, () => {
  fileTree.value = []
  selectedFile.value = null
  selectedFileContent.value = ''
  previewUrl.value = ''
  if (bridge.status.value === 'connected') {
    void requestProjects()
    void loadFileTree()
  }
})

watch(() => bridge.activeProjectPath.value, (next, previous) => {
  if (next && next !== previous && bridge.status.value === 'connected') {
    void requestProjects()
    void loadFileTree()
    selectedFile.value = null
    selectedFileContent.value = ''
    previewUrl.value = ''
  }
})

watch(activeWorkspaceKey, (workspaceId, previous) => {
  if (chatHistorySaveTimer) {
    clearTimeout(chatHistorySaveTimer)
    chatHistorySaveTimer = null
    if (previous) saveWorkspaceChatHistory(previous, chatMessages.value)
  }
  chatMessages.value = loadWorkspaceChatHistory(workspaceId)
  setAiTyping(false)
  selectedFile.value = null
  selectedFileContent.value = ''
  selectedFileError.value = ''
  nextTick(() => { if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight })
}, { immediate: true, flush: 'sync' })

watch(() => bridge.status.value, (status) => {
  if (status === 'connected') {
    projectsTimedOut.value = false
    fileTreeTimedOut.value = false
    setTimeout(() => { if (!projectsList.value.length) projectsTimedOut.value = true }, 3_000)
    setTimeout(() => { if (!fileTree.value.length) fileTreeTimedOut.value = true }, 3_000)
  } else {
    projectsTimedOut.value = false
    fileTreeTimedOut.value = false
  }
}, { immediate: true })

onMounted(() => {
  const mobileViewport = window.matchMedia('(max-width: 767px)').matches
  const pairingInvitation = hasPairingInvitation(route.query)
  if (mobileViewport && !pairingInvitation) {
    void navigateTo('/mobile')
    return
  }
  if (mobileViewport && pairingInvitation) mobilePairingState.value = 'connecting'
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
  // Never request a second pairing code while consuming the one the phone
  // has just scanned. The two operations can invalidate each other.
  if (!pairingInvitation) void loadPairingCode()
  void pairFromRoute().then(async () => {
    if (!mobileViewport || !pairingInvitation) return
    if (pairError.value) {
      mobilePairingState.value = 'error'
      return
    }
    if (bridge.token.value) {
      await navigateTo('/mobile')
    } else {
      pairError.value = 'Appairage non confirmé. Génère un nouveau QR depuis VS Code.'
      mobilePairingState.value = 'error'
    }
  }).catch(() => {
    pairError.value = 'Impossible de terminer l’appairage. Génère un nouveau QR depuis VS Code.'
    mobilePairingState.value = 'error'
  })
  if (!pairingInvitation && bridge.mode.value === 'relay') void bridge.fetchRelaySessions()
})

onUnmounted(() => {
  if (chatHistorySaveTimer) clearTimeout(chatHistorySaveTimer)
  offMsg()
})
useHead({ title: 'DevBridge — Dashboard' })
</script>

<style scoped>
.notif-enter-active, .notif-leave-active { transition: all 0.28s ease; }
.notif-enter-from, .notif-leave-to { transform: translateY(-6px); opacity: 0; }
</style>
