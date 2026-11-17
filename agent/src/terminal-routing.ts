import type { CliRegistry } from './cliRegistry';
import type { IpcServer } from './ipc';

export function routeTerminalMessage(
  ipc: Pick<IpcServer, 'sendToExtension'>,
  registry: CliRegistry | undefined,
  text: string,
  target?: string,
  sendEnter = true,
): { target: string; queued: boolean } | null {
  const name = target?.trim();
  if (!name) return null;
  const cli = registry?.getById(name);
  const known = cli || name === 'bash' || name === 'chat:devbridge' || name.startsWith('terminal:');
  if (!known) return null;
  const queued = ipc.sendToExtension({
    type: 'inject_message',
    text,
    target: name,
    sendEnter: name === 'chat:devbridge' ? false : sendEnter,
    ...(cli && {
      cliId: cli.id,
      terminalName: registry?.getTerminalName(cli.id) ?? `DevBridge ${cli.name}`,
      command: cli.command,
      args: cli.args,
    }),
  });
  return { target: name, queued };
}
