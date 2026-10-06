# iOS development build (EAS, physical iPhone)

Lucid uses native modules (`expo-audio`, `expo-speech-recognition`), so Expo Go cannot run it. It also includes `expo-dev-client`, which turns the build into a development build that loads JavaScript from Metro on your PC. Build a development build in the cloud with EAS Build and install it on your iPhone. Run every command below from the project folder in a Windows terminal.

## Prerequisites

- A free Expo account (https://expo.dev/signup).
- A paid Apple Developer Program account. Installing an internal (ad hoc) build on a real iPhone needs one. A free Apple ID is not enough.
- An iPhone on iOS 17 or later (needed by `expo-speech-recognition`).
- Developer Mode on the iPhone: Settings > Privacy & Security > Developer Mode, turn it on and restart. If the switch is missing, install the app (step 5) and look again. Expo docs: https://docs.expo.dev/guides/ios-developer-mode/
- A clean, committed branch (see "What gets built"). The `expo-dev-client` dependency must be committed before the first iOS build, otherwise the build is not a development build.

## Steps

1. Log in to Expo (interactive):
   `npx eas-cli@latest login`
2. Link the project to your Expo account (first time only). This adds `extra.eas.projectId` (and possibly `owner`) to `app.json`, which you should commit:
   `npx eas-cli@latest init`
3. Register the iPhone. Run the command, choose "Website" for the registration method, then open the URL or scan the QR code on the iPhone and install the profile it offers (Settings > Profile Downloaded > Install):
   `npx eas-cli@latest device:create`
4. Start the build. It asks you to sign in to your Apple Developer account (2FA) and lets EAS manage the signing credentials:
   `npx eas-cli@latest build --profile development --platform ios`
5. When the build finishes, open the link or scan the QR code shown in the terminal (or from the build page on expo.dev) on the iPhone and install the app. Trust it if prompted.
6. Start Metro on your PC and open the app on the phone:
   `npx expo start --dev-client`
   Put the phone and PC on the same Wi-Fi. If the phone cannot reach the PC, use `npx expo start --dev-client --tunnel`. On the same Wi-Fi, Windows Firewall must allow port 8081 (Metro).
   `[transcription]` logs appear in this Metro terminal.

Register a new device later with `device:create`, then run the build again. Only builds made after registering a device can be installed on it.

## Standalone fallback

`npx eas-cli@latest build --profile preview --platform ios` makes an internal build without the development client. It is a fallback only: there is no Metro and no logs, and every JavaScript change needs a new cloud build. Prefer the development build.

## What gets built

EAS builds from the committed state of your git repo. Uncommitted changes (including edits to tracked files) are not guaranteed to be in the build. Before building:

1. `git status` shows nothing you care about as uncommitted.
2. `git log -1` is the commit you want built.

JavaScript changes after the build do not need a new build: Metro serves them to the installed app. A rebuild is needed only when native configuration changes (new native package, `app.json` plugins or permissions, `eas.json`).

## Time and quota

- Expect roughly 10 to 20 minutes per iOS build, more if the free-tier queue is busy. This is an estimate, not a documented figure.
- The Free plan is low-priority queue. The pricing page at https://expo.dev/pricing listed 15 Android and 15 iOS builds per month when checked. Confirm on that page and in your Expo dashboard, since limits change.

## Notes

- Android needs exactly one rebuild after the `expo-dev-client` commit:
  1. Stop Metro.
  2. Optional but safest: `npx expo prebuild --platform android --clean`. `android/` is gitignored, so back up any hand-edits first.
  3. `npm run android`.

  Afterwards the Android app opens the dev-client launcher, where you pick the Lucid entry from Metro.
