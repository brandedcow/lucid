import 'react-native-gesture-handler/jestSetup';

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
}));

// expo-speech-recognition is native: every test gets the controllable fake, with all capabilities
// off until a test calls fakeSpeech.enable().
// React Native's iOS Settings reads this native module when first used (the iOS system locale);
// there is none under Jest. Tests spy on Settings.get for the values they need.
jest.mock('react-native/Libraries/Settings/NativeSettingsManager', () => ({
  __esModule: true,
  default: { getConstants: () => ({ settings: {} }), setValues: () => {}, deleteValues: () => {} },
}));

jest.mock('expo-speech-recognition', () => jest.requireActual('./src/test/fakeSpeechRecognition'));
