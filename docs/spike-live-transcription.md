# Spike: live transcription during recording

> **Superseded (2026-10-06).** Live transcription is now part of the app: the transcript is saved with the dream and edited on Read it back (see `docs/status.md`). This file is kept as the **device checklist** for it. Lines below that say the transcript is not stored, or that only the capture screen shows it, are out of date and marked as such. Android has been partly verified (live text, audio quality, long dreams, airplane mode, no beeps); iOS is untested.

Spike branch `spike/live-transcription` (merged into `main`). Live text needs iPhone iOS 17+ or Android 13+ (API 33+); older phones can still install the app, live text is off with a quiet note and recording continues (user decision 2026-10-06, no install-time block). On-device recognition only. Pause/resume is built (see "Pause and resume design"); not yet device-verified. Throwaway spike to find out whether on-device live speech-to-text (`expo-speech-recognition`) can run **while** the existing `expo-audio` recording is running. _(Out of date: the transcript is now saved with the dream. Device verification is partial, see the note above.)_

Code: `src/hooks/useLiveTranscription.ts`, wired in `src/screens/CaptureScreen.tsx`, shown by `src/screens/capture/ListeningView.tsx`. Watch the Metro / device logs for lines starting with `[transcription]`.

## Why a development build

`expo-speech-recognition` has native code, so Expo Go cannot run it. This is not just "live text is off in Expo Go": the library calls `requireNativeModule` when it is imported, so the **whole JS bundle fails to load** in Expo Go and the app does not open at all. You need a development build (a custom app with the native modules compiled in). Do not hand-edit `ios/` or `android/`; the config plugin in `app.json` generates them.

## Ways to make a dev build (not run by the spike)

| Option                        | Command                                                                     | Needs                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| iOS, local                    | `npx expo run:ios --device`                                                 | A Mac with Xcode, an iPhone on USB, an Apple ID (free account works for 7-day installs; set a signing team in Xcode on first run). |
| iOS, cloud (EAS)              | `npx eas-cli@latest build --profile development --platform ios`             | Expo account, `eas.json`, paid Apple Developer account and the device registered for ad hoc.                                       |
| Android, local                | `npx expo run:android --device`                                             | Android Studio / SDK and JDK, phone with USB debugging on. Works from Windows.                                                     |
| Android, cloud (EAS)          | `npx eas-cli@latest build --profile development --platform android`         | Expo account and `eas.json`. Produces an APK to install; no Google account fee.                                                    |
| Android, local EAS (no cloud) | `npx eas-cli@latest build --profile development --platform android --local` | Linux/macOS (or WSL) with the Android SDK; Expo account for config.                                                                |

The EAS development profile needs `"developmentClient": true` and `"distribution": "internal"` in `eas.json`. Then run `npm start` and open the installed app.

## Android prerequisite: on-device speech model

The spike never falls back to the cloud. On Android 13+, install the offline English (US) model first: Settings > Security and privacy > More privacy settings > Android System Intelligence > On-device speech recognition (path varies by phone), or let the app report it. Also check "Speech Recognition & Synthesis" (`com.google.android.tts`) is installed and enabled. If the model is missing, the capture screen shows a small grey line saying so and recording continues without live text.

## What to check

Record a few dreams on each platform and write down results.

1. **Recording still works.** Save a dream after live text ran. Does the `.m4a` exist, is it the right length, does it play back with audible voice (Review, Read it back and the Dream entry)? Compare with a recording made on the `feat/dream-capture-scaffold` branch.
2. **Waveform still moves.** Does the level meter react to your voice the whole time, and not freeze or go flat after live text starts?
3. **Live text appears.** Does text show within a couple of seconds of speaking? Interim words should change, then settle.
4. **Long dream (3 to 5 minutes).** Keep talking with natural pauses. Does text keep arriving to the end? Does the view stay scrolled to the newest words? Note any point where it stops. In the log, count `end` / `restarting` lines: restarts are expected, and the earlier text must stay on screen.
5. **Silence.** Stay quiet for 30 seconds, then speak. Does text resume? (The spike restarts recognition after silence. A restart counts as failed only when the previous session lasted under 2 seconds and produced no result; after 5 failed restarts in a row it gives up and the debug line says live text stopped. Any result resets the count.) On Android, note any beeps at restarts.
6. **iOS audio session / interruptions.** Look for `error interrupted` or `audio-capture` lines. Test: incoming call or alarm during recording, lock screen, switching app and back, plugging in or removing headphones or Bluetooth. Does the m4a survive? Does the recording volume drop or sound muffled (the library defaults the session to `playAndRecord` with `measurement` mode, which can change input processing)? Does playback afterwards still work and use the speaker?
7. **Android mic lock.** Does starting live text make the recorder fail, or the reverse (the m4a is silent or empty, `audio-capture` or `busy` errors)? Check which one started first. Try with another app using the mic, and with the phone's default voice assistant.
8. **Pause / resume.** Superseded: the earlier "pause hidden/obsolete" note no longer applies. See the pause and resume device checks below.
9. **Is on-device really used? (airplane-mode test, on each platform.)** Turn on airplane mode before starting. If live text still works, it is on-device; this is the proof. If it only works online, it is using the cloud and the on-device request was ignored (the library only honors the request when the device supports it). On Android also check the log line `installed on-device locales:`; an empty list means the app could not verify the model and tried anyway.
10. **Permissions.** First run should prompt for microphone and speech recognition (iOS). Denying speech recognition should leave recording working with no alarming message other than the small grey debug line.
11. **Battery / heat** over a 5 minute session: rough impressions of battery drop and how warm the phone gets.
12. **Baseline comparison.** Record a baseline m4a on branch `feat/dream-capture-scaffold` and one with live text on this branch: same phrase, same distance from the phone. Compare file size, loudness and playback. The log prints the file size, `durationMs` and wall-clock seconds after every recording (`recording file ...`).
13. **Variants.** Run each of `IOS_SESSION_MODE` (iOS) and `START_ORDER` (both) settings (see below) and note which combination gives a complete, loud-enough m4a together with live text.
14. **Android restarts.** Over 3 to 5 minutes, count `end` / `restarting` log lines and note any recognizer beeps.
15. **iOS interruptions.** Lock the screen mid-recording; take a call or let an alarm ring; plug in earphones. Note the effect on live text and on the m4a.
16. **Permission edge cases.** Deny speech permission on first run (recording must still work). Grant it on first run mid-recording and note any gap in the m4a. Tap Save while the first-run permission dialog is showing.

