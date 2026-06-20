# Lurk App

Old-phone security, wildlife, and pet camera app.

## Current State

This first build includes:

- camera permission flow
- live camera preview
- start/stop monitor state
- keep-awake while monitoring
- manual event capture to local app storage
- local event timeline
- live control UI for quality, audio mute, torch, lens switch, rotate, and zoom
- detection control UI for all motion, person-only, animal/pet, zones, and schedules
- owner-action placeholders for push-to-talk, siren, app lock, and sharing

The detection, live streaming, remote sync, and ML paths are intentionally stubbed until the first device camera behavior is verified.

## Local Commands

```bash
npm install
npm run preflight
npx expo-doctor
npx expo start -c
```

## Android Dev Build

```bash
npm run build:dev:android
```

Install the dev build on the old phone, then run:

```bash
npm run dev:client
```

## Environment

Copy `.env.example` to `.env` and set:

```bash
EXPO_PUBLIC_LURK_DEVICE_ID=phone01
EXPO_PUBLIC_LURK_MEDIA_BASE_URL=https://www.lifeform7.com/lurk-media/
```
