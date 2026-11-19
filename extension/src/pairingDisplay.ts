/**
 * Build a desktop-only URL for displaying (not consuming) a pairing invitation.
 *
 * VS Code's openExternal(Uri.parse(url)) can re-encode percent signs inside
 * nested URLs. A base64url fragment avoids that ambiguity and never sends
 * the invitation to the web server as part of an HTTP request.
 */
export function buildPairingDisplayUrl(invitationUrl: string): string | null {
  try {
    const invitation = new URL(invitationUrl);
    if (!['http:', 'https:'].includes(invitation.protocol)) return null;
    const display = new URL('/pairing/display', invitation.origin);
    display.hash = 'invite=' + Buffer.from(invitation.toString(), 'utf8').toString('base64url');
    return display.toString();
  } catch {
    return null;
  }
}
