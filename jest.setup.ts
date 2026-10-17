import 'react-native-gesture-handler/jestSetup';

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
}));

// expo-speech-recognition is native: every test gets the controllable fake, with all capabilities
// off until a test calls fakeSpeech.enable().
jest.mock('expo-speech-recognition', () => jest.requireActual('./src/test/fakeSpeechRecognition'));
