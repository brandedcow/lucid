# Status and handoff

Where the project stands, so anyone (human or agent) can pick it up. `docs/product.md` says what the app is; this file says what exists, what doesn't, and what to watch out for. Update it when you change the state of the project.

_Last updated: 2026-10-06 (Dream log, Dream entry, emotion input), branch `spike/live-transcription`._

## What works today

The dream flow, Dream log and Dream entry are built and covered by tests, but **mostly not yet verified on a physical device** (see Gaps):

1. **Capture** (`CaptureScreen`): idle view ("What happened in my dream?", tips, tap-to-talk button, "Write instead", "No dream"). Recording uses `expo-audio` while `expo-speech-recognition` shows **live on-device text** (a few of the newest words, older ones fading). A quiet status row shows "Listening · m:ss" or "Paused · m:ss" (the empty-transcript body reads "Listening..." or "Paused"), above a live waveform driven by the mic level. Pause/resume: the recorder pauses or resumes first, recognition stops while paused and a new session starts on resume; if the OS restarts the recorder while the UI says paused, a debounced check pauses it again (up to 3 times, then the screen follows the recorder). Save dream stops both and moves on.
2. **Read it back** (`ReadItBackScreen`): the transcript in an editable text box, the original recording playable below it (the card is unmounted while the keyboard is up, so playback stops and its position resets when the keyboard opens; accepted), Continue (enabled with non-blank text or a recording). The back arrow goes to a "Discard this dream?" confirmation for a new dream with something at stake; back from a reopened draft returns to the Dream log (a path that cannot happen today: a draft's Read it back always comes from Review's Edit, which returns to Review); back after Edit on Review returns to Review.
3. **Review** (`ReviewScreen`): title (required to finish), a 3-line transcript preview with Edit, "How did it feel?" (optional; an emotion input like the tag input, with quick-pick chips from emotion words used before), tags (optional, suggestions from tags used before). **Done** needs a title and saves a finished dream; **Finish later** saves a draft (a brand-new dream with nothing at all to keep, meaning no audio, text, title, emotion or tags, is not saved: the app just goes to the Dream log). Back goes to Read it back (new dream) or saves the reopened draft's edits and returns to the Dream log. When Review was opened with Edit on a finished dream (origin `edit`): "Finish later" is hidden; **Done** needs a title, saves the dream as finished and returns to that dream's entry; with no changes Done skips the write and returns to the entry; back with unsaved edits asks "Discard changes?" (Keep editing / Discard), and without edits it just returns. An edit never calls `save('draft')` and never discards persisted audio. While a save is in flight, back (arrow and Android hardware back) does nothing, and Done, Finish later, the transcript card and the title field, the emotion input (chips too) and the tag controls are locked.
   - **Emotion input** (`EmotionInput`): a single-line input with the placeholder "Add an emotion...". Enter (or a comma or semicolon) creates the emotion: trimmed, lowercased, inner spaces collapsed, cut to 40 characters, case-insensitive duplicates ignored; text with commas or semicolons creates several. Added emotions show as amber chips under the input (capitalized for display only; tap a chip to remove it). Emotions used before appear as "+ calm" suggestion chips (at most 8, not already added, filtered by the typed text); tapping one adds it. An emotion typed but not yet submitted is kept like a pending tag (session `emotionDraft`): it survives Edit text and back, counts as an edit, and is saved on Done or Finish later (`withPendingEmotion`). Storage is unchanged: `Dream.emotion` stays one optional lowercase string joined with ", "; older free-text emotions still show split on commas and semicolons (and are rewritten in the joined form only when the user changes the emotions on Review).
