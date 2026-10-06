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

- `src/screens/` screens, `src/components/` shared UI, `src/hooks/`, `src/services/`, `src/utils/`, `src/types/`, `src/theme/`, `src/test/` (test helpers). Also `src/components/EmotionChips.tsx`, `src/hooks/useLiveTranscription.ts`, `src/utils/{emotions,capitalizeFirst,fadeTail,sessionNavigation}.ts`. See the file map in `docs/status.md`.
- Navigation is a state switch in `App.tsx` (`capture | readItBack | review | list`) with the in-progress dream in `src/hooks/useDreamSession.ts` and back rules in `src/utils/sessionNavigation.ts`. `AGENTS.md` calls for Expo Router (`src/app/`); it is not adopted, so do not add routes or another navigation library without asking.

## Working rules

- Run `npm run check` before calling any task done, and report failures instead of hiding them.
- Tests are Jest files next to the code (`*.test.ts` / `*.test.tsx`). Add or update tests with behavior changes. Native modules are mocked in tests; `src/test/fakeFileSystem.ts` is a faithful in-memory `expo-file-system` (async copy/move, no overwrite, failure injection); storage changes need careful tests with it.
- Add dependencies with `npx expo install <package>`, and prefer Expo modules over third-party libraries.
- Use the vocabulary in `docs/product.md` (Journal entry, Dream, Title, Emotion, Tag, No dream) in UI copy, code and data models.
- Use `SafeAreaView` from `react-native-safe-area-context`, not `react-native`.
- UI copy is plain language. No psychological or Jungian terms, no interpretation of entries, no streaks, scores or gamification.
- Do not build anything under "Not in scope yet" in `docs/product.md` (AI features, tasks, threads, roundups, explore view, desktop) unless asked.
- Device access and persistence live behind hooks and services (`useDreamRecorder`, `useLiveTranscription`, `services/dreamStorage.ts`), not in screens. Dreams are stored locally; transcription is on-device only (no audio or text leaves the phone). Storage: `dreams.json` index (plus a best-effort `dreams.json.bak`), audio in `Paths.document/dreams/`; a `Dream` has optional `transcript`, `status: 'draft'` and `audioFileName` (none for written dreams). Only file names are persisted (never full paths). Saving copies the audio, writes the index, then deletes the cache file.
- Never delete anything under `dreams/`. Always resolve audio through `dream.audioFileName` / `dreamAudioUri`, never by building `<id>.m4a`. When updating a dream always pass full `details` (emotion and transcript strings): `undefined` keeps the stored value, `''` clears it.
- Keep changes small and on a feature branch. Never commit to `master`, and never push to a remote unless the user explicitly asks.
- Never create or edit `ios/` or `android/` by hand; configure native behavior in `app.json`.
