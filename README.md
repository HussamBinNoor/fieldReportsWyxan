# Field Reports

Field Reports is an offline-first Android app for an inspector who writes a short description, attaches one to five photos, and needs those reports to arrive later. Saving a report does not mean the server has it. The phone keeps the report, the compressed photos, and the upload job in SQLite, then sends them when the network and the process allow it.

The server is the authority for completed reports. Repeating an upload uses the same report id and the same photo ids. The API stores each one once.

## Features

- Create a report with a required description and 1–5 photos from the camera or the gallery. No network is required to save it.
- Copy each photo into app-private storage, compress it, and refuse it if it cannot be brought down to 5,000,000 bytes.
- Persist reports, photos, and upload jobs in SQLite. A force-stop does not drop them.
- Upload photos one at a time, then finalize the report. Each success is written to SQLite before the next step.
- Retry network and server failures with backoff. Keep validation failures for a manual retry.
- Show local delivery state separately from reports loaded with `GET /api/reports`.
- Diagnostics for the backend address, queue, failure simulation, and a local-only reset.
- Android WorkManager schedules a headless upload pass when the app leaves the foreground. Android decides when that work runs.

## Technology

| Piece | Choice | Why |
| --- | --- | --- |
| App | React Native CLI 0.88.1, TypeScript, Hermes, New Architecture | Required CLI workflow. Versions match the template that was generated for this environment. |
| Navigation | React Navigation 7, native stack and bottom tabs | Small set of screens, native transitions. |
| Icons | `@react-native-vector-icons/feather` | The current React Native Vector Icons packages, one font instead of every set. Android copies `Feather.ttf` into the APK and stores it uncompressed, because a deflated font asset does not load. |
| Local database | `@op-engineering/op-sqlite` | SQL, transactions, and foreign keys without a second storage system for the queue. |
| Photos | `react-native-image-picker`, `@bam.tech/react-native-image-resizer` | Camera and gallery, plus JPEG resize that applies orientation on Android. |
| Files | `react-native-blob-util` | App-private copies, file size, and SHA-256. |
| Network | `fetch`, `@react-native-community/netinfo` | One client outside the screens. NetInfo only hints; HTTP errors still drive retries. |
| Background | AndroidX WorkManager 2.10.1 and a headless JS task | A maintained scheduler with a connected-network constraint. |
| API | Express 4, Multer, `better-sqlite3`, TypeScript | Small local server with real uniqueness constraints. |
| Tests | Jest, Node's test runner, Supertest | Queue behavior without rendering screens, and HTTP behavior against a temporary database. |

React Native, Gradle, Kotlin, and the Android Gradle Plugin were left on the versions created by the CLI.

## Architecture

Screens talk to a few modules. They do not upload.

- `src/reports/saveReport.ts` validates input, prepares photos, and inserts the report, images, and job in one transaction.
- `src/db` owns the schema (`user_version` 1) and every status change.
- `src/images` decides resize steps and writes the final JPEG.
- `src/upload/engine.ts` is the queue. It has no React imports. Tests drive it with an in-memory store.
- `src/upload/coordinator.ts` runs that engine while the app is open, watches NetInfo and AppState, and asks Android to schedule a later pass.
- `src/network/apiClient.ts` is the only HTTP client.
- `backend/src` stores completed reports and serves their files.

### Local tables

`reports` holds the description, delivery status, progress, retry time, last error, and the idempotency key. The report id is that key, and it is created once.

`report_images` holds the private file path, original size, compressed size, checksum, and per-photo upload state.

`upload_jobs` has one row per report. A conditional update sets `locked_at` only when the job is free, so a second worker in the same process skips it. After a restart, a lock owned by a previous process id is released.

`settings` stores the backend URL and the last sync time.

### Upload protocol

1. `POST /api/reports/:reportId/images/:imageId` with the JPEG, its checksum, and its size.
2. `POST /api/reports/:reportId/finalize` with the description, the idempotency key, and the expected image ids.
3. `GET /api/reports/:reportId` during recovery, when a previous attempt may have finished after the response was lost.
4. `GET /api/reports` and `GET /api/reports/summary` for the Server screen.

The image primary key is `(report_id, image_id)`. The report primary key is the client id, and `idempotency_key` is unique. The same ids return the stored row. A different checksum for an existing image id is rejected. Finalize requires every expected image and a non-empty description. A second finalize returns the same completed row. `GET /api/reports` returns completed reports only.

Photos are written to a temp file, checked, then renamed into `uploads/<reportId>/<imageId>.jpg`. The response does not include a filesystem path.

### Retries

The first attempt is immediate. Later attempts wait 2s, 5s, 15s, 30s, then double until 5 minutes, plus up to 20% jitter (at most 1 second). A `Retry-After` header overrides that delay.

