import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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

type Session = { user: User; token: string; baseUrl: string };
const statusLabel = {
  ASSIGNED: 'Assigned',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
};
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to complete this action.';
function Button({
  title,
  onPress,
  disabled = false,
  quiet = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  quiet?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, quiet && styles.quiet, disabled && { opacity: 0.5 }]}
    >
      <Text style={[styles.buttonText, quiet && { color: '#edf1ee' }]}>{title}</Text>
    </Pressable>
  );
}
export default function App() {
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
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      {session ? (
        <Notebook key={session.user.id} session={session} logout={logout} />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.login} keyboardShouldPersistTaps="handled">
            <Text style={styles.eyebrow}>FIELD OPERATIONS / v0.1</Text>
            <Text style={styles.brand}>Fieldwork</Text>
            <Text style={styles.title}>Your field notebook.</Text>
            <Text style={styles.muted}>
              Sign in while connected. Your assigned inspections, notes, and photos stay available
              on site.
            </Text>
            <Text style={styles.label}>Server address</Text>
            <TextInput
              accessibilityLabel="Server address"
              style={styles.input}
              value={baseUrl}
              onChangeText={setBaseUrl}
              autoCapitalize="none"
              keyboardType="url"
            />
            <Text style={styles.hint}>
              On a physical device, use your server's LAN address or HTTPS URL.
            </Text>
            <Text style={styles.label}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              testID="login-email"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              testID="login-password"
              returnKeyType="go"
              onSubmitEditing={() => {
                if (!busy && email && password) void login();
              }}
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
            />
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
            <Button
              title={busy || !ready ? 'Opening notebook…' : 'Sign in'}
              onPress={() => void login()}
              disabled={busy || !ready || !email || !password}
            />
            <Text style={styles.hint}>
              Local demo: worker@fieldwork.local / fieldwork-demo. Run the seed command first.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
function Notebook({ session, logout }: { session: Session; logout: () => Promise<void> }) {
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
  const [busy, setBusy] = useState(false);
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
    <>
      <View style={styles.header}>
        <View>
          <Text style={styles.brandSmall}>Fieldwork</Text>
          <Text style={styles.hint}>{session.user.name}</Text>
        </View>
        <Button
          title={
            busy ? 'Syncing…' : `Sync${state.outbox.length ? ` (${state.outbox.length})` : ''}`
          }
          onPress={() => void sync()}
          disabled={busy}
          quiet
        />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
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
            <Text style={styles.eyebrow}>YOUR ASSIGNMENTS</Text>
            <Text style={styles.title}>Out in the field.</Text>
            <Text style={styles.muted}>
              {state.orders.length} work orders · {state.outbox.length} waiting to sync
            </Text>
            {state.outbox
              .filter((item) => item.state === 'blocked')
              .map((item) => (
                <View style={styles.notice} key={item.input.mutationId}>
                  <Text style={styles.amber}>Report needs attention</Text>
                  <Text style={styles.muted}>{item.error}</Text>
                  <Button
                    quiet
                    title="Keep draft and open latest"
                    onPress={async () => {
                      await repo.discard(item.orderId);
                      await sync();
                      setSelected(item.orderId);
                    }}
                  />
                </View>
              ))}
            {state.orders.length === 0 ? (
              <Text style={styles.notice}>
                No saved assignments yet. Connect and sync after your manager assigns work.
              </Text>
            ) : (
              state.orders.map((order) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${order.reference}: ${order.title}`}
                  key={order.id}
                  onPress={() => setSelected(order.id)}
                  style={styles.order}
                >
                  <Text style={styles.eyebrow}>
                    {order.reference} {order.priority === 'urgent' ? '/ URGENT' : ''}
                  </Text>
                  <Text style={styles.orderTitle}>{order.title}</Text>
                  <Text style={styles.muted}>{order.site.name}</Text>
                  <View style={styles.row}>
                    <Text style={styles.hint}>Due {order.dueDate}</Text>
                    <Text style={styles.amber}>{statusLabel[order.status]}</Text>
                  </View>
                </Pressable>
              ))
            )}
            <Text style={styles.hint}>
              {state.lastSynced
                ? `Last synced ${new Date(state.lastSynced).toLocaleString()}`
                : 'Not yet synced'}
            </Text>
            <Button quiet title="Lock notebook / sign out" onPress={() => void logout()} />
            <Text style={styles.hint}>
              Unsent drafts stay on this device and return when you sign in with the same account.
            </Text>
          </>
        )}
      </ScrollView>
    </>
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
      <Text style={styles.eyebrow}>
        {order.reference} / {statusLabel[order.status]}
      </Text>
      <Text style={styles.title}>{order.title}</Text>
      <Text style={styles.orderTitle}>{order.site.name}</Text>
      <Text style={styles.muted}>{order.site.address}</Text>
      <Text style={styles.notice}>{order.instructions}</Text>
      {order.review && (
        <View style={styles.notice}>
          <Text style={styles.amber}>{statusLabel[order.review.decision]}</Text>
          <Text style={styles.muted}>{order.review.note}</Text>
        </View>
      )}
      {queued && (
        <Text style={styles.notice}>
          {queued.error ?? 'Report queued. Sync when a connection is available.'}
        </Text>
      )}
      {editable ? (
        <>
          <View style={styles.row}>
            <Text style={styles.orderTitle}>Inspection checklist</Text>
            <Text style={styles.hint}>{saving ? 'Saving…' : 'Saved locally'}</Text>
          </View>
          {order.template.items.map((item, index) => {
            const answer = draft.answers.find((answer) => answer.itemId === item.id)!;
            return (
              <View key={item.id} style={styles.checkItem}>
                <Text style={styles.label}>
                  {String(index + 1).padStart(2, '0')} / {item.label}
                </Text>
                <View style={styles.row}>
                  {(['pass', 'fail', 'na'] as const).map((value) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: answer.value === value }}
                      accessibilityLabel={`${item.label}: ${value}`}
                      key={value}
                      style={[styles.option, answer.value === value && styles.optionSelected]}
                      onPress={() =>
                        void save({
                          ...draft,
                          answers: draft.answers.map((entry) =>
                            entry.itemId === item.id ? { ...entry, value } : entry,
                          ),
                        })
                      }
                    >
                      <Text style={answer.value === value ? styles.amber : styles.muted}>
                        {value === 'pass' ? 'Pass' : value === 'fail' ? 'Issue' : 'N/A'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  accessibilityLabel={`Note: ${item.label}`}
                  style={styles.input}
                  placeholder="Add a note (optional)"
                  placeholderTextColor="#adbbb6"
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
              </View>
            );
          })}
          <Text style={styles.label}>Inspection summary</Text>
          <TextInput
            accessibilityLabel="Inspection summary"
            placeholder="Describe the site condition and follow-up work."
            placeholderTextColor="#adbbb6"
            style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]}
            multiline
            value={draft.summary}
            maxLength={4000}
            onChangeText={(summary) => void save({ ...draft, summary })}
          />
          <Text style={styles.label}>Site photos / {draft.photos.length} of 3</Text>
          {order.template.requiresPhoto && (
            <Text style={styles.hint}>
              At least one site photo is required for each submission, including corrections.
            </Text>
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
            <View style={{ flex: 1 }}>
              <Button
                title="Take photo"
                quiet
                disabled={busy || draft.photos.length >= 3}
                onPress={() => void attach(true)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Choose photo"
                quiet
                disabled={busy || draft.photos.length >= 3}
                onPress={() => void attach(false)}
              />
            </View>
          </View>
          <Text style={styles.hint}>
            Up to 3 photos, 2 MB each. Photos are saved with your offline draft.
          </Text>
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Button
            title={busy ? 'Saving report…' : 'Save and sync inspection'}
            disabled={
              busy ||
              saving ||
              !draft.summary.trim() ||
              draft.answers.some((answer) => !answer.value)
            }
            onPress={() => void submit()}
          />
        </>
      ) : order.report ? (
        <>
          <Text style={styles.title}>Inspection report</Text>
          {order.report.answers.map((answer) => (
            <View key={answer.itemId} style={styles.checkItem}>
              <Text style={styles.label}>
                {order.template.items.find((item) => item.id === answer.itemId)?.label}
              </Text>
              <Text style={styles.amber}>
                {answer.value === 'fail' ? 'Issue found' : answer.value === 'pass' ? 'Pass' : 'N/A'}
              </Text>
              {answer.note ? <Text style={styles.muted}>{answer.note}</Text> : null}
            </View>
          ))}
          <Text style={styles.label}>Summary</Text>
          <Text style={styles.muted}>{order.report.summary}</Text>
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
        </>
      ) : null}
    </>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#151d20' },
  login: { padding: 26, gap: 10, paddingTop: 65 },
  content: { padding: 22, gap: 17, paddingBottom: 50 },
  header: {
    paddingHorizontal: 22,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: '#344145',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: { color: '#edf1ee', fontSize: 42, fontWeight: '700', marginBottom: 25 },
  brandSmall: { color: '#edf1ee', fontSize: 24, fontWeight: '700' },
  title: { color: '#edf1ee', fontSize: 31, fontWeight: '600', lineHeight: 38 },
  eyebrow: { color: '#adbbb6', fontSize: 10, letterSpacing: 1.3 },
  label: { color: '#edf1ee', fontSize: 14, fontWeight: '600', lineHeight: 23, marginTop: 8 },
  muted: { color: '#adbbb6', fontSize: 14, lineHeight: 23 },
  hint: { color: '#adbbb6', fontSize: 11, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: '#526164',
    backgroundColor: '#1c2629',
    color: '#edf1ee',
    padding: 13,
    borderRadius: 4,
    fontSize: 15,
  },
  button: {
    backgroundColor: '#f5c66d',
    padding: 15,
    borderRadius: 4,
    alignItems: 'center',
    minHeight: 46,
  },
  buttonText: { color: '#151d20', fontWeight: '700', fontSize: 13 },
  quiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#526164' },
  error: {
    color: '#ffb6a9',
    fontSize: 13,
    lineHeight: 22,
    padding: 12,
    backgroundColor: '#362a28',
  },
  notice: {
    color: '#d7e1db',
    backgroundColor: '#273131',
    padding: 16,
    borderLeftColor: '#f5c66d',
    borderLeftWidth: 3,
    lineHeight: 24,
    fontSize: 14,
    gap: 12,
  },
  order: { paddingVertical: 22, gap: 10, borderBottomColor: '#344145', borderBottomWidth: 1 },
  orderTitle: { color: '#edf1ee', fontSize: 17, fontWeight: '600', lineHeight: 25 },
  row: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  amber: { color: '#f5c66d', fontSize: 12, lineHeight: 20 },
  checkItem: { paddingVertical: 14, borderBottomColor: '#344145', borderBottomWidth: 1, gap: 14 },
  option: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderColor: '#526164',
    borderWidth: 1,
    borderRadius: 4,
  },
  optionSelected: { borderColor: '#f5c66d', backgroundColor: '#383c30' },
  photo: { width: '100%', height: 200, resizeMode: 'cover', borderRadius: 4 },
});
