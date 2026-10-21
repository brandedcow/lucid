# Lucid

A voice-first note app for mobile. React Native (Expo, TypeScript). Notes are markdown text (the first line is the title), can hold several voice notes, are organized only by `#tags` written in the body, and are stored on the device.

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
App.tsx              entry; wraps the app in AppFlowProvider and NotesNavigator (a dev-only editor spike harness is behind EXPO_PUBLIC_EDITOR_SPIKE)
src/
  app/               AppFlowProvider (launch rule, one-time import of older data, trash actions)
  navigation/        NotesNavigator, notesRoutes (Notes, Editor, Settings, Recently Deleted, Search)
  screens/           NoteListScreen, NoteEditorScreen, NoteEditorWithVoice, NoteSearchPanel, RecentlyDeletedScreen, SettingsScreen
  components/        NoteBodyInput, NoteToolbar, NotesDrawer, NoteRow, SwipeNoteRow, DeletedNoteRow, RecordingPanel, VoiceNoteCarousel, VoiceAttachmentCard, VoiceNoteSheet, TagSuggestionBar, OverflowMenu, and others
  hooks/             useNotes, useNoteSession, useNoteEditor, useVoiceRecorder, useRecordingPlayback, useRecordingTranscription, useAutoTranscribe, useSettings, useDayMarker, useToday, useLegacyMigration, and others
  services/          notesStorage (notes.json + audio files), legacyImport (one-time read-only import of dreams.json), settingsStorage, dayMarker, recordingFiles, transcription, shareRecording, clipboard
  utils/             noteTitle, notePreview, noteViews, noteSearch, noteTodo, tags, inlineTags, tagSuggestions, markdownLines, markdownEdit, relativeTime, noteLaunch, noteResume, and others
  types/             recording (StoredRecording)
  theme/             index.ts (colors, spacing, fonts)
  dev/               EditorSpikeScreen (dev-only harness)
  test/              Jest helpers: fakeFileSystem (in-memory expo-file-system), fakeKeyboard, fakeSpeechRecognition, fakeTranscription, hardwareBackChain, bodyText
docs/                product.md, status.md, ios-dev-build.md, spike-live-transcription.md
assets/              app icon, adaptive icon and splash images (moon mark; sources in assets/icon-source/)
```

Tests live next to the code as `*.test.ts` / `*.test.tsx`.
