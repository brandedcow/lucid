# Lucid

Voice-first dream and journal app. Read `docs/product.md` before building features, UI or copy. If a request conflicts with it, raise it instead of guessing. Read `docs/status.md` to see what is built, what is stubbed, known gaps and gotchas, and keep it current when you change the state of the project.

@AGENTS.md

## Stack

- React Native with Expo (SDK 57), TypeScript
- ESLint (`eslint-config-expo`) and Prettier

## Commands

```bash
npm start           # dev server (scan QR with Expo Go)
npm run check       # typecheck + lint + format check + tests
npm test            # Jest only (jest-expo preset, Testing Library)
npm run test:watch  # Jest in watch mode
npm run format      # apply Prettier
```

## Layout

- `src/screens/` screens, `src/components/` shared UI, `src/hooks/`, `src/services/`, `src/utils/`, `src/types/`, `src/theme/`, `src/test/` (test helpers). See the file map in `docs/status.md`.
- Navigation is not set up yet; `App.tsx` switches screens with `useState`. `AGENTS.md` calls for Expo Router (`src/app/`); until that migration happens, do not add routes or another navigation library without asking.

## Working rules

- Run `npm run check` before calling any task done, and report failures instead of hiding them.
- Tests are Jest files next to the code (`*.test.ts` / `*.test.tsx`). Add or update tests with behavior changes. Native modules are mocked in tests; `src/test/fakeFileSystem.ts` is an in-memory `expo-file-system`.
- Add dependencies with `npx expo install <package>`, and prefer Expo modules over third-party libraries.
- Use the vocabulary in `docs/product.md` (Journal entry, Dream, Title, Emotion, Tag, No dream) in UI copy, code and data models.
- Use `SafeAreaView` from `react-native-safe-area-context`, not `react-native`.
- UI copy is plain language. No psychological or Jungian terms, no interpretation of entries, no streaks, scores or gamification.
- Do not build anything under "Not in scope yet" in `docs/product.md` (AI features, tasks, threads, roundups, explore view, desktop) unless asked.
- Device access and persistence live behind hooks and services (`useDreamRecorder`, `services/dreamStorage.ts`), not in screens. Dreams are stored locally: audio in `Paths.document/dreams/`, metadata in `dreams.json`, and only file names are persisted (never full paths). Transcription is not built yet.
- Keep changes small and on a feature branch. Never commit to `master`, and never push to a remote unless the user explicitly asks.
- Never create or edit `ios/` or `android/` by hand; configure native behavior in `app.json`.