4. **Dream log** (`DreamLogScreen`): header "Dreams" with a search icon. Month sections (month in capitals, the year added when not the current year, "EARLIER" for a missing or invalid date). Tag chips: "All · N" and "tag · count" (the 20 most-used tags, selected tags always shown), multi-select; a dream must have ALL selected tags. Search (the icon replaces the title with a field and Cancel; the field has a clear (×) button once something is typed, and the "New dream" button is hidden while search is open) matches every typed word against title, transcript, emotion and tags (lowercased, accents stripped where the engine supports it; local text matching only) and combines with the tag filter. Rows: weekday and day, title (a short date when a finished dream has no title, "Untitled dream" when the date is missing or invalid), a 2-line transcript preview, emotion and tag chips (at most 4 chips in all, of which at most 2 are emotions, plus a "+N" overflow chip); no play button. Drafts appear inline by date as an outlined card: title "Untitled dream" (or the title), with " · m:ss" when it has audio, and the sub-line "Draft · Not reviewed yet · Finish now" with "Draft" in red; tapping opens Review. A "New dream" button (mic icon) opens capture. Empty ("No dreams yet."), no-results (with Clear) and unreadable-index states. The filter, search and scroll offset live in `useLogView` in `App.tsx`; the offset is restored once when the log is shown again.
5. **Dream entry** (`DreamDetailScreen`, finished dreams only): back and Edit; a date line ("Sunday, October 4 · 6:42 AM"); the title; all emotion and tag chips; a compact audio player when the dream has audio; the transcript in paragraphs, or "No text yet". Edit opens Review for that dream (see Review above). Not built: "Also tagged", "See all" and delete.
6. **"Write instead"** opens Read it back with an empty, focused text box and creates a dream with no audio (the microphone is never touched). **"No dream"** only opens the Dream log (see Gaps).
7. **Transcript saving**: the final edited text is stored with the dream.
8. **Android hardware back**: the entry goes to the log; the log with search open closes search; with search closed, Back on the log returns to capture, and on capture it exits as before (user decision 2026-10-06); Read it back and Review mirror the on-screen back arrows. Back is blocked while a save is in flight, which covers an edit too.
9. **Icon and splash**: a moon mark. `assets/icon.png` (full-bleed), `android-icon-foreground/monochrome/background.png`, `favicon.png` and `splash-icon.png`; source SVGs and generation notes are in `assets/icon-source/`. The `expo-splash-screen` plugin in `app.json` shows the splash on #0D1017 at width 200. They need a native rebuild to appear (see Repo and workflow state).

## How it is built

