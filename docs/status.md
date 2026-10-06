# Status and handoff

Where the project stands, so anyone (human or agent) can pick it up. `docs/product.md` says what the app is; this file says what exists, what doesn't, and what to watch out for. Update it when you change the state of the project.

_Last updated: 2026-10-06, branch `spike/live-transcription`._

## What works today

The dream flow is built and covered by tests, but **mostly not yet verified on a physical device** (see Gaps):

1. **Capture** (`CaptureScreen`): idle view ("What happened in my dream?", tips, tap-to-talk button, "Write instead", "No dream"). Recording uses `expo-audio` while `expo-speech-recognition` shows **live on-device text** (a few of the newest words, older ones fading). A quiet status row shows "Listening" or "Paused" with the timer, above a live waveform driven by the mic level. Pause/resume: the recorder pauses or resumes first, recognition stops while paused and a new session starts on resume; if the OS restarts the recorder while the UI says paused, a debounced check pauses it again (up to 3 times, then the screen follows the recorder). Save dream stops both and moves on.
2. **Read it back** (`ReadItBackScreen`): the transcript in an editable text box, the original recording playable below it (hidden while the keyboard is up), Continue (enabled with non-blank text or a recording). The back arrow goes to a "Discard this dream?" confirmation for a new dream with something at stake; back from a reopened draft returns to the list; back after Edit on Review returns to Review.
3. **Review** (`ReviewScreen`): title (required to finish), a 3-line transcript preview with Edit, "How did it feel?" (free text, optional) with quick-pick chips from emotion words used before, tags (optional, suggestions from tags used before). **Done** needs a title and saves a finished dream; **Finish later** always works and saves a draft. Back goes to Read it back (new dream) or saves the reopened draft's edits and returns to the list.
4. **Dream list** (`DreamListScreen`): newest first, drafts mixed in by date and labelled "Not finished" (tap reopens Review). Dreams with audio have a play/pause button and a duration; dreams without audio show a keyboard glyph and a word count. A "Record a dream" button goes back to capture.
5. **"Write instead"** opens Read it back with an empty, focused text box and creates a dream with no audio (the microphone is never touched). **"No dream"** only opens the dream list (see Gaps).
6. **Transcript saving**: the final edited text is stored with the dream. Android hardware back mirrors the on-screen back arrows on Read it back and Review.

## How it is built

