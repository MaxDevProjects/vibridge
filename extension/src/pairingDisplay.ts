/**
 * Build a desktop-only display URL. The pairing invitation stays in the URL
 * fragment, so it is not included in the HTTP request for the display page.
 * The display page never consumes the invitation itself.
 */
export function buildPairingDisplayUrl(invitationUrl: string): string | null {
  try {
    const invitation = new URL(invitationUrl);
    if (!['http:', 'https:'].includes(invitation.protocol)) return null;

    // The pairing page must be served by the same ViBridge UI as the invite.
    const display = new URL('/pairing/display', invitation.origin);
    display.hash = new URLSearchParams({ invite: invitation.toString() }).toString();
    return display.toString();
  } catch {
    return null;
  }
}
