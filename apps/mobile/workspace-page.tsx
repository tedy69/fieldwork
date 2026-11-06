import { useEffect, useMemo, useState, type RefObject } from 'react';
import {
  AccessibilityInfo,
  AppState,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  awaitsInspection,
  compareOrdersByDueDate,
  hasDraftContent,
  isOpenDueBetween,
  isUrgentOpenOrder,
  nextSevenDaysEnd,
  isOverdue,
  localDate,
  StatusSchema,
  type User,
  type WorkOrder,
} from '@fieldwork/contracts';
import { searchQueuedReports, type State } from '@fieldwork/offline';
import {
  inspectionCopy,
  languageNames,
  languageTags,
  notebookCopy,
  signInCopy,
  type Locale,
} from '@fieldwork/strings';
import { assignmentDate } from './assignment-date';
import { Brand, Button, Copy, Field, Notice, Panel, StatusBadge } from './notebook-ui';
import { colors, radius, spacing } from './theme';
import {
  ArrowClockwise,
  ClipboardText,
  Clock,
  FunnelSimple,
  Globe,
  PencilSimple,
  Tray,
  SignIn,
  SignOut,
  WarningCircle,
  X,
} from './notebook-icons';

type QueueItem = State['outbox'][number];
type Entry =
  { kind: 'order'; order: WorkOrder } | { kind: 'queued'; item: QueueItem; order?: WorkOrder };
const dateFilters = ['overdue', 'today', 'next'] as const;
type DateFilter = (typeof dateFilters)[number];
export type AssignmentFilter =
  WorkOrder['status'] | DateFilter | 'urgent' | 'toDo' | 'drafts' | null;
const filters: AssignmentFilter[] = [
  null,
  ...dateFilters,
  'urgent',
  'toDo',
  'drafts',
  ...StatusSchema.options,
];

export type NotebookProblem =
  'session' | 'syncUnavailable' | 'notebookReadFailed' | 'recoveryUnavailable' | 'recoveryFailed';

