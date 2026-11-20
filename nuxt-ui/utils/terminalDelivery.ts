/**
 * Delivery evidence is monotonic and strictly weaker than "Codex executed".
 * A relay ACK is not a terminal ACK. tmux accepting Enter is not a CLI turn.
 */
export type DeliveryStage =
  'sent' | 'agent_received' | 'terminal_dispatched' | 'keys_sent'
  | 'screen_observed' | 'unconfirmed' | 'rejected';

const ORDER: Record<DeliveryStage,number> = {
  sent:0,agent_received:1,terminal_dispatched:2,keys_sent:3,
  screen_observed:4,unconfirmed:5,rejected:6,
}
export function nextDeliveryStage(previous: DeliveryStage, incoming: DeliveryStage): DeliveryStage {
  if (previous === 'rejected' || previous === 'unconfirmed') return previous;
  if (previous === 'screen_observed' && incoming !== 'rejected') return previous;
  return ORDER[incoming] >= ORDER[previous] ? incoming : previous;
}
export function deliveryStatusText(stage: DeliveryStage, reason = ''): string {
  switch (stage) {
    case 'sent': return 'Instruction transmise au relais. Accusé de réception attendu.'
    case 'agent_received': return 'Agent local destinataire. Injection dans le terminal non confirmée.'
    case 'terminal_dispatched': return 'Injection demandée à VS Code. Réaction de la CLI non confirmée.'
    case 'keys_sent': return 'Texte et Entrée envoyés au terminal suivi. Réaction de Codex non confirmée.'
    case 'screen_observed': return 'Écran du terminal modifié depuis l’envoi. Réponse de Codex non vérifiée.'
    case 'unconfirmed': return 'Aucune réaction du terminal confirmée. Vérifie l’écran avant un nouvel envoi pour éviter les doublons.'
    case 'rejected':
      return reason === 'multiline_input_requires_review'
        ? 'Ce terminal suivi ne prend pas encore en charge les messages multilignes à distance.'
        : reason === 'terminal_input_unconfirmed'
        ? 'Injection non confirmée. Le texte peut être dans le champ Codex. Vérifie avant de réessayer.'
        : 'Envoi refusé par le poste. Vérifie le terminal avant de réessayer.'
  }
}
