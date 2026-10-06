# Status and handoff

Where the project stands, so anyone (human or agent) can pick it up. `docs/product.md` says what the app is; this file says what exists, what doesn't, and what to watch out for. Update it when you change the state of the project.

_Last updated: 2026-10-05, branch `feat/dream-capture-scaffold`._

## What works today

The happy path for dreams, built and covered by tests, but **not yet verified on a physical device** (see Gaps):

1. **Capture** (`CaptureScreen`): idle view ("What happened in my dream?", tips, tap-to-talk button), then a listening view with timer, live waveform driven by real mic level, and Save dream (the pause button is hidden on the spike branch).
2. **Review** (`ReviewScreen`): shown after recording, before anything is saved. Title field (required, auto-focused), emotion (free text, optional), tags (optional, with suggestions from previously used tags), playback of the recording above the Save button, and "Delete and record again" (deletes the unsaved file, returns to capture).
3. **Save**: the recording moves into permanent local storage and the app shows the **dream list**.
4. **Dream list** (`DreamListScreen`): newest first, shows title, date, emotion and tags, with play/pause per row, and a "Record a dream" button back to capture.

## How it is built

| Area                  | Where                                                          |
| --------------------- | -------------------------------------------------------------- |
| Screen switching      | `App.tsx` (a `useState` switch: `capture` / `review` / `list`) |
| Screens               | `src/screens/` (`capture/IdleView`, `capture/ListeningView`)   |
| Recording             | `src/hooks/useDreamRecorder.ts` (wraps `expo-audio`)           |
| Playback (list)       | `src/hooks/useDreamPlayback.ts` (one shared player)            |
| Playback (review)     | `src/components/RecordingPlayer.tsx`                           |
| Storage               | `src/services/dreamStorage.ts` (wraps `expo-file-system`)      |
| Data types            | `src/types/dream.ts`                                           |
| Tag helpers           | `src/utils/tags.ts` (lowercase, trim, strip `#`, de-duplicate) |
| Theme (colors, fonts) | `src/theme/index.ts`                                           |
| Test helpers          | `src/test/fakeFileSystem.ts` (in-memory `expo-file-system`)    |

**Data model** (`Dream`): `id`, `createdAt` (ISO), `durationMs`, `audioFileName`, `title`, optional `emotion`, `tags[]`.

**Storage layout**: audio at `Paths.document/dreams/<id>.m4a`, metadata in `Paths.document/dreams.json`. Only the audio **file name** is stored, never a full path, because the document directory path can change between app updates on iOS. Dreams saved before titles/tags existed load with `title: ''` and `tags: []`; the list falls back to showing the date.

**Recording flow detail**: the recorder writes to the cache directory. Nothing is saved until the user taps Save on the review screen. `saveDream` validates the title _before_ moving the file, so a rejected save leaves the recording in place.

## Decisions made during development

- **Stack**: Expo (SDK 57) + TypeScript, ESLint + Prettier, Jest. Local-only storage for now; no backend.
- **Voice leads**, with "Write instead" as a secondary option (matches the mockups). This resolved one open decision in `docs/product.md`.
- **Audio is kept** alongside (future) transcripts.
- **"No dream"** is the label for dismissing capture (not "Skip").
- **Title is required** on dreams; emotion and tags are optional. This is why the product doc's principle is "open structure that guides" rather than "no required fields".
- **Emotion is free text**, never a picklist or rating.
- **No transcription yet.** The earlier mock transcript was removed so fake text never appears over a real recording.

## Gaps and known issues

**Unverified**

- Recording, playback, the review screen's keyboard behavior and the safe-area layout have only been checked by typecheck, lint and Jest. Test on a real phone with Expo Go first (`npm start`). If `expo-audio` does not work in Expo Go, a development build is needed (`npx expo run:ios|android` or `eas build --profile development`).
- Android keyboard behavior on the review screen is untested (iOS uses a keyboard-avoiding view, Android relies on window resizing).

**Not built**

- **"No dream" and "Write instead" buttons do nothing.** Wiring "No dream" to leave the capture screen was tried and deliberately reverted. If you implement it, remember the product rule: it counts as done for the day.
- No way to delete or edit a saved dream, and no filtering or browsing by tag.
- No saved transcription. A spike on `spike/live-transcription` shows live on-device text on the capture screen only (see `docs/spike-live-transcription.md`); unverified on a device; it needs a development build (in Expo Go the whole bundle fails to load, not just live text). Supports iOS 17+ and Android 13+ only; the pause button is hidden on the capture screen.
- No "on waking" logic or "done for today" memory: the app always opens to capture.
- No journal (entries or screen). The structure is undecided; ask before designing it.
- Playback has no scrubbing.
- No real navigation. `AGENTS.md` (from the Expo template) says to use Expo Router with routes in `src/app/`, but the app currently uses the `App.tsx` state switch. Do not add routes or another navigation library without asking; migrating to Expo Router is the likely direction.

**Known risks**

- If the app is closed on the review screen, the unsaved recording is lost (it lives in the cache directory). Saving a draft first would fix this.
- `.gitattributes` forces LF line endings; Prettier is configured to match.

## Repo and workflow state

- Git: work is on `feat/dream-capture-scaffold`. `master` holds only the template's initial commit. `origin` is set to `git@github.com:brandedcow/lucid.git`, but **nothing has been pushed**; do not push unless the user asks.
- Identifiers: bundle ID / Android package `com.chrisvkang.lucid`. License is proprietary (all rights reserved), copyright Christopher Kang.
- Placeholder Expo icons and splash images are still in `assets/`.
- Not set up yet: CI, EAS config (`eas.json`), an app icon, and any secrets/`.env` handling.
- A project hook (`.claude/hooks/format.js`) runs Prettier on files after Claude edits them, and `.claude/settings.json` denies `git push` and reading `.env*` files.

## Gotchas

- Run `npm run check` (typecheck, lint, format check, tests) before calling anything done.
- In tests, native modules must be mocked. `expo-audio` is mocked per test file; `expo-file-system` uses `src/test/fakeFileSystem.ts` via `jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'))`. With React Native Testing Library v14, `render` and `fireEvent` are async: `await` them.
- Use `SafeAreaView` from `react-native-safe-area-context`, not from `react-native` (deprecated). The app is wrapped in `SafeAreaProvider` in `App.tsx`.
- Install packages with `npx expo install`, and check Expo's versioned docs before touching Expo APIs (see `AGENTS.md`); Expo APIs change between SDKs.
- On Windows, the PowerShell tool sometimes reports exit code 255 for commands that actually succeeded (seen with some git and npm commands). Read the output to confirm.

## Suggested next steps

1. Verify the flow on a physical device and fix whatever it turns up.
2. Decide and build "No dream" (including the "done for today" memory) and "Write instead".
3. Decide the journal structure and navigation (Expo Router), then replace the `App.tsx` switch.
4. Add delete/edit for saved dreams and tag browsing.
5. Transcription, once the recording flow is solid.
