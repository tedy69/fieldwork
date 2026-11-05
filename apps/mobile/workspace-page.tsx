import { useMemo, type RefObject } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import type { User, WorkOrder } from '@fieldwork/contracts';
import type { State } from '@fieldwork/offline';
import { languageNames, notebookCopy, signInCopy, type Locale } from '@fieldwork/strings';
import { Brand, Button, Copy, Field, Notice, Panel, StatusBadge } from './notebook-ui';
import { colors, radius, spacing } from './theme';
import { ArrowClockwise, ClipboardText, Globe, Tray, SignOut } from './notebook-icons';

type QueueItem = State['outbox'][number];
type Entry = { kind: 'order'; order: WorkOrder } | { kind: 'queued'; item: QueueItem };

/** Native list pages keep local browsing separate from the repository's write operations. */
export default function WorkspacePage({
  state,
  user,
  locale,
  onLanguageChange,
  busy,
  error,
  onSync,
  onOpen,
  onResolve,
  onLogout,
  view,
  onViewChange,
  search,
  onSearchChange,
  scrollPosition,
}: {
  state: State;
  user: User;
  locale: Locale;
  onLanguageChange: (locale: Locale) => void;
  busy: boolean;
  error: string;
  onSync: () => void;
  onOpen: (id: string) => void;
  onResolve: (orderId: string) => Promise<void>;
  onLogout: () => void;
  view: 'assignments' | 'outbox';
  onViewChange: (view: 'assignments' | 'outbox') => void;
  search: string;
  onSearchChange: (search: string) => void;
  scrollPosition: RefObject<number>;
}) {
  const copy = notebookCopy[locale];
  const alternate = locale === 'en' ? 'id' : 'en';
  const dateLocale = locale === 'id' ? 'id-ID' : undefined;
  const entries = useMemo<Entry[]>(
    () =>
      view === 'outbox'
        ? state.outbox.map((item) => ({ kind: 'queued', item }))
        : state.orders
            .filter((order) =>
              `${order.reference} ${order.title} ${order.site.name}`
                .toLowerCase()
                .includes(search.trim().toLowerCase()),
            )
            .map((order) => ({ kind: 'order', order })),
    [state.orders, state.outbox, search, view],
  );
  return (
    <FlatList
      data={entries}
      keyExtractor={(entry) =>
        entry.kind === 'order' ? entry.order.id : entry.item.input.mutationId
      }
      contentContainerStyle={styles.page}
      contentOffset={{ x: 0, y: scrollPosition.current }}
      onScroll={(event) => {
        scrollPosition.current = Math.max(0, event.nativeEvent.contentOffset.y);
      }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onRefresh={onSync}
      refreshing={busy}
      ListHeaderComponent={
        <View style={styles.heading}>
          <View style={styles.utility}>
            <Brand />
            <View style={styles.utilityActions}>
              <Button
                title={languageNames[alternate]}
                icon={Globe}
                iconOnly
                variant="ghost"
                onPress={() => onLanguageChange(alternate)}
              />
              <Button
                title={busy ? copy.syncing : copy.sync}
                icon={ArrowClockwise}
                iconOnly
                variant="ghost"
                disabled={busy}
                onPress={onSync}
              />
            </View>
          </View>
          <View style={styles.introduction}>
            <Copy variant="caption" muted>
              {user.name} · {copy.worker}
            </Copy>
            <Copy accessibilityRole="header" variant="title">
              {view === 'assignments' ? copy.assignments : copy.outbox}
            </Copy>
            {view === 'outbox' && <Copy muted>{copy.outboxIntro}</Copy>}
          </View>
          <View style={styles.tabs}>
            <Button
              title={`${copy.assignmentTab} (${state.orders.length})`}
              icon={ClipboardText}
              variant="ghost"
              selected={view === 'assignments'}
              style={styles.tab}
              onPress={() => onViewChange('assignments')}
            />
            <Button
              title={`${copy.outboxTab} (${state.outbox.length})`}
              icon={Tray}
              variant="ghost"
              selected={view === 'outbox'}
              style={styles.tab}
              onPress={() => onViewChange('outbox')}
            />
          </View>
          {error ? (
            <Notice error title={copy.syncError}>
              {error}
            </Notice>
          ) : null}
          {view === 'assignments' && (
            <Field
              label={copy.search}
              placeholder={copy.searchHint}
              actionLabels={signInCopy[locale]}
              value={search}
              onChangeText={onSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              testID="assignment-search"
            />
          )}
          {view === 'assignments' && state.outbox.length > 0 && (
            <Notice title={copy.pending(state.outbox.length)}>
              <Copy muted>{copy.pendingHint}</Copy>
              <Button
                title={copy.openOutbox}
                variant="outline"
                onPress={() => onViewChange('outbox')}
              />
            </Notice>
          )}
        </View>
      }
      renderItem={({ item: entry }) => {
        if (entry.kind === 'queued') {
          const { item } = entry;
          const order = state.orders.find((order) => order.id === item.orderId);
          return (
            <Panel style={styles.queueCard}>
              <Copy variant="caption" style={{ color: colors.amber }}>
                {item.state === 'blocked' ? copy.needsAttention : copy.awaitingConfirmation}
              </Copy>
              <Copy accessibilityRole="header" variant="record">
                {order?.title ?? copy.savedInspection}
              </Copy>
              <Copy>{item.input.summary}</Copy>
              <Copy muted variant="caption">
                {copy.photoCount(item.input.photos.length)} · {copy.savedAt}{' '}
                {new Date(item.createdAt).toLocaleString(dateLocale)}
              </Copy>
              {item.error && (
                <Notice error title={copy.reportError}>
                  {item.error}
                </Notice>
              )}
              {item.state === 'blocked' ? (
                <Button
                  title={copy.openLatest}
                  variant="outline"
                  disabled={busy}
                  onPress={() => void onResolve(item.orderId)}
                />
              ) : (
                <Button
                  title={copy.openSaved}
                  variant="outline"
                  disabled={!order}
                  onPress={() => onOpen(item.orderId)}
                />
              )}
              {!order && (
                <Copy muted variant="caption">
                  {copy.unavailable}
                </Copy>
              )}
            </Panel>
          );
        }
        const { order } = entry;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${copy.open} ${order.reference}: ${order.title}`}
            accessibilityHint={`${copy.due} ${order.dueDate}. ${copy.status[order.status]}.`}
            onPress={() => onOpen(order.id)}
            style={({ pressed }) => [styles.order, pressed && styles.orderPressed]}
          >
            <View style={styles.metadata}>
              <Copy variant="reference" muted>
                {order.reference}
              </Copy>
              {order.priority === 'urgent' && (
                <Copy variant="caption" style={{ color: colors.amber }}>
                  {copy.urgent}
                </Copy>
              )}
              {state.outbox.some((item) => item.orderId === order.id) && (
                <Copy variant="caption" style={{ color: colors.amber }}>
                  {copy.queued}
                </Copy>
              )}
            </View>
            <Copy variant="record">{order.title}</Copy>
            <Copy muted>{order.site.name}</Copy>
            <View style={styles.metadata}>
              <Copy muted variant="caption">
                {copy.due} {order.dueDate}
              </Copy>
              <StatusBadge status={order.status} locale={locale} />
            </View>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <Notice
          title={
            view === 'outbox'
              ? copy.upToDate
              : busy
                ? copy.loading
                : search
                  ? copy.noMatch
                  : copy.noAssignments
          }
        >
          {view === 'outbox'
            ? copy.outboxEmpty
            : busy
              ? copy.loadingHint
              : search
                ? copy.noMatchHint
                : copy.noAssignmentsHint}
        </Notice>
      }
      ListFooterComponent={
        <View style={styles.footer}>
          <Copy muted variant="caption">
            {state.lastSynced
              ? `${copy.lastSynced} ${new Date(state.lastSynced).toLocaleString(dateLocale)}`
              : copy.neverSynced}
          </Copy>
          <Copy muted variant="caption">
            {copy.draftsStay}
          </Copy>
          <Button
            title={copy.signOut}
            icon={SignOut}
            iconOnly
            variant="ghost"
            onPress={onLogout}
            style={styles.signOut}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  page: {
    padding: spacing.xl,
    paddingBottom: spacing.page,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  heading: { gap: spacing.section, marginBottom: spacing.section },
  utility: {
    zIndex: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  utilityActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  introduction: { gap: spacing.sm },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.control,
    backgroundColor: colors.raised,
  },
  tab: { flexGrow: 1, flexBasis: 120 },
  order: {
    padding: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  orderPressed: { backgroundColor: colors.selected },
  metadata: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  queueCard: { marginBottom: spacing.md },
  footer: { gap: spacing.md, paddingTop: spacing.section },
  signOut: { alignSelf: 'flex-start' },
});
