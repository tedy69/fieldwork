import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Storage from 'expo-sqlite/kv-store';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import {
  blankDraft,
  ReportInputSchema,
  type Draft,
  type User,
  type WorkOrder,
} from '@fieldwork/contracts';
import { createClient } from '@fieldwork/sdk';
import {
  createOfflineRepository,
  emptyState,
  type OfflineRepository,
  type State,
} from '@fieldwork/offline';
import {
  AnswerChoice,
  Brand,
  Button,
  Copy,
  Field,
  Notice,
  Panel,
  SectionHeading,
  StatusBadge,
  statusLabels,
} from './notebook-ui';
import { colors, radius, size, spacing } from './theme';

type Session = { user: User; token: string; baseUrl: string };
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to complete this action.';
export default function App() {
  const emailInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const passwordInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [baseUrl, setBaseUrl] = useState(
    process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    SecureStore.getItemAsync('fieldwork-session')
      .then((value) => {
        if (value) setSession(JSON.parse(value));
      })
      .catch(() => setError('Could not unlock the saved session. Sign in again.'))
      .finally(() => setReady(true));
  }, []);
  async function login() {
    setBusy(true);
    setError('');
    try {
      const url = new URL(baseUrl.trim());
      if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('Use an HTTP or HTTPS server address.');
      const result = await createClient(url.origin).login(email.trim(), password);
      if (result.user.role !== 'worker')
        throw new Error('Use a field worker account here. Managers use the web dispatch desk.');
      const session = { ...result, baseUrl: url.origin };
      await SecureStore.setItemAsync('fieldwork-session', JSON.stringify(session));
      setSession(session);
      setPassword('');
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (session)
      void createClient(session.baseUrl, () => session.token)
        .logout()
        .catch(() => {});
    await SecureStore.deleteItemAsync('fieldwork-session');
    setSession(null);
  }
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {session ? (
            <Notebook key={session.user.id} session={session} logout={logout} />
          ) : (
            <ScrollView
              contentInsetAdjustmentBehavior="automatic"
              contentContainerStyle={styles.login}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              <Brand />
              <View style={styles.introduction}>
                <Copy accessibilityRole="header" variant="title">
                  Open your notebook
                </Copy>
                <Copy muted>
                  Sign in while connected. Keep the inspection with you on site, even offline.
                </Copy>
              </View>
              <Panel>
                <Field
                  label="Server address"
                  value={baseUrl}
                  onChangeText={setBaseUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                  clearButtonMode="while-editing"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => emailInput.current?.focus()}
                  autoCorrect={false}
                  hint="On a physical device, use your server's LAN address or HTTPS URL."
                />
                <Field
                  label="Email"
                  testID="login-email"
                  inputRef={emailInput}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => passwordInput.current?.focus()}
                  placeholder="you@your-team.com"
                />
                <Field
                  label="Password"
                  testID="login-password"
                  inputRef={passwordInput}
                  returnKeyType="go"
                  onSubmitEditing={() => {
                    if (!busy && email && password) void login();
                  }}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="current-password"
                />
                {error ? (
                  <Notice error title="Could not open the notebook">
                    {error}
                  </Notice>
                ) : null}
                <Button
                  title={busy || !ready ? 'Opening notebook…' : 'Sign in'}
                  onPress={() => void login()}
                  disabled={busy || !ready || !email || !password}
                />
              </Panel>
              <Copy variant="caption" muted>
                Running the local demo? Use worker@fieldwork.local with password fieldwork-demo
                after seeding the server.
              </Copy>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
function Notebook({ session, logout }: { session: Session; logout: () => Promise<void> }) {
  const { fontScale } = useWindowDimensions();
  const client = useMemo(() => createClient(session.baseUrl, () => session.token), [session]);
  const repo = useMemo(
    () =>
      createOfflineRepository(
        {
          read: async () => {
            const value = await Storage.getItem(`fieldwork:v1:${session.user.id}`);
            return value ? JSON.parse(value) : null;
          },
          write: (state) =>
            Storage.setItem(`fieldwork:v1:${session.user.id}`, JSON.stringify(state)),
        },
        client.submitReport,
      ),
    [client],
  );
  const [state, setState] = useState<State>(emptyState);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!selected) return false;
      setSelected(null);
      return true;
    });
    return () => listener.remove();
  }, [selected]);
  async function sync() {
    setBusy(true);
    setError('');
    try {
      await repo.flush();
      const first = await client.orders();
      const orders = [...first.data];
      for (let offset = first.limit; offset < first.total; offset += first.limit)
        orders.push(...(await client.orders(offset)).data);
      await repo.cacheOrders(orders);
    } catch (error) {
      setError(`${errorText(error)} Saved inspections are still available.`);
    } finally {
      setState(await repo.read());
      setBusy(false);
    }
  }
  useEffect(() => {
    const update = () => {
      void repo
        .read()
        .then(setState)
        .catch((error) => setError(errorText(error)));
    };
    update();
    const unsubscribe = repo.subscribe(update);
    void sync();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => {
      unsubscribe();
      listener.remove();
    };
  }, [repo]);
  const order = state.orders.find((order) => order.id === selected);
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      <View style={[styles.header, fontScale > 1.4 && styles.headerLarge]}>
        <View style={styles.headerIdentity}>
          <Brand />
          <Copy variant="caption" muted>
            {session.user.name}
          </Copy>
        </View>
        <Button
          title={busy ? 'Syncing…' : 'Sync now'}
          onPress={() => void sync()}
          disabled={busy}
          quiet
        />
      </View>
      <View style={styles.content}>
        {error ? (
          <Notice error title="Sync needs attention">
            {error}
          </Notice>
        ) : null}
        {order ? (
          <Inspection
            key={`${order.id}:${order.version}`}
            order={order}
            state={state}
            repo={repo}
            sync={sync}
            back={() => setSelected(null)}
            baseUrl={session.baseUrl}
            token={session.token}
          />
        ) : (
          <>
            <View style={styles.introduction}>
              <Copy accessibilityRole="header" variant="title">
                My assignments
              </Copy>
              <Copy muted>Open a work order. Keep the inspection with you.</Copy>
            </View>
            <View style={styles.summary}>
              <View style={styles.metric}>
                <Copy variant="heading">{state.orders.length}</Copy>
                <Copy muted variant="caption">
                  Saved assignments
                </Copy>
              </View>
              <View style={styles.metric}>
                <Copy variant="heading" style={{ color: colors.amber }}>
                  {state.outbox.length}
                </Copy>
                <Copy muted variant="caption">
                  Waiting to sync
                </Copy>
              </View>
            </View>
            {state.outbox
              .filter((item) => item.state === 'blocked')
              .map((item) => (
                <Notice title="Report needs attention" key={item.input.mutationId}>
                  <Copy muted>{item.error}</Copy>
                  <Button
                    quiet
                    title="Keep draft and open latest"
                    onPress={async () => {
                      await repo.discard(item.orderId);
                      await sync();
                      setSelected(item.orderId);
                    }}
                  />
                </Notice>
              ))}
            {state.orders.length === 0 ? (
              <Notice title={busy ? 'Loading assignments…' : 'No saved assignments yet'}>
                {busy
                  ? 'Opening your saved notebook and checking the server.'
                  : 'Connect and sync after your manager assigns work.'}
              </Notice>
            ) : (
              <Panel style={styles.ledger}>
                {state.orders.map((order) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${order.reference}: ${order.title}`}
                    key={order.id}
                    onPress={() => setSelected(order.id)}
                    style={({ pressed }) => [styles.order, pressed && styles.orderPressed]}
                  >
                    <View style={styles.referenceRow}>
                      <Copy variant="reference" muted>
                        {order.reference}
                      </Copy>
                      {order.priority === 'urgent' && (
                        <Copy variant="caption" style={{ color: colors.amber }}>
                          Urgent
                        </Copy>
                      )}
                    </View>
                    <Copy variant="label">{order.title}</Copy>
                    <Copy muted>{order.site.name}</Copy>
                    <View style={styles.row}>
                      <Copy muted variant="caption">
                        Due {order.dueDate}
                      </Copy>
                      <StatusBadge status={order.status} />
                    </View>
                  </Pressable>
                ))}
              </Panel>
            )}
            <Copy muted variant="caption">
              {state.lastSynced
                ? `Last synced ${new Date(state.lastSynced).toLocaleString()}`
                : 'Not yet synced'}
            </Copy>
            <Button quiet title="Sign out" onPress={() => void logout()} />
            <Copy muted variant="caption">
              Unsent drafts stay on this device and return when you sign in with the same account.
            </Copy>
          </>
        )}
      </View>
    </ScrollView>
  );
}
function Inspection({
  order,
  state,
  repo,
  sync,
  back,
  baseUrl,
  token,
}: {
  order: WorkOrder;
  state: State;
  repo: OfflineRepository;
  sync: () => Promise<void>;
  back: () => void;
  baseUrl: string;
  token: string;
}) {
  const [draft, setDraft] = useState<Draft>(state.drafts[order.id] ?? blankDraft(order));
  const currentDraft = useRef(draft);
  const pendingWrites = useRef(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const queued = state.outbox.find((item) => item.orderId === order.id);
  const editable = ['ASSIGNED', 'CHANGES_REQUESTED'].includes(order.status) && !queued;
  async function save(value: Draft) {
    currentDraft.current = value;
    setDraft(value);
    pendingWrites.current += 1;
    setSaving(true);
    try {
      await repo.saveDraft(order.id, value);
    } catch {
      setError('Could not save this draft. Free some device storage before leaving.');
    } finally {
      pendingWrites.current -= 1;
      setSaving(pendingWrites.current > 0);
    }
  }
  async function attach(camera: boolean) {
    setPreparingPhoto(true);
    setBusy(true);
    setError('');
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
        throw new Error('Camera access was not granted. You can choose a photo instead.');
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.4,
        base64: true,
      };
      const result = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled) {
        const data = result.assets[0].base64;
        if (!data || data.length > 2_666_664) throw new Error('Choose a photo smaller than 2 MB.');
        const mimeType = data.startsWith('/9j/')
          ? 'image/jpeg'
          : data.startsWith('iVBOR')
            ? 'image/png'
            : 'image/webp';
        await save({
          ...currentDraft.current,
          photos: [...currentDraft.current.photos, { id: Crypto.randomUUID(), mimeType, data }],
        });
      }
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
      setPreparingPhoto(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const input = ReportInputSchema.parse({
        ...draft,
        mutationId: Crypto.randomUUID(),
        baseVersion: order.version,
      });
      await repo.saveDraft(order.id, draft);
      await repo.enqueue(order.id, input);
      await sync();
      Alert.alert(
        'Report saved',
        'Your report stays in the outbox until the server confirms receipt.',
      );
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button title="Back to assignments" quiet onPress={back} />
      <View style={styles.introduction}>
        <Copy variant="reference" muted>
          {order.reference}
        </Copy>
        <Copy accessibilityRole="header" variant="title">
          {order.title}
        </Copy>
        <StatusBadge status={order.status} />
      </View>
      <View style={styles.metadata}>
        <View style={styles.introduction}>
          <Copy muted variant="caption">
            Site
          </Copy>
          <Copy variant="label">{order.site.name}</Copy>
          <Copy muted variant="caption">
            {order.site.address}
          </Copy>
        </View>
        <View style={styles.row}>
          <View style={styles.introduction}>
            <Copy muted variant="caption">
              Assigned to
            </Copy>
            <Copy>{order.assignee.name}</Copy>
          </View>
          <View style={styles.introduction}>
            <Copy muted variant="caption">
              Due / priority
            </Copy>
            <Copy>
              {order.dueDate} · {order.priority}
            </Copy>
          </View>
        </View>
      </View>
      <Panel>
        <SectionHeading title="Field brief" />
        <Copy>{order.instructions || 'Complete the checklist and describe your findings.'}</Copy>
      </Panel>
      {order.review && (
        <Notice title={statusLabels[order.review.decision]}>
          {order.review.note || 'The inspection report has been accepted.'}
        </Notice>
      )}
      {queued && (
        <Notice
          title={
            queued.state === 'blocked'
              ? 'Sync needs your attention'
              : 'Report queued on this device'
          }
        >
          {queued.error ??
            'Your checklist, notes, and photos are saved. Sync when a connection is available.'}
        </Notice>
      )}
      {editable ? (
        <>
          <SectionHeading
            title="Inspection checklist"
            detail={saving ? 'Saving locally…' : 'Draft saved on this device'}
          />
          {order.template.items.map((item, index) => {
            const answer = draft.answers.find((answer) => answer.itemId === item.id)!;
            return (
              <Panel key={item.id}>
                <View style={styles.questionHeading}>
                  <Copy variant="reference" muted>
                    {index + 1}
                  </Copy>
                  <Copy variant="label" style={styles.flex}>
                    {item.label}
                  </Copy>
                </View>
                <View style={styles.answers}>
                  {(['pass', 'fail', 'na'] as const).map((value) => (
                    <AnswerChoice
                      selected={answer.value === value}
                      name={`${item.label}: ${value}`}
                      label={value === 'pass' ? 'Pass' : value === 'fail' ? 'Issue found' : 'N/A'}
                      key={value}
                      onPress={() =>
                        void save({
                          ...draft,
                          answers: draft.answers.map((entry) =>
                            entry.itemId === item.id ? { ...entry, value } : entry,
                          ),
                        })
                      }
                    />
                  ))}
                </View>
                <Field
                  label={`Note: ${item.label}`}
                  testID={`inspection-note-${item.id}`}
                  hideLabel
                  placeholder="Add a note (optional)"
                  value={answer.note}
                  maxLength={1000}
                  onChangeText={(note) =>
                    void save({
                      ...draft,
                      answers: draft.answers.map((entry) =>
                        entry.itemId === item.id ? { ...entry, note } : entry,
                      ),
                    })
                  }
                />
              </Panel>
            );
          })}
          <Field
            label="Inspection summary"
            testID="inspection-summary"
            placeholder="Describe the site condition and follow-up work."
            multiline
            value={draft.summary}
            maxLength={4000}
            onChangeText={(summary) => void save({ ...draft, summary })}
          />
          <Panel>
            <SectionHeading title="Site photos" detail={`${draft.photos.length} of 3 attached`} />
            {order.template.requiresPhoto && (
              <Copy muted variant="caption">
                At least one site photo is required for each submission, including corrections.
              </Copy>
            )}
            {draft.photos.map((photo, index) => (
              <View key={photo.id}>
                <Image
                  accessibilityLabel={`Site photo ${index + 1}`}
                  source={{ uri: `data:${photo.mimeType};base64,${photo.data}` }}
                  style={styles.photo}
                />
                <Button
                  title={`Remove photo ${index + 1}`}
                  quiet
                  onPress={() =>
                    void save({
                      ...draft,
                      photos: draft.photos.filter((entry) => entry.id !== photo.id),
                    })
                  }
                />
              </View>
            ))}
            <View style={styles.row}>
              <View style={styles.photoAction}>
                <Button
                  title="Take photo"
                  quiet
                  disabled={busy || draft.photos.length >= 3}
                  onPress={() => void attach(true)}
                />
              </View>
              <View style={styles.photoAction}>
                <Button
                  title="Choose photo"
                  quiet
                  disabled={busy || draft.photos.length >= 3}
                  onPress={() => void attach(false)}
                />
              </View>
            </View>
            <Copy muted variant="caption">
              Up to 3 photos, 2 MB each. Photos are saved with your offline draft.
            </Copy>
          </Panel>
          {error ? (
            <Notice error title="Inspection needs attention">
              {error}
            </Notice>
          ) : null}
          <View style={styles.submitBar}>
            <Copy muted variant="caption">
              Your report stays on this device until the server confirms it.
            </Copy>
            <Button
              title={
                busy
                  ? preparingPhoto
                    ? 'Preparing photo…'
                    : 'Saving report…'
                  : 'Save and sync inspection'
              }
              disabled={
                busy ||
                saving ||
                !draft.summary.trim() ||
                draft.answers.some((answer) => !answer.value)
              }
              onPress={() => void submit()}
            />
          </View>
        </>
      ) : order.report ? (
        <Panel>
          <SectionHeading
            title="Inspection report"
            detail={`Submitted ${new Date(order.report.submittedAt).toLocaleString()}`}
          />
          {order.report.answers.map((answer) => (
            <View key={answer.itemId} style={styles.checkItem}>
              <Copy variant="label">
                {order.template.items.find((item) => item.id === answer.itemId)?.label}
              </Copy>
              <Copy style={answer.value === 'fail' ? { color: colors.amber } : undefined}>
                {answer.value === 'fail' ? 'Issue found' : answer.value === 'pass' ? 'Pass' : 'N/A'}
              </Copy>
              {answer.note ? <Copy muted>{answer.note}</Copy> : null}
            </View>
          ))}
          <SectionHeading title="Summary" />
          <Copy>{order.report.summary}</Copy>
          {order.report.photos.map((photo) => (
            <Image
              key={photo.id}
              accessibilityLabel="Submitted site photo"
              source={{
                uri: `${baseUrl}/api/v1/photos/${photo.id}`,
                headers: { Authorization: `Bearer ${token}` },
              }}
              style={styles.photo}
            />
          ))}
        </Panel>
      ) : null}
    </>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  login: {
    padding: spacing.xl,
    gap: spacing.section,
    paddingVertical: spacing.page,
    width: '100%',
    maxWidth: size.content,
    alignSelf: 'center',
  },
  content: {
    padding: spacing.xl,
    gap: spacing.section,
    paddingBottom: spacing.page,
    width: '100%',
    maxWidth: size.content,
    alignSelf: 'center',
  },
  introduction: { gap: spacing.sm },
  headerIdentity: { flexGrow: 1, flexShrink: 1, minWidth: 200, gap: spacing.xs },
  headerLarge: { flexDirection: 'column', alignItems: 'stretch' },
  header: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.sidebar,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summary: {
    flexDirection: 'row',
    gap: spacing.section,
    flexWrap: 'wrap',
    paddingBottom: spacing.xl,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  metric: { flex: 1, minWidth: 120, gap: spacing.xs },
  ledger: { padding: 0, gap: 0, overflow: 'hidden' },
  order: {
    padding: spacing.xl,
    gap: spacing.sm,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
  },
  orderPressed: { backgroundColor: colors.raised },
  referenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metadata: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.xl,
    gap: spacing.xl,
  },
  questionHeading: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  answers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'stretch' },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  checkItem: {
    paddingBottom: spacing.lg,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  photoAction: { flex: 1, minWidth: 120 },
  submitBar: {
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingTop: spacing.xl,
    gap: spacing.lg,
  },
  photo: { width: '100%', height: size.photo, resizeMode: 'cover', borderRadius: radius.control },
});
