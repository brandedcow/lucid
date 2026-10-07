# Lucid

A voice-first dream journal for mobile. React Native (Expo, TypeScript). Dreams are recorded by voice, reviewed (title, emotion, tags), and stored on the device.

Start here:

- `docs/product.md`: what the app is, its principles, vocabulary, and open decisions
- `docs/status.md`: what is built, what isn't, known gaps, and next steps
- `CLAUDE.md` and `AGENTS.md`: working rules for AI agents (useful for humans too)

## Run

```bash
npm install
npm start          # start Metro, then open the installed development build (Expo Go cannot load this app; see docs/ios-dev-build.md)
```

Recording needs a real device microphone, so test on a phone rather than a simulator.

## Scripts

```bash
npm run check        # typecheck + lint + format check + tests (run before finishing work)
npm test             # Jest
npm run test:watch   # Jest in watch mode
npm run lint         # ESLint (expo lint)
npm run typecheck    # tsc --noEmit
npm run format       # apply Prettier
```

## Structure

```
App.tsx              entry; switches between the capture, read-it-back, review, Dream log and Dream entry screens
src/
  screens/           CaptureScreen (+ capture/IdleView, ListeningView), ReadItBackScreen, ReviewScreen, DreamLogScreen, DreamDetailScreen
  components/        MicIcon, Waveform, RecordingPlayer, TagInput, EmotionChips, DreamChips
  hooks/             useDreamRecorder, useLiveTranscription, useDreamSession, useDreamLibrary, useLogView
  services/          dreamStorage (local audio files + dreams.json)
  utils/             format, tags, emotions, dreamLog, paragraphs, sessionNavigation
  types/             dream (Dream, DreamDetails), entry (EntryType)
  theme/             colors, spacing, fonts
  test/              fakeFileSystem (in-memory expo-file-system for Jest)
docs/                product.md, status.md
assets/              app icon, adaptive icon and splash images (moon mark; sources in assets/icon-source/)
```

Tests live next to the code as `*.test.ts` / `*.test.tsx`.
