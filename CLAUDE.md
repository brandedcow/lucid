# Lucid

Voice-first dream and journal app. Read `docs/product.md` before building features, UI or copy. If a request conflicts with it, raise it instead of guessing.

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

- `src/screens/` screens, `src/components/` shared UI, `src/hooks/`, `src/services/`, `src/utils/`, `src/types/`, `src/theme/`
- Navigation is not set up yet. `AGENTS.md` calls for Expo Router (`src/app/`); until that migration happens, do not add routes or another navigation library without asking.

## Working rules

- Run `npm run check` before calling any task done, and report failures instead of hiding them.
- Tests are Jest files next to the code (`*.test.ts` / `*.test.tsx`). Add or update tests with behavior changes. Native modules are mocked in tests; `src/test/fakeFileSystem.ts` is an in-memory `expo-file-system`.
- Add dependencies with `npx expo install <package>`, and prefer Expo modules over third-party libraries.
- Use the vocabulary in `docs/product.md` (Journal entry, Dream, Tag, No dream) in UI copy, code and data models.
- UI copy is plain language. No psychological or Jungian terms, no interpretation of entries, no streaks, scores or gamification.
- Do not build anything under "Not in scope yet" in `docs/product.md` (AI features, tasks, threads, roundups, explore view, desktop) unless asked.
- Device access and persistence live behind hooks and services (`useDreamRecorder`, `services/dreamStorage.ts`), not in screens. Dreams are stored locally: audio in `Paths.document/dreams/`, metadata in `dreams.json`. Transcription is not built yet.
- Keep changes small and on a feature branch. Never commit to `master`, and never push to a remote unless the user explicitly asks.
- Never create or edit `ios/` or `android/` by hand; configure native behavior in `app.json`.
