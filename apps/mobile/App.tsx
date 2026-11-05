import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
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
  ArrowClockwise,
  ArrowLeft,
  Camera,
  ImageSquare,
  Trash,
  GearSix,
  Globe,
  MapPin,
} from './notebook-icons';
import {
  blankDraft,
  ReportInputSchema,
  MAX_REPORT_PHOTOS,
  availableSitePhotoSlots,
  checklistItemLabel,
  completedAnswers,
  parseReading,
  readingBounds,
  readingInputError,
  reportAnswers,
  reportItemLabel,
  reportPhotoError,
  type Draft,
  type User,
  type WorkOrder,
} from '@fieldwork/contracts';
import { ApiError, createClient } from '@fieldwork/sdk';
import {
  inspectionCopy,
  languageNames,
  notebookCopy,
  savedLocale,
  signInCopy,
  signInError,
  type Locale,
} from '@fieldwork/strings';
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
} from './notebook-ui';
import { colors, radius, size, spacing } from './theme';
import WorkspacePage, {
  NotebookNotice,
  type AssignmentFilter,
  type NotebookProblem,
} from './workspace-page';
import ReportHistoryAction from './report-history';
import SavedReport from './saved-report';
import { assignmentDate } from './assignment-date';

type Session = { user: User; token: string; baseUrl: string };
type SignInProblem =
  { local: 'invalidServer' | 'workerOnly' | 'unlockFailed' } | { api?: ApiError; detail: string };
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to complete this action.';
function serverOrigin(value: string) {
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}
export default function App() {
  const emailInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const passwordInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const sessionClosing = useRef(false);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [baseUrl, setBaseUrl] = useState(
    process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serverExpanded, setServerExpanded] = useState(false);
  const [locale, setLocale] = useState(() => {
    try {
      return savedLocale(Storage.getItemSync('fieldwork.locale'));
    } catch {
      return 'en' as const;
    }
  });
  const [error, setError] = useState<SignInProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = signInCopy[locale];
  const alternate: Locale = locale === 'en' ? 'id' : 'en';
  useEffect(() => {
    SecureStore.getItemAsync('fieldwork-session')
      .then((value) => {
        if (value) setSession(JSON.parse(value));
      })
      .catch(() => setError({ local: 'unlockFailed' }))
      .finally(() => setReady(true));
  }, []);
  function changeLanguage(next: Locale) {
    setLocale(next);
    try {
      Storage.setItemSync('fieldwork.locale', next);
    } catch {
      // The current session can still use the selected language.
    }
  }
  async function login() {
    const origin = serverOrigin(baseUrl);
    if (!origin) {
      setError({ local: 'invalidServer' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createClient(origin).login(email.trim(), password);
      if (result.user.role !== 'worker') {
        setError({ local: 'workerOnly' });
        return;
      }
      const session = { ...result, baseUrl: origin };
      await SecureStore.setItemAsync('fieldwork-session', JSON.stringify(session));
      setSession(session);
      setPassword('');
    } catch (error) {
      setError({ api: error instanceof ApiError ? error : undefined, detail: errorText(error) });
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (!session || sessionClosing.current) return;
    sessionClosing.current = true;
    try {
      void createClient(session.baseUrl, () => session.token)
        .logout()
        .catch(() => {});
      await SecureStore.deleteItemAsync('fieldwork-session');
      setSession(null);
    } finally {
      sessionClosing.current = false;
    }
  }
  async function signInAgain() {
    if (!session) return;
    setBaseUrl(session.baseUrl);
    setEmail(session.user.email);
    setPassword('');
    setError(null);
    await logout();
  }
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {session ? (
            <Notebook
              key={session.user.id}
              session={session}
              logout={logout}
              signInAgain={signInAgain}
              locale={locale}
              onLanguageChange={changeLanguage}
            />
          ) : (
            <ScrollView
              contentInsetAdjustmentBehavior="automatic"
              contentContainerStyle={styles.login}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              <View style={styles.loginHeader}>
                <Brand />
                <Button
                  title={languageNames[alternate]}
                  icon={Globe}
                  variant="ghost"
                  onPress={() => changeLanguage(alternate)}
                />
              </View>
              <View style={styles.introduction}>
                <Copy accessibilityRole="header" variant="title">
                  {copy.native.heading}
                </Copy>
              </View>
              <Panel>
                {serverExpanded && (
                  <Field
                    label={copy.native.serverAddress}
                    actionLabels={copy}
                    value={baseUrl}
                    onChangeText={setBaseUrl}
                    autoCapitalize="none"
                    keyboardType="url"
                    clearButtonMode="while-editing"
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => emailInput.current?.focus()}
                    autoCorrect={false}
                    hint={copy.native.serverHint}
                  />
                )}
                <Field
                  label={copy.email}
                  actionLabels={copy}
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
                  placeholder={copy.emailExample}
                />
                <Field
                  label={copy.password}
                  actionLabels={copy}
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
                  <Notice error title={copy.native.errorTitle}>
                    {'local' in error
                      ? copy.native[error.local]
                      : signInError(locale, error.api, error.detail)}
                  </Notice>
                ) : null}
                <Button
                  title={busy || !ready ? copy.native.opening : copy.signIn}
                  onPress={() => void login()}
                  disabled={busy || !ready || !email || !password}
                />
              </Panel>
              <View style={styles.introduction}>
                <View style={styles.row}>
                  <Copy variant="caption" muted>
                    {copy.native.server}
                  </Copy>
                  <Button
                    title={serverExpanded ? copy.native.hideServer : copy.native.changeServer}
                    icon={GearSix}
                    iconOnly
                    variant="ghost"
                    expanded={serverExpanded}
                    onPress={() => setServerExpanded(!serverExpanded)}
                  />
                </View>
                <Copy variant="caption" muted>
                  {baseUrl}
                </Copy>
              </View>
              <Copy variant="caption" muted>
                {copy.native.help}
              </Copy>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
function Notebook({
  session,
  logout,
  signInAgain,
  locale,
  onLanguageChange,
}: {
  session: Session;
  logout: () => Promise<void>;
  signInAgain: () => Promise<void>;
  locale: Locale;
  onLanguageChange: (locale: Locale) => void;
}) {
  const copy = notebookCopy[locale];
  const notebookScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
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
  const [notebookView, setNotebookView] = useState<'assignments' | 'outbox'>('assignments');
  const [search, setSearch] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>(null);
  const listOffset = useRef(0);
  useEffect(() => {
    notebookScroll.current?.scrollTo({ y: 0, animated: false });
  }, [selected]);
  const [error, setError] = useState<NotebookProblem | null>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!selected) return false;
      setSelected(null);
      return true;
    });
    return () => listener.remove();
  }, [selected]);
  async function loadNotebook() {
    try {
      setState(await repo.read());
    } catch {
      setError((current) => (current === 'session' ? current : 'notebookReadFailed'));
    }
  }
  async function sync() {
    setBusy(true);
    try {
      await repo.flush();
      const first = await client.orders();
      const orders = [...first.data];
      for (let offset = first.limit; offset < first.total; offset += first.limit)
        orders.push(...(await client.orders(offset)).data);
      await repo.cacheOrders(orders);
      setError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setError('session');
      else setError((current) => (current === 'session' ? current : 'syncUnavailable'));
    } finally {
      await loadNotebook();
      setBusy(false);
    }
  }
  useEffect(() => {
    void loadNotebook();
    const unsubscribe = repo.subscribe(() => void loadNotebook());
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
  if (!order)
    return (
      <WorkspacePage
        state={state}
        user={session.user}
        locale={locale}
        onLanguageChange={onLanguageChange}
        busy={busy}
        error={error}
        onSync={() => void sync()}
        onOpen={(id) => {
          Keyboard.dismiss();
          setSelected(id);
        }}
        onLogout={() => void logout()}
        onSignInAgain={() => void signInAgain()}
        view={notebookView}
        onViewChange={(view) => {
          listOffset.current = 0;
          setNotebookView(view);
        }}
        search={search}
        onSearchChange={(search) => {
          listOffset.current = 0;
          setSearch(search);
        }}
        assignmentFilter={assignmentFilter}
        onAssignmentFilterChange={(filter) => {
          listOffset.current = 0;
          setAssignmentFilter(filter);
        }}
        scrollPosition={listOffset}
        onResolve={async (orderId, mutationId) => {
          setBusy(true);
          try {
            const latest = await client.order(orderId);
            await repo.reopenBlocked(latest, mutationId);
            setState(await repo.read());
            setSelected(orderId);
            setError(null);
          } catch (error) {
            const status = error instanceof ApiError ? error.status : undefined;
            setError(
              status === 401
                ? 'session'
                : status === 403 || status === 404
                  ? 'recoveryUnavailable'
                  : 'recoveryFailed',
            );
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  return (
    <ScrollView
      ref={notebookScroll}
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
          title={busy ? copy.syncing : copy.sync}
          icon={ArrowClockwise}
          iconOnly
          onPress={() => void sync()}
          disabled={busy}
          variant="ghost"
        />
      </View>
      <View style={styles.content}>
        {error && (
          <NotebookNotice error={error} locale={locale} onSignInAgain={() => void signInAgain()} />
        )}
        <Inspection
          key={`${order.id}:${order.version}`}
          order={order}
          state={state}
          repo={repo}
          sync={sync}
          back={() => setSelected(null)}
          baseUrl={session.baseUrl}
          token={session.token}
          locale={locale}
        />
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
  locale,
}: {
  order: WorkOrder;
  state: State;
  repo: OfflineRepository;
  sync: () => Promise<void>;
  back: () => void;
  baseUrl: string;
  token: string;
  locale: Locale;
}) {
  const copy = inspectionCopy[locale];
  const labels = signInCopy[locale];
  const [draft, setDraft] = useState<Draft>(state.drafts[order.id] ?? blankDraft(order));
  const currentDraft = useRef(draft);
  const pendingWrites = useRef(0);
  const attaching = useRef(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const queued = state.outbox.find((item) => item.orderId === order.id);
  const editable = ['ASSIGNED', 'CHANGES_REQUESTED'].includes(order.status) && !queued;
  const completed = completedAnswers(order.template, draft.answers);
  const sitePhotoSlots = availableSitePhotoSlots(order.template, draft.photos);
  async function save(value: Draft) {
    currentDraft.current = value;
    setDraft(value);
    pendingWrites.current += 1;
    setSaving(true);
    try {
      await repo.saveDraft(order.id, value);
    } catch {
      setError(copy.saveFailed);
    } finally {
      pendingWrites.current -= 1;
      setSaving(pendingWrites.current > 0);
    }
  }
  async function attach(camera: boolean, itemId?: string) {
    if (attaching.current) return;
    const photos = currentDraft.current.photos;
    if (itemId) {
      if (photos.length >= MAX_REPORT_PHOTOS || photos.some((photo) => photo.itemId === itemId))
        return;
    } else if (availableSitePhotoSlots(order.template, photos) === 0) return;
    attaching.current = true;
    setPreparingPhoto(true);
    setBusy(true);
    setError('');
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted)
        throw new Error(copy.cameraDenied);
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
        if (!data || data.length > 2_666_664) throw new Error(copy.photoTooLarge);
        const mimeType = data.startsWith('/9j/')
          ? 'image/jpeg'
          : data.startsWith('iVBOR')
            ? 'image/png'
            : 'image/webp';
        await save({
          ...currentDraft.current,
          photos: [
            ...currentDraft.current.photos,
            { id: Crypto.randomUUID(), mimeType, data, ...(itemId && { itemId }) },
          ],
        });
      }
    } catch (error) {
      setError(errorText(error));
    } finally {
      attaching.current = false;
      setBusy(false);
      setPreparingPhoto(false);
    }
  }
  async function submit() {
    if (attaching.current) return;
    setBusy(true);
    setError('');
    try {
      const input = ReportInputSchema.parse({
        ...draft,
        answers: reportAnswers(draft.answers),
        mutationId: Crypto.randomUUID(),
        baseVersion: order.version,
      });
      await repo.saveDraft(order.id, draft);
      const photoError = reportPhotoError(order.template, input.photos, copy.photoErrors);
      if (photoError) throw new Error(photoError.message);
      await repo.enqueue(order.id, input);
      await sync();
      Alert.alert(copy.reportSaved, copy.outboxHint);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <View style={styles.inspectionTools}>
        <Button title={copy.back} icon={ArrowLeft} iconOnly variant="ghost" onPress={back} />
        {order.report && (
          <ReportHistoryAction order={order} baseUrl={baseUrl} token={token} locale={locale} />
        )}
      </View>
      <View style={styles.introduction}>
        <Copy variant="reference" muted>
          {order.reference}
        </Copy>
        <Copy accessibilityRole="header" variant="title">
          {order.title}
        </Copy>
        <StatusBadge status={order.status} locale={locale} />
      </View>
      <View style={styles.metadata}>
        <View style={styles.introduction}>
          <Copy muted variant="caption">
            {copy.site}
          </Copy>
          <Copy variant="label">{order.site.name}</Copy>
          <Copy muted variant="caption">
            {order.site.address}
          </Copy>
          {order.site.coordinates && (
            <View style={styles.siteCoordinates}>
              <View accessible={false} importantForAccessibility="no-hide-descendants">
                <MapPin size={18} color={colors.muted} />
              </View>
              <Copy muted variant="caption" style={styles.flex}>
                {copy.coordinates(
                  order.site.coordinates.latitude,
                  order.site.coordinates.longitude,
                )}
              </Copy>
            </View>
          )}
        </View>
        <View style={styles.row}>
          <View style={styles.introduction}>
            <Copy muted variant="caption">
              {copy.assignee}
            </Copy>
            <Copy>{order.assignee.name}</Copy>
          </View>
          <View style={styles.introduction}>
            <Copy muted variant="caption">
              {copy.duePriority}
            </Copy>
            <Copy>
              {assignmentDate(order.dueDate, locale)} · {copy.priority[order.priority]}
            </Copy>
          </View>
        </View>
      </View>
      <Panel variant="plain">
        <SectionHeading title={copy.brief} />
        <Copy>{order.instructions || copy.defaultInstructions}</Copy>
      </Panel>
      {order.review && (
        <Notice title={notebookCopy[locale].status[order.review.decision]}>
          {order.review.note || copy.accepted}
        </Notice>
      )}
      {queued && (
        <Notice title={queued.state === 'blocked' ? copy.queueBlocked : copy.queued}>
          {queued.error ?? copy.queuedHint}
        </Notice>
      )}
      {editable ? (
        <>
          <SectionHeading
            title={copy.checklist}
            detail={`${copy.progress(completed, order.template.items.length)} · ${saving ? copy.savingLocally : copy.draftSaved}`}
          />
          <Panel style={styles.ledger}>
            {order.template.items.map((item, index) => {
              const answer = draft.answers.find((answer) => answer.itemId === item.id)!;
              const bounds = readingBounds(item, copy.bounds);
              const readingHint = bounds && copy.readingHint(bounds);
              const readingError = readingInputError(item, answer.reading)
                ? bounds && parseReading(answer.reading) !== null
                  ? copy.invalidBounds(bounds)
                  : copy.invalidNumber
                : undefined;
              const hasPhoto = draft.photos.some((photo) => photo.itemId === item.id);
              return (
                <View key={item.id} style={[styles.question, index > 0 && styles.questionDivider]}>
                  <View style={styles.questionHeading}>
                    <Copy variant="reference" muted>
                      {index + 1}
                    </Copy>
                    <Copy variant="record" style={styles.flex}>
                      {checklistItemLabel(item)}
                    </Copy>
                  </View>
                  {item.responseType === 'text' ? (
                    <Field
                      label={`${copy.response}: ${item.label}`}
                      actionLabels={labels}
                      value={answer.text ?? ''}
                      multiline
                      maxLength={1000}
                      testID={`inspection-response-${item.id}`}
                      onChangeText={(text) =>
                        void save({
                          ...draft,
                          answers: draft.answers.map((entry) =>
                            entry.itemId === item.id ? { ...entry, value: 'text', text } : entry,
                          ),
                        })
                      }
                    />
                  ) : item.responseType === 'number' ? (
                    <>
                      <Field
                        label={`${copy.reading}: ${checklistItemLabel(item)}`}
                        accessibilityHint={readingHint}
                        actionLabels={labels}
                        value={answer.reading ?? ''}
                        maxLength={100}
                        autoCorrect={false}
                        autoCapitalize="none"
                        keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                        testID={`inspection-reading-${item.id}`}
                        onChangeText={(reading) =>
                          void save({
                            ...draft,
                            answers: draft.answers.map((entry) =>
                              entry.itemId === item.id
                                ? { ...entry, value: 'number', reading }
                                : entry,
                            ),
                          })
                        }
                      />
                      {readingError ? (
                        <Copy accessibilityLiveRegion="polite">{readingError}</Copy>
                      ) : readingHint ? (
                        <Copy muted>{readingHint}</Copy>
                      ) : null}
                    </>
                  ) : (
                    <View style={styles.answers}>
                      {(['pass', 'fail', 'na'] as const).map((value) => (
                        <AnswerChoice
                          selected={answer.value === value}
                          name={`${item.label}: ${locale === 'en' ? value : copy.choices[value]}`}
                          label={copy.choices[value]}
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
                  )}
                  <Field
                    label={`${copy.note}: ${item.label}`}
                    actionLabels={labels}
                    testID={`inspection-note-${item.id}`}
                    hideLabel
                    collapsedLabel={copy.optionalNote}
                    placeholder={copy.notePlaceholder}
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
                  {item.requiresPhoto && (
                    <>
                      <Copy muted variant="caption">
                        {hasPhoto ? copy.photoAttached : copy.photoRequired}
                        {!hasPhoto && draft.photos.length === MAX_REPORT_PHOTOS
                          ? copy.removeToMakeRoom
                          : ''}
                      </Copy>
                      {!hasPhoto && (
                        <PhotoActions
                          locale={locale}
                          disabled={busy || draft.photos.length >= MAX_REPORT_PHOTOS}
                          label={checklistItemLabel(item)}
                          attach={(camera) => void attach(camera, item.id)}
                        />
                      )}
                    </>
                  )}
                </View>
              );
            })}
          </Panel>
          <Field
            label={copy.summary}
            actionLabels={labels}
            testID="inspection-summary"
            placeholder={copy.summaryPlaceholder}
            multiline
            value={draft.summary}
            maxLength={4000}
            onChangeText={(summary) => void save({ ...draft, summary })}
          />
          <Panel variant="plain">
            <SectionHeading
              title={copy.photos}
              detail={copy.photoCount(draft.photos.length, MAX_REPORT_PHOTOS)}
            />
            {order.template.requiresPhoto && (
              <Copy muted variant="caption">
                {copy.photosRequired}
              </Copy>
            )}
            {draft.photos.map((photo, index) => (
              <View key={photo.id}>
                <Image
                  accessibilityLabel={`${copy.photo} ${index + 1}`}
                  source={{ uri: `data:${photo.mimeType};base64,${photo.data}` }}
                  style={styles.photo}
                />
                {photo.itemId && <Copy muted>{reportItemLabel(order.template, photo.itemId)}</Copy>}
                <Button
                  title={`${copy.removePhoto} ${index + 1}`}
                  icon={Trash}
                  iconOnly
                  variant="ghost"
                  disabled={busy}
                  onPress={() =>
                    void save({
                      ...currentDraft.current,
                      photos: currentDraft.current.photos.filter((entry) => entry.id !== photo.id),
                    })
                  }
                />
              </View>
            ))}
            {sitePhotoSlots === 0 && draft.photos.length < MAX_REPORT_PHOTOS && (
              <Copy muted variant="caption">
                {copy.reservedPhotos}
              </Copy>
            )}
            <PhotoActions
              locale={locale}
              disabled={busy || sitePhotoSlots === 0}
              attach={(camera) => void attach(camera)}
            />
            <Copy muted variant="caption">
              {copy.photoLimits}
            </Copy>
          </Panel>
          {error ? (
            <Notice error title={copy.needsAttention}>
              {error}
            </Notice>
          ) : null}
          <View style={styles.submitBar}>
            <Copy muted variant="caption">
              {copy.retention}
            </Copy>
            <Button
              title={
                busy ? (preparingPhoto ? copy.preparingPhoto : copy.savingReport) : copy.submit
              }
              disabled={
                busy || saving || !draft.summary.trim() || completed !== order.template.items.length
              }
              onPress={() => void submit()}
            />
          </View>
        </>
      ) : order.report ? (
        <SavedReport
          report={order.report}
          template={order.template}
          baseUrl={baseUrl}
          token={token}
          locale={locale}
        />
      ) : null}
    </>
  );
}
function PhotoActions({
  locale,
  disabled,
  label,
  attach,
}: {
  locale: Locale;
  disabled: boolean;
  label?: string;
  attach: (camera: boolean) => void;
}) {
  const copy = inspectionCopy[locale];
  return (
    <View style={styles.row}>
      <View style={styles.photoAction}>
        <Button
          title={copy.takePhoto}
          accessibilityLabel={label ? copy.takePhotoFor(label) : undefined}
          icon={Camera}
          variant="outline"
          disabled={disabled}
          onPress={() => attach(true)}
        />
      </View>
      <View style={styles.photoAction}>
        <Button
          title={copy.choosePhoto}
          accessibilityLabel={label ? copy.choosePhotoFor(label) : undefined}
          icon={ImageSquare}
          variant="outline"
          disabled={disabled}
          onPress={() => attach(false)}
        />
      </View>
    </View>
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
  loginHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
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
  headerIdentity: { flexGrow: 1, flexShrink: 1, minWidth: 0, gap: spacing.xs },
  inspectionTools: { flexDirection: 'row', justifyContent: 'space-between' },
  siteCoordinates: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  headerLarge: { flexDirection: 'column', alignItems: 'stretch' },
  header: {
    zIndex: 2,
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
  ledger: { padding: 0, gap: 0, overflow: 'hidden' },
  metadata: {
    borderWidth: 1,
    borderRadius: radius.panel,
    borderColor: colors.line,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    gap: spacing.lg,
  },
  questionHeading: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  question: { padding: spacing.lg, gap: spacing.md },
  questionDivider: { borderTopWidth: 1, borderColor: colors.line },
  answers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'stretch' },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
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
