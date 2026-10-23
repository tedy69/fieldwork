import { InvitationTokenSchema } from '@fieldwork/contracts';

export function invitationTokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!params.has('invite')) return null;
  if ([...params.keys()].length !== 1) return '';
  const parsed = InvitationTokenSchema.safeParse(params.get('invite'));
  return parsed.success ? parsed.data : '';
}
export function invitationLink(origin: string, token: string): string {
  const url = new URL('/', origin);
  if (!['https:', 'http:'].includes(url.protocol) || url.origin !== origin)
    throw new Error('Open Fieldwork from its normal web address before copying an invitation.');
  url.hash = new URLSearchParams({ invite: InvitationTokenSchema.parse(token) }).toString();
  return url.toString();
}
export function clearInvitationHash() {
  history.replaceState(history.state, '', location.pathname + location.search);
}