## Pause and resume design

The pause button is back on the capture screen. `CaptureScreen` owns a `paused` state (with a ref mirror) that is the UI truth and follows the recorder; the hook's own `paused` is not used by the screen.

- **Order.** Pause and resume always act on the recorder first, then on recognition, without awaiting between them. The recorder is authoritative: if `recorder.pause()` or `recorder.resume()` throws, nothing else changes. If `transcription.resume()` returns false, the screen stays resumed, the recording continues, and live text just stops growing (the debug line shows `transcription.error`; no alert).
- **Toggle guards.** A tap is ignored within 300 ms of the last one, and once Save has been pressed. Save works while paused or while a resume is in flight (both stops run in parallel as before).
- **Hook.** `resume()` is single-flight and last intent wins: a resume while one is in flight shares its result, and a pause during the wait is honored when the old session finishes winding down. `stop()` skips the second native stop when the hook is already stopping. Reason (iOS): in the library source a second stop() takes the reset branch and cancels the final-result flush, so the last words of a paused session would be lost.
- **Reconcile.** If the OS restarts the recorder while the UI says paused, a 500 ms debounced check calls `recorder.pause()` again (never `transcription.pause()`). After 3 re-pauses without effect the screen follows the recorder and resumes (recorder, then recognition). The count resets on every user toggle. The opposite case (recorder stopped by the OS while the UI says recording) is not handled; record what the device shows.
- **Accepted gaps.** A native `stop()` that throws during pause is not realistically reachable and is not handled (a later resume could then start a second session). A resume after a fatal error whose `end` has not arrived yet can fail and leave live text off until the next resume; the recording is unaffected.

### Pause and resume: device checks (not done yet)

None of these have been run on a device. Do them on iOS and Android.

- **Seam word loss.** Speak continuously across a pause and a resume. Are words lost or doubled at the seam?
- **Android.** A paused MediaRecorder plus a new SpeechRecognizer on resume: any beep, busy or audio-capture error, or the recorder going silent?
- **iOS audio session** after resume: still recording and recognizing? Does the OS auto-resume a recorder the user paused? If so, does the reconcile fire, and how often (look for repeated recorder re-pause)?
- **Native `end` never arriving** after pause: does a later resume still start live text?
- **Save while paused**, and Save while a pause is still draining on iOS: does the final refinement of the last words arrive?
- **Pause during the first-run permission dialog.**
- **Lock, call or background while paused**, then return and resume.
- **Saved m4a** from a paused-then-saved session (and a paused-resumed-saved one): valid, plays, and the length matches the time actually recorded (not including paused time).
- **Fading transcript.** Three brightness tiers across about 3 lines; the floor (dimmest) line is still readable; a clipped top line is acceptable; check on both platforms. Caption wording: "Audio and transcript are both kept" reads as intended.

## Experiment switches (JS only)

Both are plain constants. Edit the value, save, and reload the JS (shake menu > Reload, or press `r` in Metro). No native rebuild is needed.

- `IOS_SESSION_MODE` in `src/hooks/useLiveTranscription.ts`: `'default'` lets the speech library set the iOS audio session; `'matchExpoAudio'` passes `playAndRecord` with `defaultToSpeaker` and `allowBluetooth` so it matches what expo-audio sets. The log prints the audio session before and after start.
- `START_ORDER` in `src/screens/CaptureScreen.tsx`: `'recorderFirst'` (default) starts the recorder, then live text; `'speechFirst'` starts live text first, then the recorder.

## Permission text

There are three sources for the iOS strings: `app.json` `ios.infoPlist` sets `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` directly, and both the `expo-audio` plugin ("Lucid uses the microphone to record your dreams.") and `expo-speech-recognition` plugin write `NSMicrophoneUsageDescription`, with different wording. Which one wins in the built Info.plist is unverified. Reading the plugin sources: the speech plugin assigns its string directly into `ios.infoPlist` when the config is evaluated, while the expo-audio plugin applies its string later, inside an Info.plist mod (`createPermissionsPlugin`, which prefers its own value). So the likely winner is the expo-audio string, not the one listed last in `app.json`. Not verified; check the generated `Info.plist` after a prebuild or the text in the iOS permission dialog. The wording is user-owned copy and was not changed.

## Known limits of this spike

- Out of date: the transcript is now stored with the dream and shown on Read it back.
- English (en-US) only.
- Pause/resume is built and unit-tested with mocks only; it has not been run on any device (still true).
- The debug line under the live text is for the device test and would be removed later.
