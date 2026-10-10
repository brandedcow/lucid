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

- `src/screens/` screens, `src/components/` shared UI, `src/hooks/`, `src/services/`, `src/utils/`, `src/types/`, `src/theme/`, `src/test/` (test helpers). Also `src/components/{EmotionInput,DreamChips,OverflowMenu}.tsx`, `src/hooks/{useLiveTranscription,useDreamLibrary,useLogView}.ts`, `src/utils/{emotions,capitalizeFirst,fadeTail,sessionNavigation,dreamLog,paragraphs,confirmDelete}.ts`, and `jest.setup.ts` at the root. See the file map in `docs/status.md`.
- Navigation is a state switch in `App.tsx` (`capture | readItBack | review | log | detail`) with the in-progress dream (including editing a finished dream, origin `edit`) in `src/hooks/useDreamSession.ts`, the stored dreams in `useDreamLibrary`, the Dream log's filter, search and scroll in `useLogView` (both kept in `App.tsx`), and back rules in `src/utils/sessionNavigation.ts`. `AGENTS.md` calls for Expo Router (`src/app/`); it is not adopted, so do not add routes or another navigation library without asking.

## Working rules

- Run `npm run check` before calling any task done, and report failures instead of hiding them.
- Tests are Jest files next to the code (`*.test.ts` / `*.test.tsx`). Add or update tests with behavior changes. Native modules are mocked in tests; `src/test/fakeFileSystem.ts` is a faithful in-memory `expo-file-system` (async copy/move, no overwrite, failure injection); storage changes need careful tests with it.
- Add dependencies with `npx expo install <package>`, and prefer Expo modules over third-party libraries.
- Use the vocabulary in `docs/product.md` (Journal entry, Dream, Title, Emotion, Tag, No dream, Draft, Transcript, Dream log, Dream entry) in UI copy, code and data models.
- Use `SafeAreaView` from `react-native-safe-area-context`, not `react-native`.
- UI copy is plain language. No psychological or Jungian terms, no interpretation of entries, no streaks, scores or gamification.
- Do not build anything under "Not in scope yet" in `docs/product.md` (AI features, tasks, threads, roundups, explore view, desktop) unless asked.
- Device access and persistence live behind hooks and services (`useDreamRecorder`, `useLiveTranscription`, `services/dreamStorage.ts`), not in screens. Dreams are stored locally; transcription is on-device only (no audio or text leaves the phone). Storage layout and save order are in the storage section of `docs/status.md`. Safety rules:
  - The app deletes files only in these cases: (1) `saveDream`'s own rollback of the copy that same save just made; (2) `deleteDream`, for the one dream the user chose to delete: that dream's audio file inside `dreams/` (only if the stored file name is a plain name, resolves inside `dreams/`, and no other dream references it), `dreams.json.bak`'s copy of it, and any `dreams.corrupt-<digits>.json` safety copy that holds only dreams already in the live index (a copy that holds anything unaccounted for blocks the delete; copies are never rewritten); (3) the cache file of a recording that was never saved. Nothing else. `deleteDream` writes the index last, so a dream is never unlisted while its audio or safety copies remain.
  - Resolve audio through `dream.audioFileName` / `dreamAudioUri`, never by building `<id>.m4a`.
  - When updating a dream always pass full `details` (emotion and transcript strings): `undefined` keeps the stored value, `''` clears it.
  - A zero-length `dreams.json` counts as missing, so `deleteDream` writes `[]` when the last dream goes, never an empty file.
- Back (arrow and Android hardware back) is blocked while a save is in flight (an edit's save too), and Review's fields and buttons are locked then. It is also blocked while a delete started from the Dream entry is in flight (Edit is ignored too); a delete started from the Dream log does not block back or navigate.
- On the Dream entry, Edit and Delete live in the top-right "..." menu (`OverflowMenu`, an in-screen overlay, not a `Modal`). On Android, hardware back closes the open menu first, before the screen's back.
- `App.tsx` is wrapped in `GestureHandlerRootView` (the Dream log's swipe-to-delete uses `react-native-gesture-handler`'s `Swipeable`). Jest needs `jest.setup.ts` (listed in `package.json` `jest.setupFiles`), which imports `react-native-gesture-handler/jestSetup`.
- Editing a finished dream never calls `save('draft')` and never discards its persisted audio.
- Keep changes small and on a feature branch. Never commit to `master`, and never push to a remote unless the user explicitly asks.
- Never create or edit `ios/` or `android/` by hand; configure native behavior in `app.json`.
