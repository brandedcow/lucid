# Spike: live transcription during recording

Branch `spike/live-transcription`. Throwaway spike to find out whether on-device live speech-to-text (`expo-speech-recognition`) can run **while** the existing `expo-audio` recording is running. Nothing is saved; the transcript only appears on the capture screen. Not verified on any device yet.

Code: `src/hooks/useLiveTranscription.ts`, wired in `src/screens/CaptureScreen.tsx`, shown by `src/screens/capture/ListeningView.tsx`. Watch the Metro / device logs for lines starting with `[transcription]`.

## Why a development build

`expo-speech-recognition` has native code, so Expo Go cannot run it. You need a development build (a custom app with the native modules compiled in). Do not hand-edit `ios/` or `android/`; the config plugin in `app.json` generates them.

## Ways to make a dev build (not run by the spike)

| Option                        | Command                                                                     | Needs                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| iOS, local                    | `npx expo run:ios --device`                                                 | A Mac with Xcode, an iPhone on USB, an Apple ID (free account works for 7-day installs; set a signing team in Xcode on first run).    |
| iOS, cloud (EAS)              | `npx eas-cli@latest build --profile development --platform ios`             | Expo account, `eas.json` (not in repo yet; `eas build:configure`), paid Apple Developer account and the device registered for ad hoc. |
| Android, local                | `npx expo run:android --device`                                             | Android Studio / SDK and JDK, phone with USB debugging on. Works from Windows.                                                        |
| Android, cloud (EAS)          | `npx eas-cli@latest build --profile development --platform android`         | Expo account and `eas.json`. Produces an APK to install; no Google account fee.                                                       |
| Android, local EAS (no cloud) | `npx eas-cli@latest build --profile development --platform android --local` | Linux/macOS (or WSL) with the Android SDK; Expo account for config.                                                                   |

The EAS development profile needs `"developmentClient": true` and `"distribution": "internal"` in `eas.json`. Then run `npm start` and open the installed app.

## Android prerequisite: on-device speech model

The spike never falls back to the cloud. On Android 13+, install the offline English (US) model first: Settings > Security and privacy > More privacy settings > Android System Intelligence > On-device speech recognition (path varies by phone), or let the app report it. Also check "Speech Recognition & Synthesis" (`com.google.android.tts`) is installed and enabled. If the model is missing, the capture screen shows a small grey line saying so and recording continues without live text.

## What to check

Record a few dreams on each platform and write down results.

1. **Recording still works.** Save a dream after live text ran. Does the `.m4a` exist, is it the right length, does it play back with audible voice (review screen and dream list)? Compare with a recording made on the `feat/dream-capture-scaffold` branch.
2. **Waveform still moves.** Does the level meter react to your voice the whole time, and not freeze or go flat after live text starts?
3. **Live text appears.** Does text show within a couple of seconds of speaking? Interim words should change, then settle.
4. **Long dream (3 to 5 minutes).** Keep talking with natural pauses. Does text keep arriving to the end? Does the view stay scrolled to the newest words? Note any point where it stops. In the log, count `end` / `restarting` lines: restarts are expected, and the earlier text must stay on screen.
5. **Silence.** Stay quiet for 30 seconds, then speak. Does text resume? (The spike restarts recognition after silence, and gives up after 5 restarts in a row with nothing heard; the debug line then says live text stopped.) On Android, note any beeps at restarts.
6. **iOS audio session / interruptions.** Look for `error interrupted` or `audio-capture` lines. Test: incoming call or alarm during recording, lock screen, switching app and back, plugging in or removing headphones or Bluetooth. Does the m4a survive? Does the recording volume drop or sound muffled (the library defaults the session to `playAndRecord` with `measurement` mode, which can change input processing)? Does playback afterwards still work and use the speaker?
7. **Android mic lock.** Does starting live text make the recorder fail, or the reverse (the m4a is silent or empty, `audio-capture` or `busy` errors)? Check which one started first. Try with another app using the mic, and with the phone's default voice assistant.
8. **Pause / resume.** Not reworked in the spike. Note what happens to live text while paused (recognition keeps running) and whether the m4a still resumes correctly.
9. **Is on-device really used?** Turn on airplane mode before starting. If live text still works, it is on-device. If it only works online, it is using the cloud and the on-device request was ignored (the library only honors the request when the device supports it). On Android also check the log line `installed on-device locales:`; an empty list means the app could not verify the model and tried anyway.
10. **Permissions.** First run should prompt for microphone and speech recognition (iOS). Denying speech recognition should leave recording working with no alarming message other than the small grey debug line.
11. **Battery / heat** over a 5 minute session, roughly.

## Known limits of this spike

- Transcript is not stored, not sent to the review screen, and is lost on save.
- English (en-US) only.
- Recognition keeps running while the recording is paused.
- The debug line under the live text is for the device test and would be removed later.