Network loss, timeouts, HTTP 408, 429, and 500–504 are retried. The report stays on the device. A missing file, a photo over 5 MB, or HTTP 400/401/403 stops the job until someone uses Retry. Nothing is deleted on failure.

While the app is open, uploads are sequential. That is deliberate for a slow radio.

### Android background

`UploadScheduler` enqueues unique WorkManager work named `field-reports-upload` with `NetworkType.CONNECTED`. The worker starts a short foreground service, which runs the headless task `FieldReportsUpload`. That task reads SQLite and calls the same engine. If the native module is missing, scheduling is a no-op and the in-app queue still runs.

WorkManager does not promise immediate execution. A force-stop from system settings blocks scheduled work until the user opens the app again. Swiping the app away is not the same as force-stop. The reliable path is the queue that runs when the process is alive.

## Requirements

- Node.js 22.11 or newer (developed on Node 24.22).
- Yarn 3.6.4, provided by the repo via `packageManager`.
- JDK 17.
- Android SDK with platform 36, build-tools, and an emulator or a device. This workspace used SDK platforms 30–37, build-tools 35–37, and NDK 27.1.12297006.
- `ANDROID_HOME` pointed at the SDK. `android/local.properties` is generated locally and is not committed.
- Backend: Node, npm, and a compiler toolchain for `better-sqlite3`.

The app package is `com.wyxan.fieldreports`. `minSdk` is 24. The debug APK built here targeted `arm64-v8a`.

## Mobile setup

From the repository root:

```sh
yarn install
yarn start
```

In another terminal:

```sh
yarn android
```

`android/local.properties` needs `sdk.dir`. If it is missing:

```sh
echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties
```

An arm64 debug build without installing:

```sh
cd android
./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a
```

The APK is `android/app/build/outputs/apk/debug/app-debug.apk`.

iOS is not part of this submission. CocoaPods were not installed.

## Backend setup

The API is a separate npm project because the root Yarn install is not a workspace.

```sh
cd backend
npm install
cp .env.example .env
npm start
```

From the repo root, `yarn backend` runs the same server in watch mode.

The process listens on `0.0.0.0:4000`. SQLite is created under `backend/data` and photos under `backend/uploads`. Both are gitignored. No separate migration command is required; the schema is applied on startup.

Check it:

```sh
curl http://127.0.0.1:4000/api/health
curl http://127.0.0.1:4000/api/reports/summary
```

Set `NODE_ENV=production` to turn off `/api/dev/simulation`. Do not use production mode for the failure drills below.

## Network configuration

The app default is the emulator address, `http://10.0.2.2:4000`. Change it in Diagnostics and tap Save address.

| Where the app runs | Backend URL |
| --- | --- |
| Android emulator | `http://10.0.2.2:4000` |
| Phone on the same LAN | `http://<computer-lan-ip>:4000` |
| Phone over USB with `adb reverse tcp:4000 tcp:4000` | `http://127.0.0.1:4000` |
| API itself, on the computer | `http://127.0.0.1:4000` |

`localhost` on the phone is the phone, not the computer. Cleartext HTTP is enabled so a local server works without TLS. Do not point the app at a production host over cleartext.

## Failure simulation

Diagnostics sends these presets to `POST /api/dev/simulation`. They apply only to report upload and finalize, not to health or the server list. You can also call the endpoint directly.

```sh
curl -X POST http://127.0.0.1:4000/api/dev/simulation \
  -H 'Content-Type: application/json' \
  -d '{"latencyMs":8000,"dropNext":0,"failNext":0,"failStatus":500,"hang":false,"refuseUploads":false}'
```

| Goal | Body |
| --- | --- |
| Slow network | `"latencyMs": 8000` |
| Drop the next image connections | `"dropNext": 2` (the socket is destroyed) |
| HTTP 500 or 503 | `"failNext": 1, "failStatus": 500` or `503` |
| Hang until the app times out | `"hang": true` |
| Refuse uploads | `"refuseUploads": true` (HTTP 503) |
| Clear | all zeros and both booleans false, or `POST /api/dev/simulation/reset` |

A dropped or failed upload stays in SQLite and is retried. The Server list stays empty until finalize succeeds.

## Reset

Diagnostics asks before deleting. Reset removes local reports, upload jobs, image rows, app-private photos, and local settings other than the backend address. It does not delete anything on the server. The confirmation text says that.

## Testing

Unit and queue tests:

```sh
yarn test --watchman=false --ci
yarn typecheck
yarn lint
```

Backend:

```sh
yarn backend:test
yarn backend:typecheck
```

Latest run on this machine, 5 Nov 2026:

