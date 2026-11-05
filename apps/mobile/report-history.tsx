import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import type { ReportRevision, WorkOrder } from '@fieldwork/contracts';
import { ApiError, createClient } from '@fieldwork/sdk';
import { notebookCopy, type Locale } from '@fieldwork/strings';
import { ArrowLeft, ClockCounterClockwise } from './notebook-icons';
import { Button, Copy, Notice } from './notebook-ui';
import SavedReport from './saved-report';
import { colors, size, spacing } from './theme';

const english = {
  title: 'Report history',
  back: 'Back to report history',
  close: 'Close report history',
  loading: 'Loading report history…',
  empty: 'No saved reports',
  unavailable: 'This assignment is no longer available to your account.',
  failed: 'Could not load report history. Connect and try again.',
  cursor: 'Report history changed. Refresh to see the current list.',
  retry: 'Retry history',
  more: 'Load older reports',
  version: (version: number) => `Order version ${version}`,
  saved: 'Saved report',
  awaiting: 'Waiting for review',
  reviewMissing: 'Earlier review feedback is unavailable.',
};
const historyCopy: Record<Locale, typeof english> = {
  en: english,
  id: {
    title: 'Riwayat laporan',
    back: 'Kembali ke riwayat laporan',
    close: 'Tutup riwayat laporan',
    loading: 'Memuat riwayat laporan…',
    empty: 'Belum ada laporan tersimpan',
    unavailable: 'Tugas ini sudah tidak tersedia untuk akun Anda.',
    failed: 'Riwayat laporan gagal dimuat. Sambungkan ke internet, lalu coba lagi.',
    cursor: 'Riwayat laporan berubah. Muat ulang untuk melihat daftar terbaru.',
    retry: 'Coba muat riwayat lagi',
    more: 'Muat laporan sebelumnya',
    version: (version) => `Versi tugas ${version}`,
    saved: 'Laporan tersimpan',
    awaiting: 'Menunggu peninjauan',
    reviewMissing: 'Masukan peninjauan sebelumnya tidak tersedia.',
  },
};

type Props = {
  order: Pick<WorkOrder, 'id' | 'reference' | 'title'>;
  baseUrl: string;
  token: string;
  locale: Locale;
};
type Page = Awaited<ReturnType<ReturnType<typeof createClient>['reportHistory']>>;

export default function ReportHistoryAction(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        title={historyCopy[props.locale].title}
        icon={ClockCounterClockwise}
        iconOnly
        variant="ghost"
        onPress={() => setOpen(true)}
      />
      {open && <ReportHistory {...props} close={() => setOpen(false)} />}
    </>
  );
}

function ReportHistory({ order, baseUrl, token, locale, close }: Props & { close: () => void }) {
  const copy = historyCopy[locale];
  const client = useMemo(() => createClient(baseUrl, () => token), [baseUrl, token]);
  const [page, setPage] = useState<Page | null>(null);
  const [selected, setSelected] = useState<ReportRevision | null>(null);
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState<'unavailable' | 'failed' | 'cursor' | null>(null);
  const request = useRef(0);
  const listOffset = useRef(0);
  const dateLocale = locale === 'id' ? 'id-ID' : undefined;
  const load = useCallback(
    async (cursor?: string) => {
      const current = ++request.current;
      setBusy(true);
      setProblem(null);
      try {
        const next = await client.reportHistory(order.id, cursor);
        if (request.current !== current) return;
        setPage((previous) => {
          if (!cursor || !previous) return next;
          const loaded = new Set(previous.data.map((revision) => revision.snapshot.report.id));
          const older = next.data.filter((revision) => !loaded.has(revision.snapshot.report.id));
          return { ...next, data: [...previous.data, ...older] };
        });
      } catch (error) {
        if (request.current !== current) return;
        setProblem(
          error instanceof ApiError && (error.status === 403 || error.status === 404)
            ? 'unavailable'
            : error instanceof ApiError && error.code === 'INVALID_CURSOR'
              ? 'cursor'
              : 'failed',
        );
      } finally {
        if (request.current === current) setBusy(false);
      }
    },
    [client, order.id],
  );
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [load]);

  const versionLabel = (revision: ReportRevision) =>
    revision.submissionVersion === null ? copy.saved : copy.version(revision.submissionVersion);
  const back = () => (selected ? setSelected(null) : close());
  return (
    <Modal animationType="none" onRequestClose={back}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.screen} accessibilityViewIsModal>
          <View style={styles.toolbar}>
            <Button
              title={selected ? copy.back : copy.close}
              icon={ArrowLeft}
              iconOnly
              variant="ghost"
              onPress={back}
            />
          </View>
          <ScrollView
            key={selected?.snapshot.report.id ?? 'history'}
            contentContainerStyle={styles.content}
            contentOffset={{ x: 0, y: selected ? 0 : listOffset.current }}
            onScroll={(event) => {
              if (!selected) listOffset.current = Math.max(0, event.nativeEvent.contentOffset.y);
            }}
          >
            <Copy variant="reference" muted>
              {order.reference} · {order.title}
            </Copy>
            <Copy accessibilityRole="header" variant="title">
              {selected ? versionLabel(selected) : copy.title}
            </Copy>
            {selected ? (
              <>
                {selected.review ? (
                  <Notice title={notebookCopy[locale].status[selected.review.decision]}>
                    {selected.review.note}
                  </Notice>
                ) : (
                  <Copy muted>
                    {selected.reviewStatus === 'not_retained' ? copy.reviewMissing : copy.awaiting}
                  </Copy>
                )}
                <SavedReport
                  report={selected.snapshot.report}
                  template={selected.snapshot.template}
                  baseUrl={baseUrl}
                  token={token}
                  locale={locale}
                />
              </>
            ) : (
              <>
                {page?.data.map((revision) => (
                  <Button
                    key={revision.snapshot.report.id}
                    testID={`report-history-version-${revision.submissionVersion ?? 'saved'}`}
                    title={`${versionLabel(revision)}\n${new Date(revision.snapshot.report.submittedAt).toLocaleString(dateLocale)}`}
                    variant="outline"
                    onPress={() => setSelected(revision)}
                  />
                ))}
                {busy && (
                  <Copy accessibilityLiveRegion="polite" muted>
                    {copy.loading}
                  </Copy>
                )}
                {problem && (
                  <Notice title={copy[problem]} error>
                    <Button
                      title={copy.retry}
                      variant="outline"
                      disabled={busy}
                      onPress={() =>
                        void load(
                          problem === 'cursor' ? undefined : (page?.nextCursor ?? undefined),
                        )
                      }
                    />
                  </Notice>
                )}
                {!problem && !busy && page?.data.length === 0 && <Notice title={copy.empty} />}
                {!problem && page?.nextCursor && (
                  <Button
                    title={copy.more}
                    variant="outline"
                    disabled={busy}
                    onPress={() => void load(page.nextCursor ?? undefined)}
                  />
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  toolbar: { paddingHorizontal: spacing.xl },
  content: {
    width: '100%',
    maxWidth: size.content,
    alignSelf: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
});
