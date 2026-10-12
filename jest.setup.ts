import 'react-native-gesture-handler/jestSetup';

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
}));
