# Lucid

React Native (Expo, TypeScript) mobile app.

## Run

```bash
npm install
npm start        # scan the QR code with Expo Go
npm run check    # typecheck, lint, and format check
npm run format   # apply Prettier
```

## Structure

```
App.tsx            entry, renders the root screen
src/
  screens/         full-screen views (CaptureScreen: dream capture, idle + listening states)
  components/      reusable UI (MicIcon, Waveform)
  theme/           colors, spacing
  hooks/           custom hooks
  services/        API / storage / external integrations
  utils/           pure helpers
  types/           shared TypeScript types
assets/            icons and splash images
```
