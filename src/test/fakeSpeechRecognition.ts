import { useEffect } from 'react';

// A controllable stand-in for expo-speech-recognition, for Jest. jest.setup.ts installs it as the
// default module mock, with every capability OFF (so existing screens see "cannot transcribe").
// A test turns it on and drives it:
//
//   fakeSpeech.reset();            // in beforeEach
//   fakeSpeech.enable();           // available, on-device, en-US installed, permission granted
//   fakeSpeech.emit('result', { isFinal: true, results: [{ transcript: 'hello' }] });
//
// `emit` calls the listeners registered through useSpeechRecognitionEvent; wrap it in act().
// It records what the app asked for: `starts` (every start options object), `aborts`, and the
// permission requests. It never touches the network and has no idea what "on-device" means beyond
// recording the flag the app passed.

type Listener = (event: unknown) => void;

type Permission = { granted: boolean; status?: string; canAskAgain?: boolean };

const initial = () => ({
  available: false,
  onDevice: false,
  locales: [] as string[],
  installedLocales: [] as string[],
  permission: { granted: true } as Permission,
  throwOn: new Set<string>(),
  startThrows: false,
  starts: [] as Record<string, unknown>[],
  /** Whether supportsOnDeviceRecognition() was true at the moment of each start call. */
  onDeviceAtStart: [] as boolean[],
  aborts: 0,
  permissionRequests: [] as string[],
  getSupportedLocalesCalls: 0,
});

const listeners = new Map<string, Set<Listener>>();
let s = initial();
let pendingPermission: Promise<void> | null = null;
let pendingLocales: Promise<void> | null = null;

export const fakeSpeech = {
  get starts() {
    return s.starts;
  },
  get onDeviceAtStart() {
    return s.onDeviceAtStart;
  },
  get aborts() {
    return s.aborts;
  },
  get permissionRequests() {
    return s.permissionRequests;
  },
  get getSupportedLocalesCalls() {
    return s.getSupportedLocalesCalls;
  },
  reset() {
    s = initial();
    pendingPermission = null;
    pendingLocales = null;
    listeners.clear();
  },
  /** Everything on: available, on-device capable, the given locales installed and listed. */
  enable(locales: string[] = ['en-US']) {
    s.available = true;
    s.onDevice = true;
    s.locales = [...locales];
    s.installedLocales = [...locales];
  },
  set(patch: {
    available?: boolean;
    onDevice?: boolean;
    locales?: string[];
    installedLocales?: string[];
    permission?: Permission;
    startThrows?: boolean;
  }) {
    Object.assign(s, patch);
  },
  /** Makes the named module method throw (e.g. 'isRecognitionAvailable', 'getSupportedLocales'). */
  throwOn(method: string) {
    s.throwOn.add(method);
  },
  /** The next permission request waits until the returned function is called. */
  holdPermissionRequest() {
    let release = () => {};
    pendingPermission = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  },
  /** The next getSupportedLocales call waits until the returned function is called. */
  holdLocales() {
    let release = () => {};
    pendingLocales = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  },
  emit(name: string, payload: unknown = {}) {
    for (const l of [...(listeners.get(name) ?? [])]) l(payload);
  },
  result(text: string, isFinal: boolean) {
    fakeSpeech.emit('result', {
      isFinal,
      results: [{ transcript: text, confidence: 1, segments: [] }],
    });
  },
  error(error: string, message = '') {
    fakeSpeech.emit('error', { error, message });
  },
  end() {
    fakeSpeech.emit('end', {});
  },
  listenerCount(name: string) {
    return listeners.get(name)?.size ?? 0;
  },
};

const guard = (method: string) => {
  if (s.throwOn.has(method)) throw new Error(`${method} failed`);
};

const askPermission = async (kind: string): Promise<Permission> => {
  s.permissionRequests.push(kind);
  if (pendingPermission) await pendingPermission;
  return s.permission;
};

export const ExpoSpeechRecognitionModule = {
  isRecognitionAvailable() {
    guard('isRecognitionAvailable');
    return s.available;
  },
  supportsOnDeviceRecognition() {
    guard('supportsOnDeviceRecognition');
    return s.onDevice;
  },
  async getSupportedLocales(_options: unknown) {
    s.getSupportedLocalesCalls += 1;
    guard('getSupportedLocales');
    if (pendingLocales) await pendingLocales;
    return { locales: [...s.locales], installedLocales: [...s.installedLocales] };
  },
  requestPermissionsAsync: () => askPermission('requestPermissionsAsync'),
  requestSpeechRecognizerPermissionsAsync: () =>
    askPermission('requestSpeechRecognizerPermissionsAsync'),
  start(options: Record<string, unknown>) {
    s.starts.push(options);
    s.onDeviceAtStart.push(s.onDevice);
    if (s.startThrows) throw new Error('start failed');
  },
  abort() {
    s.aborts += 1;
  },
};

export function useSpeechRecognitionEvent(name: string, listener: Listener) {
  // Like the real hook: bound after render, rebound when the listener changes.
  useEffect(() => {
    let set = listeners.get(name);
    if (!set) listeners.set(name, (set = new Set()));
    const bound = set;
    bound.add(listener);
    return () => {
      bound.delete(listener);
    };
  }, [name, listener]);
}

// The library's constant, with the one value the app uses.
export const AudioEncodingAndroid = { ENCODING_PCM_16BIT: 2, ENCODING_MP3: 3, ENCODING_OPUS: 20 };
