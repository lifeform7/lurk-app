# Today Build Plan

Goal: get the first camera proof of life without burning native builds unnecessarily.

## Build Strategy

Start with Expo if possible, but expect a dev-client/native build if camera frame processors, background behavior, or TFLite modules are needed.

Use JS-only iteration for UI and metadata screens. Spend EAS/native builds only after choosing camera and ML libraries.

## First Checks

```bash
cd /media/1tbNVME/app-dev/lurk-app
npx expo-doctor
npm run preflight
```

## First Native Dependency Decision

Evaluate:

```text
expo-camera
react-native-vision-camera
react-native-fast-tflite
expo-file-system
expo-video
```

If `react-native-vision-camera` is selected, plan for a dev-client build immediately.

## First Device Test

1. Camera permission prompt works.
2. Preview displays correctly on the old phone.
3. Start/stop monitoring state works.
4. Capture one still frame to local storage.
5. Show that still frame in an event timeline.
6. Run for 10-30 minutes and observe battery/thermal behavior.

## Build Budget Rule

Do not spend an EAS/native build for:

- text/UI copy changes
- event timeline layout
- JSON schema changes
- server/NAS path changes

Do spend an EAS/native build for:

- camera native module changes
- TFLite/native inference runtime changes
- Android foreground service/background mode changes
- app permissions/config changes
