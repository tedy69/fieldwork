import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { MapProvider } from '@fieldwork/contracts';
import { client, message } from './lib';

type Settings = {
  provider: MapProvider | null | undefined;
  loading: boolean;
  error: string;
  ensure: () => void;
  reload: () => void;
};
const Context = createContext<Settings | null>(null);
export function MapSettingsProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<MapProvider | null>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const attempted = useRef(false);
  const inflight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const load = useCallback(async (force = false) => {
    if (inflight.current || (attempted.current && !force)) return;
    attempted.current = true;
    inflight.current = true;
    setLoading(true);
    setError('');
    try {
      const settings = await client.mapSettings();
      if (mounted.current) setProvider(settings.provider);
    } catch (error) {
      if (mounted.current) setError(message(error));
    } finally {
      inflight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);
  const ensure = useCallback(() => {
    void load();
  }, [load]);
  const reload = useCallback(() => {
    void load(true);
  }, [load]);
  const value = useMemo(
    () => ({ provider, loading, error, ensure, reload }),
    [provider, loading, error, ensure, reload],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMapSettings() {
  const settings = useContext(Context);
  if (!settings) throw new Error('Map settings need an account-scoped provider.');
  return settings;
}
