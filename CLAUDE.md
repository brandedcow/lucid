# Lucid

Voice-first dream and journal app. Read `docs/product.md` before building features, UI or copy. If a request conflicts with it, raise it instead of guessing. Read `docs/status.md` to see what is built, what is stubbed, known gaps and gotchas, and keep it current when you change the state of the project.

@AGENTS.md

## Stack

- React Native with Expo (SDK 57), TypeScript. A development build is required (`expo-speech-recognition` has native code); see `docs/ios-dev-build.md`.
- ESLint (`eslint-config-expo`) and Prettier

## Commands

```bash
npm start           # Metro dev server; open the installed development build (Expo Go cannot load this app)
npm run check       # typecheck + lint + format check + tests
npm test            # Jest only (jest-expo preset, Testing Library)
npm run test:watch  # Jest in watch mode
npm run format      # apply Prettier
```

## Layout

- `src/screens/` screens, `src/components/` shared UI, `src/hooks/`, `src/services/`, `src/utils/`, `src/types/`, `src/theme/`, `src/test/` (test helpers). Also `src/components/{EmotionInput,DreamChips,OverflowMenu,EntryRow,SwipeEntryRow,SwipeActionRow,NewJournalSheet,SearchIcon,TodayIcons,TodayEntryRow,AddEntryMenu,OutlinedChips,MicIcon,RecordingPlayer,TagInput,Waveform}.tsx`, `src/screens/{JournalsScreen,SearchScreen,TodayScreen,SettingsScreen}.tsx` (plus `src/screens/capture/{IdleView,ListeningView}.tsx`, parts of `CaptureScreen`), `src/hooks/{useLiveTranscription,useDreamLibrary,useJournals,useLogView,useToday,useDayMarker,useSettings,useDreamRecorder}.ts`, `src/services/{dayMarker,settingsStorage,journalStorage}.ts` (beside `dreamStorage.ts`), `src/utils/{emotions,capitalizeFirst,fadeTail,sessionNavigation,dreamLog,paragraphs,confirmDelete,journals,journalName,journalSearch,today,format,tags}.ts`, `src/types/entry.ts`, and `jest.setup.ts` at the root. See the file map in `docs/status.md`.
- Navigation is a state switch in `App.tsx` (`capture | readItBack | review | log | detail | journals | search | today | settings`; the screen is `null` until the launch rule decides between Today and Dream capture) with the in-progress dream (including editing a finished dream, origin `edit`) in `src/hooks/useDreamSession.ts`, the stored dreams in `useDreamLibrary`, the log's filter, search and scroll in `useLogView` (one for the logs, one for Search; both kept in `App.tsx`), and back rules in `src/utils/sessionNavigation.ts`. `AGENTS.md` calls for Expo Router (`src/app/`); it is not adopted, so do not add routes or another navigation library without asking.

## Working rules

