import { useEffect, useMemo, useState, type RefObject } from 'react';
import {
  AppState,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  isDueToday,
  isOverdue,
  localDate,
  StatusSchema,
  type User,
  type WorkOrder,
} from '@fieldwork/contracts';
import type { State } from '@fieldwork/offline';
import { languageNames, notebookCopy, signInCopy, type Locale } from '@fieldwork/strings';
import { assignmentDate } from './assignment-date';
import { Brand, Button, Copy, Field, Notice, Panel, StatusBadge } from './notebook-ui';
import { colors, radius, spacing } from './theme';
import {
  ArrowClockwise,
  ClipboardText,
  FunnelSimple,
  Globe,
  Tray,
  SignIn,
  SignOut,
} from './notebook-icons';

type QueueItem = State['outbox'][number];
type Entry = { kind: 'order'; order: WorkOrder } | { kind: 'queued'; item: QueueItem };
export type AssignmentFilter = WorkOrder['status'] | 'overdue' | 'today' | null;
const filters: AssignmentFilter[] = [null, 'overdue', 'today', ...StatusSchema.options];

export type NotebookProblem =
  'session' | 'syncUnavailable' | 'notebookReadFailed' | 'recoveryUnavailable' | 'recoveryFailed';

export function NotebookNotice({
  error,
  locale,
  onSignInAgain,
}: {
  error: NotebookProblem;
  locale: Locale;
  onSignInAgain: () => void;
}) {
  const copy = notebookCopy[locale];
  return error === 'session' ? (
    <Notice error title={copy.syncSignIn}>
      <Copy muted>{copy.sessionDrafts}</Copy>
      <Button title={copy.signInAgain} icon={SignIn} variant="outline" onPress={onSignInAgain} />
    </Notice>
  ) : (
    <Notice error title={copy.syncError}>
      {copy[error]}
    </Notice>
  );
}

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
  onSignInAgain,
  view,
  onViewChange,
  search,
  onSearchChange,
  assignmentFilter,
  onAssignmentFilterChange,
  scrollPosition,
}: {
  state: State;
  user: User;
  locale: Locale;
  onLanguageChange: (locale: Locale) => void;
  busy: boolean;
  error: NotebookProblem | null;
  onSync: () => void;
  onOpen: (id: string) => void;
  onResolve: (orderId: string, mutationId: string) => Promise<void>;
  onLogout: () => void;
  onSignInAgain: () => void;
  view: 'assignments' | 'outbox';
  onViewChange: (view: 'assignments' | 'outbox') => void;
  search: string;
  onSearchChange: (search: string) => void;
  assignmentFilter: AssignmentFilter;
  onAssignmentFilterChange: (filter: AssignmentFilter) => void;
  scrollPosition: RefObject<number>;
}) {
  const copy = notebookCopy[locale];
  const alternate = locale === 'en' ? 'id' : 'en';
  const dateLocale = locale === 'id' ? 'id-ID' : undefined;
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.4;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [today, setToday] = useState(localDate);
  useEffect(() => {
    if (view !== 'assignments' || (assignmentFilter !== 'overdue' && assignmentFilter !== 'today'))
      return;
    const update = () => setToday(localDate());
    update();
    const interval = setInterval(update, 60_000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
    });
    return () => {
      clearInterval(interval);
      listener.remove();
    };
  }, [assignmentFilter, view]);
  const filterLabels = { overdue: copy.overdue, today: copy.dueToday, ...copy.status };
  const filterLabel = (filter: AssignmentFilter) =>
    filter ? filterLabels[filter] : copy.allAssignments;
  const query = search.trim().toLowerCase();
  const entries = useMemo<Entry[]>(() => {
    if (view === 'outbox') return state.outbox.map((item) => ({ kind: 'queued', item }));
    return state.orders
      .filter((order) => {
        const matches =
          assignmentFilter === 'overdue'
            ? isOverdue(order, today)
            : assignmentFilter === 'today'
              ? isDueToday(order, today)
              : !assignmentFilter || order.status === assignmentFilter;
        return (
          matches &&
          `${order.reference} ${order.title} ${order.site.name}`.toLowerCase().includes(query)
        );
      })
      .map((order) => ({ kind: 'order', order }));
  }, [state.orders, state.outbox, query, assignmentFilter, today, view]);
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
          <View style={[styles.tabs, largeText && styles.tabsLarge]}>
            <Button
              title={`${copy.assignmentTab} (${state.orders.length})`}
              icon={ClipboardText}
              variant="ghost"
              selected={view === 'assignments'}
              style={largeText ? undefined : styles.tab}
              onPress={() => onViewChange('assignments')}
            />
            <Button
              title={`${copy.outboxTab} (${state.outbox.length})`}
              icon={Tray}
              variant="ghost"
              selected={view === 'outbox'}
              style={largeText ? undefined : styles.tab}
              onPress={() => onViewChange('outbox')}
            />
          </View>
          {error && <NotebookNotice error={error} locale={locale} onSignInAgain={onSignInAgain} />}
          {view === 'assignments' && (
            <View style={styles.searchTools}>
              <View style={styles.searchRow}>
                <View style={styles.searchField}>
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
                </View>
                <Button
                  title={copy.filterAssignments}
                  icon={FunnelSimple}
                  iconOnly
                  variant="outline"
                  expanded={filtersOpen}
                  selected={Boolean(assignmentFilter)}
                  onPress={() => {
                    Keyboard.dismiss();
                    setFiltersOpen((open) => !open);
                  }}
                />
              </View>
              {filtersOpen && (
                <View style={styles.statusChoices}>
                  {filters.map((filter) => (
                    <Button
                      key={filter ?? 'all'}
                      title={filterLabel(filter)}
                      variant="outline"
                      selected={filter === assignmentFilter}
                      style={styles.statusChoice}
                      onPress={() => onAssignmentFilterChange(filter)}
                    />
                  ))}
                </View>
              )}
              {assignmentFilter && (
                <Copy variant="caption" muted accessibilityLiveRegion="polite">
                  {copy.filteredCount(filterLabel(assignmentFilter), entries.length)}
                </Copy>
              )}
            </View>
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
              {item.error &&
                (item.state === 'blocked' ||
                  (error !== 'session' && error !== 'syncUnavailable')) && (
                  <Notice error title={copy.reportError}>
                    {item.error}
                  </Notice>
                )}
              {item.state === 'blocked' ? (
                <Button
                  title={copy.openLatest}
                  variant="outline"
                  disabled={busy}
                  onPress={() => void onResolve(item.orderId, item.input.mutationId)}
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
        const due = assignmentDate(order.dueDate, locale);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${copy.open} ${order.reference}: ${order.title}`}
            accessibilityHint={`${copy.due} ${due}. ${copy.status[order.status]}.`}
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
                {copy.due} {due}
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
                : query || assignmentFilter
                  ? copy.noMatch
                  : copy.noAssignments
          }
        >
          {view === 'outbox'
            ? copy.outboxEmpty
            : busy
              ? copy.loadingHint
              : assignmentFilter
                ? copy.noFilterMatchHint
                : query
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
  tabsLarge: { flexDirection: 'column', flexWrap: 'nowrap' },
  tab: { flexGrow: 1, flexBasis: 120 },
  searchTools: { gap: spacing.sm },
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  searchField: { flex: 1, minWidth: 0 },
  statusChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusChoice: { maxWidth: '100%' },
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
