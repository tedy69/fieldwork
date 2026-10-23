import { InvitationTokenSchema } from '@fieldwork/contracts';

function tokenFromHash(hash: string, key: 'invite' | 'reset'): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!params.has(key)) return null;
  if ([...params.keys()].length !== 1) return '';
  const parsed = InvitationTokenSchema.safeParse(params.get(key));
  return parsed.success ? parsed.data : '';
}
export const invitationTokenFromHash = (hash: string) => tokenFromHash(hash, 'invite');
export const passwordResetTokenFromHash = (hash: string) => tokenFromHash(hash, 'reset');
function accountLink(origin: string, token: string, key: 'invite' | 'reset'): string {
  const url = new URL('/', origin);
  if (!['https:', 'http:'].includes(url.protocol) || url.origin !== origin)
    throw new Error('Open Fieldwork from its normal web address before copying an account link.');
  url.hash = new URLSearchParams({ [key]: InvitationTokenSchema.parse(token) }).toString();
  return url.toString();
}
export const invitationLink = (origin: string, token: string) =>
  accountLink(origin, token, 'invite');
export const passwordResetLink = (origin: string, token: string) =>
  accountLink(origin, token, 'reset');
export function clearInvitationHash() {
  history.replaceState(history.state, '', location.pathname + location.search);
}
