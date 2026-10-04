# Lucid

Voice-first dream and journal app. Read `docs/product.md` before building features, UI or copy; if a request conflicts with it, raise it instead of guessing. Also see `AGENTS.md` for Expo-specific rules.

## Stack

- React Native with Expo (SDK 57), TypeScript
- ESLint (`eslint-config-expo`) and Prettier

## Commands

```bash
npm start           # dev server (scan QR with Expo Go)
npm run check       # typecheck + lint + format check; run before finishing any task
npm run format      # apply Prettier
```

## Layout

- `src/screens/` screens, `src/components/` shared UI, `src/hooks/`, `src/services/`, `src/utils/`, `src/types/`, `src/theme/`
- Navigation is not set up yet (Expo Router is planned; see `AGENTS.md`).
