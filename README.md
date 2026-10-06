# Lucid

A voice-first dream journal for mobile. React Native (Expo, TypeScript). Dreams are recorded by voice, reviewed (title, emotion, tags), and stored on the device.

Start here:

- `docs/product.md`: what the app is, its principles, vocabulary, and open decisions
- `docs/status.md`: what is built, what isn't, known gaps, and next steps
- `CLAUDE.md` and `AGENTS.md`: working rules for AI agents (useful for humans too)

## Run

```bash
npm install
npm start          # scan the QR code with Expo Go on your phone
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
App.tsx              entry; switches between capture, review and list screens
src/
  screens/           CaptureScreen (+ capture/IdleView, ListeningView), ReviewScreen, DreamListScreen
  components/        MicIcon, Waveform, RecordingPlayer, TagInput
  hooks/             useDreamRecorder (audio recording), useDreamPlayback (list playback)
  services/          dreamStorage (local audio files + dreams.json)
  utils/             format, tags
  types/             dream (Dream, DreamDetails), entry (EntryType)
  theme/             colors, spacing, fonts
  test/              fakeFileSystem (in-memory expo-file-system for Jest)
docs/                product.md, status.md
assets/              icons and splash images (still Expo placeholders)
```

Tests live next to the code as `*.test.ts` / `*.test.tsx`.