export function NotebookNotice({
  error,
  locale,
  onSignInAgain,
  onRetry,
  retrying,
}: {
  error: NotebookProblem;
  locale: Locale;
  onSignInAgain: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const copy = notebookCopy[locale];
  return error === 'session' ? (
    <Notice error title={copy.syncSignIn}>
      <Copy muted>{copy.sessionDrafts}</Copy>
      <Button title={copy.signInAgain} icon={SignIn} variant="outline" onPress={onSignInAgain} />
    </Notice>
  ) : (
    <Notice error title={copy.syncError}>
      <Copy muted>{copy[error]}</Copy>
      {error === 'syncUnavailable' && (
        <Button
          title={retrying ? copy.syncing : copy.retrySync}
          icon={ArrowClockwise}
          variant="outline"
          style={styles.noticeAction}
          disabled={retrying}
          onPress={onRetry}
        />
      )}
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
  const dateLocale = languageTags[locale];
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.4;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [today, setToday] = useState(localDate);
  const dateFiltered = dateFilters.some((filter) => filter === assignmentFilter);
  useEffect(() => {
    if (view !== 'assignments' || !dateFiltered) return;
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
  }, [dateFiltered, view]);
  const filterLabels = {
    overdue: copy.overdue,
    today: copy.dueToday,
    next: copy.nextSevenDays,
    urgent: copy.urgentWork,
    toDo: copy.toDo,
    drafts: copy.drafts,
    ...copy.status,
  };
  const filterLabel = (filter: AssignmentFilter) =>
    filter ? filterLabels[filter] : copy.allAssignments;
  const query = search.trim().toLowerCase();
  const queuedOrders = useMemo(
    () => new Set(state.outbox.map((item) => item.orderId)),
    [state.outbox],
  );
  const savedDrafts = useMemo(
    () =>
      new Set(
        state.orders
          .filter(
            (order) =>
              awaitsInspection(order) &&
              !queuedOrders.has(order.id) &&
              hasDraftContent(state.drafts[order.id]),
          )
          .map((order) => order.id),
      ),
    [state.orders, state.drafts, queuedOrders],
  );
  const entries = useMemo<Entry[]>(() => {
    if (view === 'outbox')
      return searchQueuedReports(state.orders, state.outbox, query).map((entry) => ({
        kind: 'queued',
        ...entry,
      }));
    const through = assignmentFilter === 'next' ? nextSevenDaysEnd(today) : today;
    const orders = state.orders.filter((order) => {
      if (!`${order.reference} ${order.title} ${order.site.name}`.toLowerCase().includes(query))
        return false;
      switch (assignmentFilter) {
        case null:
          return true;
        case 'overdue':
          return isOverdue(order, today);
        case 'urgent':
          return isUrgentOpenOrder(order);
        case 'toDo':
          return awaitsInspection(order) && !queuedOrders.has(order.id);
        case 'drafts':
          return savedDrafts.has(order.id);
        case 'today':
        case 'next':
          return isOpenDueBetween(order, today, through);
        default:
          return order.status === assignmentFilter;
      }
    });
    if (assignmentFilter === 'next') orders.sort(compareOrdersByDueDate);
    return orders.map((order) => ({ kind: 'order', order }));
  }, [state.orders, state.outbox, queuedOrders, savedDrafts, query, assignmentFilter, today, view]);
  const queuedReports = state.outbox.length;
  const clearSearch = search ? (
    <Button
      title={copy.clearSearch}
      icon={X}
      iconOnly
      variant="ghost"
      onPress={() => onSearchChange('')}
    />
  ) : undefined;
  const queuedLabel = copy.pending(queuedReports);
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
              title={`${copy.outboxTab} (${queuedReports})`}
              icon={Tray}
              variant="ghost"
              selected={view === 'outbox'}
              style={largeText ? undefined : styles.tab}
              onPress={() => onViewChange('outbox')}
            />
          </View>
          {error && (
            <NotebookNotice
              error={error}
              locale={locale}
              onSignInAgain={onSignInAgain}
              onRetry={onSync}
              retrying={busy}
            />
          )}
          {view === 'outbox' && (queuedReports > 0 || search) ? (
            <Field
              label={copy.searchOutbox}
              placeholder={copy.searchOutboxHint}
              actionLabels={signInCopy[locale]}
              value={search}
              onChangeText={onSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
              testID="outbox-search"
              trailingAction={clearSearch}
            />
          ) : null}
          {view === 'assignments' && (
            <View style={styles.searchTools}>
              <View style={styles.searchRow}>
                <View style={styles.flexItem}>
                  <Field
                    label={copy.search}
                    placeholder={copy.searchHint}
                    actionLabels={signInCopy[locale]}
                    value={search}
                    onChangeText={onSearchChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                    testID="assignment-search"
                    trailingAction={clearSearch}
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
                      icon={filter === 'drafts' ? PencilSimple : undefined}
                      variant="outline"
                      selected={filter === assignmentFilter}
                      style={styles.statusChoice}
                      onPress={() => onAssignmentFilterChange(filter)}
                    />
                  ))}
                </View>
              )}
              {assignmentFilter && (
                <View style={styles.filterSummary}>
                  <Copy
                    variant="caption"
                    muted
                    accessibilityLiveRegion="polite"
                    style={styles.flexItem}
                  >
                    {copy.filteredCount(filterLabel(assignmentFilter), entries.length)}
                  </Copy>
                  <Button
                    title={copy.clearAssignmentFilter}
                    icon={X}
                    iconOnly
                    variant="ghost"
                    onPress={() => {
                      onAssignmentFilterChange(null);
                      AccessibilityInfo.announceForAccessibility(copy.assignmentFilterCleared);
                    }}
                  />
                </View>
              )}
            </View>
          )}
          {view === 'assignments' && queuedReports > 0 && (
            <Button
              title={queuedLabel}
              accessibilityLabel={`${copy.openOutbox}. ${queuedLabel}`}
              icon={Tray}
              variant="outline"
              style={styles.pendingAction}
              testID="open-queued-reports"
              onPress={() => onViewChange('outbox')}
            />
          )}
        </View>
      }
      renderItem={({ item: entry }) => {
        if (entry.kind === 'queued') {
          const { item, order } = entry;
          const blocked = item.state === 'blocked';
          const StatusIcon = blocked ? WarningCircle : Clock;
          const statusColor = blocked ? colors.error : colors.muted;
          return (
            <Panel style={styles.queueCard}>
              <View style={styles.metadata}>
                {order && (
                  <Copy variant="reference" muted>
                    {order.reference}
                  </Copy>
                )}
                <View style={styles.queueStatus}>
                  <View accessible={false} importantForAccessibility="no-hide-descendants">
                    <StatusIcon size={16} color={statusColor} />
                  </View>
                  <Copy variant="caption" style={[styles.queueStatusText, { color: statusColor }]}>
                    {blocked ? copy.needsAttention : copy.awaitingConfirmation}
                  </Copy>
                </View>
              </View>
              <Copy accessibilityRole="header" variant="record">
                {order?.title ?? copy.savedInspection}
              </Copy>
              <Copy>{item.input.summary}</Copy>
              <Copy muted variant="caption">
                {copy.photoCount(item.input.photos.length)} · {copy.savedAt}{' '}
                {new Date(item.createdAt).toLocaleString(dateLocale)}
              </Copy>
              {item.error && (blocked || (error !== 'session' && error !== 'syncUnavailable')) && (
                <Notice error title={copy.reportError}>
                  {item.error}
                </Notice>
              )}
              {blocked ? (
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
        const queued = queuedOrders.has(order.id);
        const savedDraft = savedDrafts.has(order.id);
        const draftHint = savedDraft ? ` ${inspectionCopy[locale].draftSaved}.` : '';
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${copy.open} ${order.reference}: ${order.title}`}
            accessibilityHint={`${copy.due} ${due}. ${copy.status[order.status]}.${draftHint}`}
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
              {queued && (
                <Copy variant="caption" style={{ color: colors.amber }}>
                  {copy.queued}
                </Copy>
              )}
              {savedDraft && (
                <View accessible={false} importantForAccessibility="no-hide-descendants">
                  <PencilSimple size={16} color={colors.muted} />
                </View>
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
              ? queuedReports > 0
                ? copy.noQueuedMatch
                : copy.upToDate
              : busy
                ? copy.loading
                : query || assignmentFilter
                  ? copy.noMatch
                  : copy.noAssignments
          }
        >
          {view === 'outbox'
            ? queuedReports > 0
              ? copy.noQueuedMatchHint
              : copy.outboxEmpty
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
  noticeAction: { alignSelf: 'flex-start' },
  searchTools: { gap: spacing.sm },
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  flexItem: { flex: 1, minWidth: 0 },
  filterSummary: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusChoice: { maxWidth: '100%' },
  pendingAction: { backgroundColor: colors.raised, justifyContent: 'flex-start' },
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
  queueStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '100%' },
  queueStatusText: { flexShrink: 1 },
  queueCard: { marginBottom: spacing.md },
  footer: { gap: spacing.md, paddingTop: spacing.section },
  signOut: { alignSelf: 'flex-start' },
});
