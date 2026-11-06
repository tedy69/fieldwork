import { useCallback, useState } from 'react';
import type { Locale } from '@fieldwork/strings';

export type LocalizedNotice = (locale: Locale) => string;

export function useLocalizedNotice(locale: Locale) {
  const [notice, setNotice] = useState<{
    render: LocalizedNotice;
    pendingMutationId?: string;
  } | null>(null);
  const show = useCallback((render: LocalizedNotice | null, pendingMutationId?: string) => {
    setNotice(render ? { render, pendingMutationId } : null);
  }, []);
  return {
    message: notice?.render(locale),
    pendingMutationId: notice?.pendingMutationId,
    show,
  };
}