| Area                    | Where                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Screen switching        | `App.tsx` (a `useState` switch: `capture` / `readItBack` / `review` / `list`, plus Android `BackHandler`)    |
| In-progress dream       | `src/hooks/useDreamSession.ts` (reducer, `save`; edits survive Review to Edit to Review)                     |
| Back-arrow rules        | `src/utils/sessionNavigation.ts` (where each back goes, what is at stake)                                    |
| Screens                 | `src/screens/` (`CaptureScreen`, `ReadItBackScreen`, `ReviewScreen`, `DreamListScreen`, `capture/*View`)     |
| Recording               | `src/hooks/useDreamRecorder.ts` (wraps `expo-audio`)                                                         |
| Live text               | `src/hooks/useLiveTranscription.ts` (wraps `expo-speech-recognition`; never throws, recording is unaffected) |
| Fading transcript       | `src/utils/fadeTail.ts` (last words, each with a pre-blended colour)                                         |
| Playback (list)         | `src/hooks/useDreamPlayback.ts` (one shared player)                                                          |
| Playback (Read it back) | `src/components/RecordingPlayer.tsx`                                                                         |
| Emotion chips           | `src/components/EmotionChips.tsx`, `src/utils/emotions.ts` (split on commas/semicolons, toggle, suggest)     |
| Tags                    | `src/components/TagInput.tsx`, `src/utils/tags.ts` (lowercase, trim, strip `#`, de-duplicate)                |
| Display helpers         | `src/utils/capitalizeFirst.ts`, `src/utils/format.ts` (durations, today's date, word count)                  |
| Storage                 | `src/services/dreamStorage.ts` (wraps `expo-file-system`)                                                    |
| Data types              | `src/types/dream.ts`                                                                                         |
| Theme (colors, fonts)   | `src/theme/index.ts`                                                                                         |
| Test helpers            | `src/test/fakeFileSystem.ts` (in-memory `expo-file-system` with failure injection)                           |
| Build config            | `app.json` (permissions, plugins, `projectId`), `eas.json` (development and preview profiles)                |

**Data model** (`Dream`): `id`, `createdAt` (ISO, when first stored; a draft counts), `durationMs` (0 when there is no audio), optional `audioFileName` (absent means no audio), `title` (empty only for drafts and old dreams), optional `emotion`, `tags[]`, optional `transcript` (final edited text, trimmed, omitted when blank), optional `status: 'draft'` (absent means finished). Emotion is one free-text string, stored lowercase and shown with a capital first letter (field, chips, list). The chips split it on commas and semicolons only (never spaces) and match words case-insensitively.

**Storage layout**: everything is under `Paths.document`. `dreams.json` is the index. `dreams.json.bak` is a best-effort copy of the previous index, made before each write. `dreams.corrupt-<timestamp>.json` is a copy of an unparseable index, made at most once per app session. Audio is in `dreams/` as `<id>.m4a`, or `<id>-<k>.m4a` if that name was taken. Only the audio **file name** is stored, never a full path, because the document directory path can change between app updates on iOS; always resolve it through `audioFileName` / `dreamAudioUri`. Dreams saved before titles/tags existed load with `title: ''` and `tags: []`.

**Save order** (`saveDream`, an upsert by id; writes run one at a time): validate the title (only for a finished dream), copy the recording from the cache into `dreams/` (never overwriting), back up the index, write the index, and only then delete the cache file. If the index write fails, the copied audio is removed and the index is repaired from the in-memory pre-save list first, then from `.bak`; an intact index is never touched. A zero-length `dreams.json` counts as missing (a non-empty `.bak` is then the base). An unparseable non-empty index is never overwritten: saving throws `INDEX_UNREADABLE`, the list shows "Your saved dreams could not be read. Your recordings are safe.", and saving stays refused until a restore feature exists. On update, `undefined` for emotion or transcript keeps the stored value and `''` clears it.

**Recording flow detail**: the recorder writes to the cache directory. Nothing is stored permanently until Done or Finish later. Discarding (Read it back back arrow, after confirmation) deletes only the cache file of the new recording; nothing under `dreams/` is ever deleted by the app.

## Decisions made during development

- **Stack**: Expo (SDK 57) + TypeScript, ESLint + Prettier, Jest. Local-only storage; no backend.
- **On-device only.** Transcription runs on the device; no audio or text is sent anywhere. In practice this means `expo-speech-recognition` with the on-device request; the airplane-mode check on Android passed.
- **A development build is required.** `expo-speech-recognition` has native code, so Expo Go cannot load the app (the whole bundle fails to load). `expo-dev-client` and `expo-asset` are installed and `expo` is on `~57.0.27`.
- **Voice leads**, with "Write instead" as a secondary option. This resolved one open decision in `docs/product.md`.
- **Pause design**: recorder first, recognition stops while paused, a new session on resume, so the audio is always a superset of the transcript. A tap is ignored within 300 ms of the last one and after Save. Details are in `docs/spike-live-transcription.md`.
- **Flow**: Capture, Read it back, Review, Done. Nothing is stored permanently until Done or Finish later. Drafts are real dreams with `status: 'draft'`.
- **Emotion** stays free text; quick-pick chips come from words used before. Tag suggestions come only from tags used before. Nothing is derived from the content of a dream.
- **Storage safety**: copy-then-write-then-delete, a best-effort `.bak`, no overwrite of an unreadable index, one write at a time (decisions logged in the Steward repo).
- **System fonts for now.** The mockups use a display serif and a geometric sans; matching them would need bundled fonts.
- **Expo Router is NOT adopted.** `AGENTS.md` (from the Expo template) says to use it, but the app keeps the `App.tsx` state switch with `useDreamSession`. Do not add routes or another navigation library without asking.
- **"No dream"** is the label for dismissing capture (not "Skip"). **Title is required** to finish a dream; emotion and tags are optional.
- **Audio is kept** alongside the transcript (except for written dreams). The caption on the listening screen ("Audio and transcript are both kept") is now true.

## Gaps and known issues

**Verified by the user so far (Android only)**: live text appears while recording, audio quality is fine, a long dream scrolls, airplane mode still works (so recognition is on-device), no beeps at restarts. **iOS is untested** (the Apple developer account is pending).

**Not yet verified on any device** (all of it is covered only by typecheck, lint and Jest):

- Pause/resume: word loss or doubling at the seam, Android paused recorder plus a new recognizer, iOS audio session after resume, the OS auto-resuming a paused recorder (and whether the re-pause check fires), Save while paused, validity and length of a paused-then-saved m4a. The checklist is in `docs/spike-live-transcription.md`.
- The fading transcript look and readability on both platforms.
- Read it back and Review keyboard behavior, especially Android edge-to-edge (iOS uses a keyboard-avoiding view; Android relies on window resizing).
- A draft surviving a full app kill, reopening, and playing its audio.
- Android hardware back on Read it back and Review.
- Whether a recording and recognizer can run together on iOS at all.

**Accepted gaps**

- A native `stop()` that throws during pause is not handled. A resume after a fatal recognition error, before its `end` arrives, can leave live text off for the rest of that pause cycle (recording is unaffected). There is no visible state while a resume is in flight.
- Storage: the index write is not atomic. A kill mid-write can leave an empty or partial index; if every repair step also fails, the whole index can be lost. `.bak` is copied non-atomically and is not strictly the last known good. **A restore-from-backup feature is not built and needs the user's approval.**
- No delete for drafts or dreams, so an empty draft is possible. No dream detail view: a finished dream's transcript cannot be read again after Done.
- Live text is Android 13+ and iOS 17+ only; below that the app records audio only and shows a quiet note ("Live text isn't available on this phone."). That wording is a placeholder, and the support floor is pending a user decision.
- The permission prompt wording in `app.json` is pending a user decision. When both `expo-audio` and `expo-speech-recognition` set the iOS microphone text, which one wins is unverified.
- `npm audit` findings (dev and build tooling) are deferred to the next Expo SDK upgrade; never use `npm audit fix --force`.
- The debug line under the live text (shown when live text has a problem) is still there for device testing and should be removed later.

**Not built**

- **"No dream" only navigates to the dream list.** The "done for today" memory is not built, so it does not count as done for the day.
- No "on waking" logic: the app always opens to capture.
- No journal (entries or screen). The structure is undecided; ask before designing it.
- No filtering or browsing by tag. Playback has no scrubbing. English (en-US) only.

## Repo and workflow state

- Git: work is on `spike/live-transcription` (many commits). `master` holds only the template's initial commit and is untouched. `origin` is set to `git@github.com:brandedcow/lucid.git`, but **nothing has been pushed**; do not push unless the user asks.
- Identifiers: bundle ID / Android package `com.chrisvkang.lucid`; EAS `projectId` is in `app.json`; `ITSAppUsesNonExemptEncryption` is false. License is proprietary (all rights reserved), copyright Christopher Kang.
- `eas.json` has `development` (dev client, internal) and `preview` profiles. `app.json` declares Android and iOS permissions and the `expo-audio`, `expo-speech-recognition` and `expo-asset` plugins.
- **Running the app needs a development build** (Expo Go cannot load it). Android: after `expo-dev-client` was added, rebuild once locally (`npm run android`), then start Metro with `npm start`. iOS: build in the cloud with EAS as described in `docs/ios-dev-build.md`; it needs a paid Apple Developer account, which is pending.
- The user keeps an uncommitted edit to the `android` / `ios` scripts in `package.json` (`expo run:android` / `expo run:ios`); it stays local and must not be committed or reverted.
- Placeholder Expo icons and splash images are still in `assets/`. Not set up yet: CI, an app icon, and any secrets/`.env` handling.
- A project hook (`.claude/hooks/format.js`) runs Prettier on files after Claude edits them, and `.claude/settings.json` denies `git push` and reading `.env*` files.

## Gotchas

- Run `npm run check` (typecheck, lint, format check, tests) before calling anything done.
- In tests, native modules must be mocked. `expo-audio` is mocked per test file; `expo-file-system` uses `src/test/fakeFileSystem.ts` via `jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'))`. With React Native Testing Library v14, `render` and `fireEvent` are async: `await` them.
- Storage changes need careful tests with the faithful fake `src/test/fakeFileSystem.ts` (it models async copy/move, no-overwrite and failure injection).
- Use `SafeAreaView` from `react-native-safe-area-context`, not from `react-native` (deprecated). The app is wrapped in `SafeAreaProvider` in `App.tsx`.
- Install packages with `npx expo install`, and check Expo's versioned docs before touching Expo APIs (see `AGENTS.md`); Expo APIs change between SDKs.
- On Windows, the PowerShell tool sometimes reports exit code 255 for commands that actually succeeded (seen with some git and npm commands). Read the output to confirm.

## Suggested next steps

1. Device verification: the pause/resume seam, fading look, Read it back and Review keyboard on Android, drafts surviving an app kill, back handling; iOS once the Apple account clears.
2. Decide and build a restore-from-backup feature for an unreadable index (needs approval), and decide whether to make index writes atomic.
3. Add delete and a dream detail view (so finished transcripts can be read again).
4. Build "done for today" (so "No dream" counts) and "on waking" logic.
5. Decide the journal structure and navigation (Expo Router), then replace the `App.tsx` switch.
6. Tag browsing; remove the debug line; settle the permission wording, unsupported-phone wording and the OS support floor.