| Area                  | Where                                                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screen switching      | `App.tsx` (a `useState` switch: `capture` / `readItBack` / `review` / `log` / `detail`, plus Android `BackHandler`)                                                                                 |
| In-progress dream     | `src/hooks/useDreamSession.ts` (reducer, `save`; origins `capture`/`write`/`draft`/`edit`, an edit keeps a baseline)                                                                                |
| Stored dreams         | `src/hooks/useDreamLibrary.ts` (dreams and index status, `refresh`; lives in `App.tsx`)                                                                                                             |
| Dream log view state  | `src/hooks/useLogView.ts` (tag filter, search, scroll offset; lives in `App.tsx` so it survives leaving the log)                                                                                    |
| Back-arrow rules      | `src/utils/sessionNavigation.ts` (where each back goes, what is at stake, `hasEdits`, the "Discard changes?" text)                                                                                  |
| Screens               | `src/screens/` (`CaptureScreen`, `ReadItBackScreen`, `ReviewScreen`, `DreamLogScreen`, `DreamDetailScreen`, `capture/*View`)                                                                        |
| Recording             | `src/hooks/useDreamRecorder.ts` (wraps `expo-audio`)                                                                                                                                                |
| Live text             | `src/hooks/useLiveTranscription.ts` (wraps `expo-speech-recognition`; never throws, recording is unaffected)                                                                                        |
| Fading transcript     | `src/utils/fadeTail.ts` (last words, each with a pre-blended colour)                                                                                                                                |
| Playback              | `src/components/RecordingPlayer.tsx` (Read it back; `compact` variant on the Dream entry)                                                                                                           |
| Dream log logic       | `src/utils/dreamLog.ts` (month grouping, tag chips and counts, search and filter, row model)                                                                                                        |
| Dream chips           | `src/components/DreamChips.tsx` (emotion and tag chips in log rows and the Dream entry)                                                                                                             |
| Emotion input         | `src/components/EmotionInput.tsx`, `src/utils/emotions.ts` (`splitEmotions`, `addEmotions`, `joinEmotions`, `withPendingEmotion`, `MAX_EMOTION_LENGTH`)                                             |
| Tags                  | `src/components/TagInput.tsx`, `src/utils/tags.ts` (lowercase, trim, strip `#`, de-duplicate)                                                                                                       |
| Display helpers       | `src/utils/capitalizeFirst.ts`, `src/utils/format.ts` (durations, today's date, word count, `formatEntryDateTime`, `formatShortDate`, `plainSpaces`), `src/utils/paragraphs.ts` (`splitParagraphs`) |
| Storage               | `src/services/dreamStorage.ts` (wraps `expo-file-system`)                                                                                                                                           |
| Data types            | `src/types/dream.ts`, `src/types/entry.ts`                                                                                                                                                          |
| Shared UI             | `src/components/MicIcon.tsx` (mic glyph), `src/components/Waveform.tsx` (live level bars)                                                                                                           |
| Theme (colors, fonts) | `src/theme/index.ts` (includes the draft red and the emotion/tag chip tokens)                                                                                                                       |
| Test helpers          | `src/test/fakeFileSystem.ts` (in-memory `expo-file-system` with failure injection)                                                                                                                  |
| Build config          | `app.json` (permissions, plugins incl. `expo-splash-screen`, `projectId`), `eas.json` (development and preview profiles)                                                                            |
| Icon and splash       | `assets/` (`icon.png`, `android-icon-*`, `favicon.png`, `splash-icon.png`); sources and notes in `assets/icon-source/`                                                                              |

**Data model** (`Dream`): `id`, `createdAt` (ISO, when first stored; a draft counts), `durationMs` (0 when there is no audio), optional `audioFileName` (absent means no audio), `title` (empty only for drafts and old dreams), optional `emotion`, `tags[]`, optional `transcript` (final edited text, trimmed, omitted when blank), optional `status: 'draft'` (absent means finished). Emotion is one optional string of lowercase emotions joined with ", ", shown as chips with a capital first letter; see the Review notes above. Older dreams may hold free text in other cases; it is split on commas and semicolons only (never spaces) and matched case-insensitively.

**Storage layout**: everything is under `Paths.document`. `dreams.json` is the index. `dreams.json.bak` is a best-effort copy of the previous index, made before a write only when the current index is non-empty (a failed copy does not block saving). `dreams.corrupt-<timestamp>.json` is a copy of an unparseable index, made at most once per app session. Audio is in `dreams/` as `<id>.m4a`, or `<id>-<k>.m4a` if that name was taken. Only the audio **file name** is stored, never a full path, because the document directory path can change between app updates on iOS; always resolve it through `audioFileName` / `dreamAudioUri`. Dreams saved before titles/tags existed load with `title: ''` and `tags: []`.

**Save order** (`saveDream`, an upsert by id; writes run one at a time): validate the title (only for a finished dream), copy the recording from the cache into `dreams/` (never overwriting), back up the index, write the index, and only then delete the cache file. If the index write fails, the copied audio is removed and the index is repaired from the in-memory pre-save list first, then from `.bak`; an intact index is never touched. A zero-length `dreams.json` counts as missing (a non-empty `.bak` is then the base). An unparseable non-empty index is never overwritten: saving throws `INDEX_UNREADABLE`, the list shows "Your saved dreams could not be read. Your recordings are safe.", and saving stays refused until a restore feature exists. On update, `undefined` for emotion or transcript keeps the stored value and `''` clears it.

**Recording flow detail**: the recorder writes to the cache directory. Nothing is stored permanently until Done or Finish later. Discarding (Read it back back arrow, after confirmation) deletes only the cache file of the new recording; the app never deletes a stored dream's audio or any pre-existing file. The only removal under `dreams/` is `saveDream`'s own rollback of the copy that same save just made (when the copy or the index write fails).

## Decisions made during development

- **Stack**: Expo (SDK 57) + TypeScript, ESLint + Prettier, Jest. Local-only storage; no backend.
- **On-device only.** Transcription runs on the device; no audio or text is sent anywhere. In practice this means `expo-speech-recognition` with the on-device request; the airplane-mode check on Android passed.
- **A development build is required.** `expo-speech-recognition` has native code, so Expo Go cannot load the app (the whole bundle fails to load). `expo-dev-client`, `expo-asset` and `expo-splash-screen` are installed and `expo` is on `~57.0.27`.
- **Voice leads**, with "Write instead" as a secondary option. This resolved one open decision in `docs/product.md`.
- **Pause design**: recorder first, recognition stops while paused, a new session on resume, so the audio is always a superset of the transcript. A tap is ignored within 300 ms of the last one and after Save. Details are in `docs/spike-live-transcription.md`.
- **Flow**: Capture, Read it back, Review, Done. Nothing is stored permanently until Done or Finish later. Drafts are real dreams with `status: 'draft'`.
- **Emotion** stays free text entries the user creates with an input like the tag input (never a fixed list or rating); quick-pick chips come from words used before. Tag suggestions come only from tags used before. Nothing is derived from the content of a dream.
- **Storage safety**: copy-then-write-then-delete, a best-effort `.bak`, no overwrite of an unreadable index, one write at a time (decisions logged in the Steward repo).
- **System fonts for now.** The mockups use a display serif and a geometric sans; matching them would need bundled fonts.
- **Expo Router is NOT adopted.** `AGENTS.md` (from the Expo template) says to use it, but the app keeps the `App.tsx` state switch with `useDreamSession`. Do not add routes or another navigation library without asking.
- **"No dream"** is the label for dismissing capture (not "Skip"). **Title is required** to finish a dream; emotion and tags are optional.
- **Dream log and entry** (user, 2026-10-06): the log is not the journal home (journal structure stays open). Search covers title, transcript, emotion and tags, local text matching only. The tag filter is multi-select and a dream must have all selected tags. Edit reopens Review; Done on an edited dream returns to its entry; "Finish later" is hidden for finished dreams. The draft sub-line is "Draft · Not reviewed yet · Finish now" with "Draft" in red. No delete in this work; "Also tagged" and "See all" were removed from the entry (to revisit with AI suggestions later; AI features remain out of scope for v1). System fonts kept.
- **OS floor** (user, 2026-10-06): older phones can install the app. Live text is off on Android below 33 and iOS below 17, with the quiet note "Live text isn't available on this phone."; there is no install-time block.
- **Audio is kept** alongside the transcript (except for written dreams). The caption on the listening screen ("Audio and transcript are both kept") is now true.

## Gaps and known issues

**Verified by the user so far (Android only)**: live text appears while recording, audio quality is fine, a long dream scrolls, airplane mode still works (so recognition is on-device), no beeps at restarts. **iOS is untested** (the paid Apple Developer account is pending).

**Not yet verified on any device** (all of it is covered only by typecheck, lint and Jest):

- Dream log and entry: scroll position restored after the entry and after Edit; the search keyboard; the "New dream" button placement (gesture vs 3-button navigation); Android back (entry, search, the log returning to capture, Review and Read it back during an edit); playback on the entry and the compact player layout; the serif layout at a narrow width; a long list (a few hundred dreams); date formatting under Hermes; editing a dream that has audio, then restarting the app.

- Pause/resume: word loss or doubling at the seam, Android paused recorder plus a new recognizer, iOS audio session after resume, the OS auto-resuming a paused recorder (and whether the re-pause check fires), Save while paused, validity and length of a paused-then-saved m4a. The checklist is in `docs/spike-live-transcription.md`.
- The fading transcript look and readability on both platforms.
- Read it back and Review keyboard behavior, especially Android edge-to-edge (Read it back uses `KeyboardAvoidingView behavior="padding"` on both platforms; Review uses it on iOS only, with `behavior` undefined on Android, relying on window resizing there; the difference is unverified on a device).
- A draft surviving a full app kill, reopening, and playing its audio.
- Android hardware back on Read it back and Review.
- The emotion input on Review: the keyboard and return key (`returnKeyType="done"`, `blurOnSubmit={false}`: does Enter add the emotion and keep the keyboard open on both platforms?), and that a comma or semicolon from the soft keyboard or an IME creates the emotion.
- Tags and emotions place added chips differently on Review (tag chips above their input, emotion chips below it). This is a visual inconsistency to review on a device; not decided.
- Whether a recording and recognizer can run together on iOS at all.

**Accepted gaps**

- A native `stop()` that throws during pause is not handled. A resume after a fatal recognition error, before its `end` arrives, can leave live text off for the rest of that pause cycle (recording is unaffected). There is no visible state while a resume is in flight.
- Storage: the index write is not atomic. A kill mid-write can leave an empty or partial index; if every repair step also fails, the whole index can be lost. `.bak` is copied non-atomically and is not strictly the last known good. **A restore-from-backup feature is not built and needs the user's approval.**
- On Read it back the recording card is unmounted while the keyboard is visible, so playback stops and its position resets when the keyboard opens (user decision: keep stop-and-reset).
- Review card accessibility label includes the whole first line of the transcript, so a very long first line is read in full (cap or leave: undecided). The Review card and the Dream log row accessibility labels read long dates.
- No delete for drafts or dreams. A brand-new dream with nothing to keep is not saved by Finish later, so an empty draft can only arise by clearing a reopened draft's contents and leaving. No restore-from-backup. No "Also tagged" or "See all" on the Dream entry (to revisit with AI suggestions later).
- Live text is Android 13+ and iOS 17+ only; below that the app records audio only and shows a quiet note ("Live text isn't available on this phone."). The wording is the working text (not formally approved; the user will send small copy tweaks from their own testing); the floor itself is decided (see Decisions: older phones can install).
- An old finished dream with an empty title needs a title before Done after Edit (going back without changes is fine).
- Dream log: the tag chip row shows only the 20 most-used tags (others are reachable through search). The scroll restore may land short on a long list (device check). If the library refresh fails after a successful save, the log and entry keep stale data until the next refresh (very unlikely). `readItBackBack` has an unreachable `'list'` branch (drafts). The draft card typography differs from the mockup (serif vs sans; taste). A draft with audio and zero length shows " · 0:00" (the user chose to keep the label as is). The tag stats in `dreamStorage` sort with `localeCompare` while the log's chips sort by code unit (minor inconsistency). Hermes `toLocale*String` and `String.normalize` behavior is unverified on a device (spacing is normalized in code, and search folding falls back to plain lowercase).
- The permission prompt wording in `app.json` stays as is (user decision, 2026-10-06). The iOS microphone and speech strings come from three sources: `app.json` `ios.infoPlist` (`NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` set directly), the `expo-audio` plugin ("Lucid uses the microphone to record your dreams.", different wording) and the `expo-speech-recognition` plugin. Which one wins in the built Info.plist is unverified.
- `npm audit` findings (dev and build tooling) are deferred to the next Expo SDK upgrade; never use `npm audit fix --force`.
- The debug line under the live text (shown when live text has a problem) is still there for device testing and should be removed later.

**Not built**

- **"No dream" only navigates to the Dream log.** The "done for today" memory is not built, so it does not count as done for the day.
- No "on waking" logic: the app always opens to capture.
- No journal (entries or screen). The structure is undecided; ask before designing it.
- No journal home, and no delete. Playback has no scrubbing. English (en-US) only.

## Repo and workflow state

- Git: work is on `spike/live-transcription` (many commits). `master` holds only the template's initial commit and is untouched. `origin` is set to `git@github.com:brandedcow/lucid.git`, but **nothing has been pushed**; do not push unless the user asks.
- Identifiers: bundle ID / Android package `com.chrisvkang.lucid`; EAS `projectId` is in `app.json`; `ITSAppUsesNonExemptEncryption` is false. License is proprietary (all rights reserved), copyright Christopher Kang.
- `eas.json` has `development` (dev client, internal) and `preview` profiles. `app.json` declares the iOS permission strings (`ios.infoPlist`), the Android permissions, and the `expo-audio`, `expo-speech-recognition`, `expo-asset` and `expo-splash-screen` plugins.
- **Running the app needs a development build** (Expo Go cannot load it). Android: after `expo-dev-client` was added, rebuild once locally (`npm run android`), then start Metro with `npm start`. iOS: build in the cloud with EAS as described in `docs/ios-dev-build.md`; it needs a paid Apple Developer account, which is pending (iOS untested).
- The user keeps an uncommitted edit to the `android` / `ios` scripts in `package.json` (`expo run:android` / `expo run:ios`); it stays local and must not be committed or reverted.
- The app icon and moon splash are in `assets/` but appear only after a native rebuild: Android needs `npx expo prebuild --platform android --clean` then `npm run android`; iOS needs a new EAS build. Not set up yet: CI and any secrets/`.env` handling.
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
3. Add delete (needs approval).
4. Build a real "No dream" with "done for today", and "on waking" logic.
5. Decide the journal structure and navigation (Expo Router), then replace the `App.tsx` switch.
6. AI suggestions (for example "Also tagged") only later; AI features are out of scope for v1.
7. Remove the debug line. Apply small copy tweaks (including the unsupported-phone note) when the user sends them from their own testing; the permission wording stays as is.
