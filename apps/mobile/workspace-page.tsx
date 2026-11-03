import { useMemo, type RefObject } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import type { User, WorkOrder } from '@fieldwork/contracts';
import type { State } from '@fieldwork/offline';
import { Brand, Button, Copy, Field, Notice, Panel, StatusBadge } from './notebook-ui';
import { colors, radius, spacing } from './theme';
import { ArrowClockwise, ClipboardText, Tray, SignOut } from './notebook-icons';

type QueueItem = State['outbox'][number];
type Entry = { kind: 'order'; order: WorkOrder } | { kind: 'queued'; item: QueueItem };

/** Native list pages keep local browsing separate from the repository's write operations. */
export default function WorkspacePage({
  state,
  user,
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
            <Button
              title={busy ? 'Syncing…' : 'Sync now'}
              icon={ArrowClockwise}
              iconOnly
              variant="ghost"
              disabled={busy}
              onPress={onSync}
            />
          </View>
          <View style={styles.introduction}>
            <Copy variant="caption" muted>
              {user.name} · Field worker
            </Copy>
            <Copy accessibilityRole="header" variant="title">
              {view === 'assignments' ? 'My assignments' : 'Sync outbox'}
            </Copy>
            {view === 'outbox' && <Copy muted>Saved here until the server confirms receipt.</Copy>}
          </View>
          <View style={styles.tabs}>
            <Button
              title={`Assignments (${state.orders.length})`}
              icon={ClipboardText}
              variant="ghost"
              selected={view === 'assignments'}
              style={styles.tab}
              onPress={() => onViewChange('assignments')}
            />
            <Button
              title={`Outbox (${state.outbox.length})`}
              icon={Tray}
              variant="ghost"
              selected={view === 'outbox'}
              style={styles.tab}
              onPress={() => onViewChange('outbox')}
            />
          </View>
          {error ? (
            <Notice error title="Sync needs attention">
              {error}
            </Notice>
          ) : null}
          {view === 'assignments' && (
            <Field
              label="Search assignments"
              placeholder="Reference, title or site"
              value={search}
              onChangeText={onSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              testID="assignment-search"
            />
          )}
          {view === 'assignments' && state.outbox.length > 0 && (
            <Notice title={`${state.outbox.length} waiting to sync`}>
              <Copy muted>Open Outbox to check the reports saved on this device.</Copy>
              <Button
                title="Open outbox"
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
                {item.state === 'blocked' ? 'Needs attention' : 'Waiting for confirmation'}
              </Copy>
              <Copy accessibilityRole="header" variant="record">
                {order?.title ?? 'Saved inspection'}
              </Copy>
              <Copy>{item.input.summary}</Copy>
              <Copy muted variant="caption">
                {item.input.photos.length} photos · Saved{' '}
                {new Date(item.createdAt).toLocaleString()}
              </Copy>
              {item.error && (
                <Notice error title="Could not sync this report">
                  {item.error}
                </Notice>
              )}
              {item.state === 'blocked' ? (
                <Button
                  title="Keep draft and open latest"
                  variant="outline"
                  disabled={busy}
                  onPress={() => void onResolve(item.orderId)}
                />
              ) : (
                <Button
                  title="Open saved assignment"
                  variant="outline"
                  disabled={!order}
                  onPress={() => onOpen(item.orderId)}
                />
              )}
              {!order && (
                <Copy muted variant="caption">
                  Contact your manager if this assignment is no longer available.
                </Copy>
              )}
            </Panel>
          );
        }
        const { order } = entry;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${order.reference}: ${order.title}`}
            onPress={() => onOpen(order.id)}
            style={({ pressed }) => [styles.order, pressed && styles.orderPressed]}
          >
            <View style={styles.metadata}>
              <Copy variant="reference" muted>
                {order.reference}
              </Copy>
              {order.priority === 'urgent' && (
                <Copy variant="caption" style={{ color: colors.amber }}>
                  Urgent
                </Copy>
              )}
              {state.outbox.some((item) => item.orderId === order.id) && (
                <Copy variant="caption" style={{ color: colors.amber }}>
                  Queued
                </Copy>
              )}
            </View>
            <Copy variant="record">{order.title}</Copy>
            <Copy muted>{order.site.name}</Copy>
            <View style={styles.metadata}>
              <Copy muted variant="caption">
                Due {order.dueDate}
              </Copy>
              <StatusBadge status={order.status} />
            </View>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <Notice
          title={
            view === 'outbox'
              ? 'Everything is up to date'
              : busy
                ? 'Loading assignments…'
                : search
                  ? 'No matching assignments'
                  : 'No saved assignments yet'
          }
        >
          {view === 'outbox'
            ? 'Reports waiting for confirmation will appear here.'
            : busy
              ? 'Opening your saved notebook and checking the server.'
              : search
                ? 'Try another reference, title or site.'
                : 'Connect and sync after your manager assigns work.'}
        </Notice>
      }
      ListFooterComponent={
        <View style={styles.footer}>
          <Copy muted variant="caption">
            {state.lastSynced
              ? `Last synced ${new Date(state.lastSynced).toLocaleString()}`
              : 'Not yet synced'}
          </Copy>
          <Copy muted variant="caption">
            Drafts stay on this device.
          </Copy>
          <Button
            title="Sign out"
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
