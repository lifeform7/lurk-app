# Lurk App - Next Steps

This repo is the actual mobile app:

```text
/media/1tbNVME/app-dev/lurk-app
```

Training, datasets, experiments, and large model artifacts live separately:

```text
/home/daveh/ai_work/lurk
```

The app should consume explicit exported artifacts from training:

```text
model file
labels.json
model metadata/version
detection/classification thresholds
event type schema
remote media/event metadata
```

## Product Goal

Use an old phone as a reliable security, wildlife, and pet-watching camera.

The app should feel closer to the old useful Alfred Camera idea than a bloated cloud-first product:

- simple setup
- always-on camera mode
- motion/person/animal event capture
- local-first where practical
- optional server/NAS archive
- remote viewer later, but not required for first usefulness

## Related Repos And Storage

Training repo:

```text
/home/daveh/ai_work/lurk
https://github.com/lifeform7/lurk
```

App repo:

```text
/media/1tbNVME/app-dev/lurk-app
https://github.com/lifeform7/lurk-app
```

Media/event storage:

```text
smb://10.0.0.142/fileserver-php-htdocs/v2.5/lurk-media
```

Public gateway or static URL should be decided early. Reuse the i-like-birds pattern if media should live outside the app bundle:

```text
phone captures event -> upload/store media -> app/server writes manifest/index -> viewers stream selected media
```

## MVP App Shape

First useful build:

1. Camera monitor screen.
   - Full-screen live preview.
   - Start/stop monitoring.
   - Battery/thermal/storage status.
   - Clear "recording/monitoring" state.

2. Motion-triggered clips.
   - Keep a rolling buffer if feasible.
   - Save short clips around motion events.
   - Capture still thumbnail/poster for each event.
   - Avoid recording continuously unless explicitly requested.

3. Event timeline.
   - Local list of detected events.
   - Timestamp, type, confidence, thumbnail.
   - Filter by people, animals, vehicles, unknown motion.

4. Detection baseline.
   - Start with proven on-device models:
     - person detection
     - common object detection
     - animal/pet labels where available
   - Avoid custom training as a blocker for the first app.

5. Storage target.
   - Save recent events locally.
   - Optional upload/copy to the NAS/web media path.
   - Keep a JSON event index for later viewer/sync features.

## Architecture Recommendation

Use a proven video pipeline before custom ML:

- Expo/React Native for the app shell if camera/video support is enough.
- If Expo camera limitations block always-on monitoring, use a dev client or bare/native module path early.
- Use on-device inference for simple detection; reserve server-side analysis for heavier models.

Candidate app libraries to evaluate:

```text
expo-camera or react-native-vision-camera
expo-file-system
expo-video / native playback
react-native-fast-tflite or model-specific runtime
background/foreground service constraints on Android
```

Decision point:

- If `expo-camera` cannot handle the needed frame callbacks, use `react-native-vision-camera`.
- If background recording is needed, expect native Android work and a new build.

## Event Data Model

Keep event metadata small and portable:

```json
{
  "eventId": "2026-06-20T15-12-03.123Z-phone01",
  "deviceId": "phone01",
  "startedAt": "2026-06-20T15:12:03.123Z",
  "durationMs": 12000,
  "kind": "person|animal|pet|vehicle|motion|unknown",
  "labels": [
    { "label": "person", "score": 0.91 }
  ],
  "thumbnailUrl": "events/2026/06/20/event.webp",
  "videoUrl": "events/2026/06/20/event.mp4",
  "source": "local|nas|server",
  "model": {
    "id": "detector-v1",
    "version": "0.1.0"
  }
}
```

## App Build Order

1. Scaffold the app and confirm camera preview on the old phone.
2. Add monitor mode with obvious start/stop state.
3. Implement local motion event capture:
   - still image first
   - short video second
4. Add local event timeline.
5. Add basic on-device person/object detection.
6. Add NAS/server media output:
   - event files
   - event index JSON
   - retention policy
7. Add remote viewer mode:
   - same app can act as viewer
   - or simple web viewer through the existing PHP/webroot setup
8. Add notification hooks after event quality is acceptable.
9. Integrate custom animal/person classifier exported from the training repo.

## Remote Viewing Plan

Do not start with live cloud streaming.

First remote value:

- old phone records events
- event files land on the NAS/server
- viewer opens event timeline and clips

Later live-view options:

- local network WebRTC
- MJPEG/HLS gateway
- periodic still snapshots
- push notification with event thumbnail

## Reuse From I Like Birds

Useful patterns to copy:

- Separate app repo and training repo.
- Server-hosted media rather than app-bundled media.
- Manifest/index file fetched by the app.
- Expo dev-client build plan when adding native dependencies.
- Keep app artifacts small and versioned.

Do not copy:

- bird-specific pack assumptions
- audio spectrogram path
- species-region UI without adapting it to camera zones/devices

## Build And Validation Plan

Before spending an EAS/native build:

```bash
npx expo-doctor
npm run preflight
```

Device smoke tests:

- camera preview opens
- monitor mode runs for 30 minutes without crash
- phone does not overheat immediately
- event is captured when a person walks through frame
- no event flood when the room is still
- event thumbnail and clip play back
- app recovers after screen lock/power state changes, or documents the limitation

## Open Questions

- Is the old phone Android only, or should iOS be supported?
- Should monitor mode work with screen off?
- Is local-network-only acceptable at first?
- Should events upload to the webserver directly or sync through SMB/LAN later?
- How much privacy control is needed for indoor cameras?
- Should animal labels focus on pets, wildlife, or both?