- `yarn typecheck` and `yarn backend:typecheck` completed with no errors.
- `yarn lint` completed with no errors.
- Jest: 6 suites, 30 tests, all passed. They cover validation, compression steps, retry delays, error classification, and the upload engine (success, offline, dropped image upload, lost finalize response, repeated ids, partial images, permanent validation failure, a lock left by a dead process, two workers, a missing file, a file over 5 MB, and `Retry-After`).
- Backend: 4 tests, all passed. They cover a file over 5 MB, a repeated image id, an unfinished report hidden from the list, a repeated finalize, checksum mismatch, and a bad id.
- `./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a` finished with `BUILD SUCCESSFUL`.

### Device session

Ran on an Infinix X6817, Android 12 (API 31), USB debugging, debug build, Metro on the computer. This was not an emulator. Wi-Fi and mobile data were turned off with `adb shell svc wifi disable` and `svc data disable`. That is not the system airplane-mode tile. The dashboard showed Offline.

What was checked:

1. The app opened to a dashboard whose counts came from SQLite (all zeros).
2. Diagnostics saved `http://127.0.0.1:4000` after `adb reverse tcp:4000 tcp:4000`.
3. With the radios off, three reports were saved from the gallery: one photo, two photos, and five photos. Each stayed "Waiting for connection". The five-photo report's save control sat under the gesture navigation area; it was tapped on the visible edge. Bottom inset padding was added afterward so that control clears the bar.
4. `am force-stop` and a cold start still showed 3 reports. My Reports still showed the photos. Report details showed the compressed size (one photo was 155.0 KB originally and 64.9 KB saved).
5. Before the radios were enabled, the API was set to drop the next 2 image uploads. After Wi-Fi returned, all three reports became "Uploaded successfully" (1 of 1, 2 of 2, and 5 of 5 photos). `dropNext` was 0 afterward, so those two drops were consumed and the queue continued.
6. `GET /api/reports/summary` returned `completedReports: 3`, `images: 8`, `largestImageBytes: 98204`, `allImagesWithinLimit: true`. The eight files on disk are JPEGs (`FF D8 FF`) and none is over 5 MB. Report ids are unique and match the client ids.
7. The Server tab showed the same summary and the roof report's five sizes. That screen loads with HTTP. It is empty of local-only rows by construction.
8. Reset was used earlier in the session. The dialog states that server reports stay. After confirming, the local list was cleared and the backend address remained.

A separate 14 MB gallery photo was compressed and saved locally before that reset (the form showed the original as 13.98 MB, and save completed). It was not one of the three reports that were uploaded, because the later reports used other gallery photos and the reset deleted the earlier local copy.

Not observed: a WorkManager upload while the process stayed dead. After force-stop, uploads ran once the app was open again and the network was back.

A later check on the same phone, with Wi-Fi and mobile data disabled, saved one more report (`Functionalcheck2033g`, one photo). Force-stop left it on the device and absent from the server. Diagnostics then armed "Drop next 2 uploads". After the radios were enabled, that report became "Uploaded successfully" and the server had exactly one copy of it. The summary moved from 3 completed reports and 8 photos to 4 and 9. The new file is a JPEG under 5 MB. Reset was opened and cancelled, so local data stayed.

## Known limitations

- Background delivery depends on Android. Doze, battery restrictions, and force-stop can delay or block WorkManager until the app is opened. The foreground queue is the path that was verified.
- iOS is not built or tested.
- The photo pipeline is JPEG-oriented. A file that cannot be decoded, or that stays over 5 MB after the resize steps, is rejected and is not queued.
- There is no login, no server-side delete, and no sync of edits. Reset is local.
- The development server is HTTP on the LAN. Do not expose it beyond a lab network.
- Multer 1.x prints a deprecation warning. It is the version the upload tests passed with.

## If there were another day

- Prove a swipe-away upload with the screen off, and record the WorkManager job in `adb dumpsys jobscheduler`.
- Add a visible per-attempt history so a dropped connection is obvious without reading the server.
- Stream the upload with progress bytes instead of a step counter.
- Run the same scenario on an emulator and on a second physical device.
- Replace Multer 1 with the supported 2.x API.

## Assessment demonstration

Use a device or an emulator, with the API already running.

1. Set the backend address for that device (see the table above). Confirm `GET /api/health`.
2. Turn radios off, or stop the API if the device will not leave Wi-Fi.
3. Create three reports, including one with five photos. Leave the server confirmation text on screen until it says the report is saved on the device.
4. Force-stop the app and open it again. All three reports and their previews should still be there, still not confirmed.
5. Turn radios on. In Diagnostics, choose "Drop next 2 uploads", or POST `dropNext: 2` before the queue runs.
6. Wait through the retries. My Reports should move each one to "Uploaded successfully".
7. Open Server and pull to refresh. Expect three completed reports, every photo visible, and the summary line that all photos are within 5 MB.
8. Confirm on the computer:

```sh
curl http://127.0.0.1:4000/api/reports/summary
```

`completedReports` should be 3 and `allImagesWithinLimit` should be true. Opening the same report id twice must not add a fourth row.