- Run `npm run check` before calling any task done, and report failures instead of hiding them.
- Tests are Jest files next to the code (`*.test.ts` / `*.test.tsx`). Add or update tests with behavior changes. Native modules are mocked in tests; `src/test/fakeFileSystem.ts` is a faithful in-memory `expo-file-system` (async copy/move, no overwrite, failure injection); storage changes need careful tests with it.
- Add dependencies with `npx expo install <package>`, and prefer Expo modules over third-party libraries.
- Use the vocabulary in `docs/product.md` (Journal, Entry, Life entry, Dream, Title, Emotion, Tag, No dream, Today, Draft, Transcript, Dream log, Life log, Journals home, Search, Dream entry; say "entry" for the generic noun and "Life entry", not "Journal entry", for Life writing) in UI copy, code and data models.
- Use `SafeAreaView` from `react-native-safe-area-context`, not `react-native`.
- UI copy is plain language. No psychological or Jungian terms, no interpretation of entries, no streaks, scores or gamification.
- Do not build anything under "Not in scope yet" in `docs/product.md` (AI features, tasks, threads, roundups, explore view, desktop) unless asked.
- Device access and persistence live behind hooks and services (`useDreamRecorder`, `useLiveTranscription`, `services/dreamStorage.ts`), not in screens. Dreams are stored locally; transcription is on-device only (no audio or text leaves the phone). Storage layout and save order are in the storage section of `docs/status.md`. Safety rules:
  - The app deletes files only in these cases: (1) `saveDream`'s own rollback of the copy that same save just made; (2) `deleteDream`, for the one dream the user chose to delete: that dream's audio file inside `dreams/` (only if the stored file name is a plain name, resolves inside `dreams/`, and no other dream references it), `dreams.json.bak`'s copy of it, and any `dreams.corrupt-<digits>.json` safety copy that holds only dreams already in the live index (a copy that holds anything unaccounted for blocks the delete; copies are never rewritten); (3) the cache file of a recording that was never saved (including when the user discards a recording to leave capture); (4) deleting a custom journal, which is only a loop of case (2); (5) `saveDream` with `removeAudio`, for the one entry the user chose to remove the recording from (the entry itself is kept): that entry's audio file inside `dreams/` (only if the stored file name is a plain name, resolves inside `dreams/`, and no other entry references it), deleted only after the index has been written without it, then `dreams.json.bak` is rewritten from the new index so it no longer names the file. Safety copies (`dreams.corrupt-<digits>.json`) are never touched by this case. Nothing else. `deleteDream` writes the index last, so a dream is never unlisted while its audio or safety copies remain.
  - Deleting a custom journal is allowed (custom only: Dreams and Life are never deletable, guarded by `isBuiltInJournal`), and only after a modal confirm that shows the entry count. It removes all of the journal's entries, drafts included, with their audio, through the existing per-entry `deleteDream` path (`useDreamLibrary.removeMany`: sequential, stops at the first failure). The registry definition is removed last, after re-reading storage. Irreversible. `journals.json` is never deleted (replaced atomically; a damaged copy is kept as `journals.corrupt-<n>.json`).
  - Journals are runtime data: the registry comes from `useJournals` / `services/journalStorage.ts` (`journals.json`, beside the dream index; atomic write via a temp file, temp-file recovery, safety copy of damaged content) and is passed explicitly to screens and utils, not read from a global. `BUILT_IN_JOURNALS` are the only constants. Names (`utils/journalName.ts`) are 1-24 characters and unique case-insensitively, including Dreams and Life. `journalCopy` is keyed by the journal object (built-ins use their kind's copy, custom journals use their name), not by id or kind.
  - Downgrade: a build from before journals ignores `journalId` and shows custom-journal and Life entries as dreams; a build that knows only Dreams and Life hides custom-journal entries. Data is kept either way (see `docs/status.md`).
  - `no-dream.json` (the No dream date) and `settings.json` live beside, not inside, `dreams/` and the dream index, and are never deleted (only overwritten). They fail open: a missing or unreadable file means not done / defaults, and a failed write never reaches the UI.
  - Read a record's journal only via `journalOf` (legacy records have no `journalId`); never read `record.journalId` directly.
  - Resolve audio through `dream.audioFileName` / `dreamAudioUri`, never by building `<id>.m4a`.
  - When updating a dream always pass full `details` (emotion and transcript strings): `undefined` keeps the stored value, `''` clears it.
  - A zero-length `dreams.json` counts as missing, so `deleteDream` writes `[]` when the last dream goes, never an empty file.
- `backTarget` in `src/utils/sessionNavigation.ts` is the single source of back behaviour (on-screen arrows and Android hardware back alike); `performBack` in `App.tsx` carries it out. Leaving the launch Dreams capture while idle counts as No dream (marker written, goes to Today). Android back on the launch capture therefore goes to Today; only Today exits the app. While recording, any capture asks to discard first (`confirmLeave`); discarding deletes only the unsaved cache file, never anything in `dreams/`. Read it back and Review keep their own back rules (`readItBackBack`, `reviewBack`) and do not count as No dream.
- Back is blocked while a save is in flight (an edit's save too), and Review's fields and buttons are locked then. It is also blocked while a delete started from the Dream entry is in flight (Edit is ignored too). While a journal delete is in flight (`deletingJournalId` in `App.tsx`), its entries and the journal itself are hidden and any screen showing it returns to Journals home; the Rename sheet (`renamingJournalId`) belongs to Journals home and closes when leaving it or when its journal is gone or being deleted; a delete started from the Dream log does not block back or navigate.
- On the Dream entry, Edit and Delete live in the top-right "..." menu (`OverflowMenu`, an in-screen overlay, not a `Modal`). On Android, hardware back closes the open menu first, before the screen's back.
- `App.tsx` is wrapped in `GestureHandlerRootView` (swipe-to-delete uses `react-native-gesture-handler`'s `Swipeable`, wrapped in the shared `SwipeEntryRow` used by the logs and Today, and `SwipeActionRow` for the Journals home rows). Jest needs `jest.setup.ts` (listed in `package.json` `jest.setupFiles`), which imports `react-native-gesture-handler/jestSetup`.
- Editing a finished dream never calls `save('draft')` and never discards its persisted audio, except through `removeAudio` after the user removed the recording and tapped Done.
- Keep changes small. The default branch is `main`. All work happens on a feature branch; never commit directly to `main`. Feature branches may be pushed to `origin`; changes reach `main` only through a pull request from a feature branch, which the user reviews and merges. Never push to `main`, never merge a PR yourself, never force-push, and never delete remote branches.
- Never create or edit `ios/` or `android/` by hand; configure native behavior in `app.json`.
