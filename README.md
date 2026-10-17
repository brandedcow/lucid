# Lucid

A voice-first dream journal for mobile. React Native (Expo, TypeScript). Dreams can be recorded by voice (several recordings per entry), written up with a title, text and inline #tags, and stored on the device.

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
App.tsx              entry; switches between Today, the journals, the Dream log, Add entry, Search and Settings screens
src/
  screens/           TodayScreen, AddEntryScreen, AddEntryWithVoice, DreamLogScreen, JournalsScreen, SearchScreen, SettingsScreen
  components/        RecordingPanel, VoiceNoteCarousel, VoiceAttachmentCard, VoiceNoteSheet, JournalPicker, TaggedBodyInput, TagSuggestionBar, EntryToolbar, EmotionInput, DreamChips, EntryRow, and others
  hooks/             useDreamRecorder, useEntrySession, useEntryHistory, useRecordingPlayback, useKeyboardInset, useDreamLibrary, useJournals, useToday, useLogView, useSettings
  services/          dreamStorage (local audio files + dreams.json), journalStorage, settingsStorage, dayMarker
  utils/             format, tags, inlineTags, tagSuggestions, emotions, capitalizeFirst, dreamLog, paragraphs, sessionNavigation, journals, today, waveform
  types/             dream (Dream, DreamDetails), entry (EntryType)
  theme/             colors, spacing, fonts
  test/              fakeFileSystem (in-memory expo-file-system for Jest), fakeKeyboard (mocked Keyboard events)
docs/                product.md, status.md, ios-dev-build.md, spike-live-transcription.md
assets/              app icon, adaptive icon and splash images (moon mark; sources in assets/icon-source/)
```

Tests live next to the code as `*.test.ts` / `*.test.tsx`.
