import { useCallback, useState } from 'react';
import type { Locale } from '@fieldwork/strings';

export type LocalizedNotice = (locale: Locale) => string;

export function useLocalizedNotice(locale: Locale) {
  const [renderNotice, setRenderNotice] = useState<LocalizedNotice | null>(null);
  const showNotice = useCallback((notice: LocalizedNotice | null) => {
    setRenderNotice(() => notice);
  }, []);
  return [renderNotice?.(locale), showNotice] as const;
}
