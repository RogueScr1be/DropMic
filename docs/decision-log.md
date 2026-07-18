# Decision log

## 2026-07-18 — Cloud batch transcription after explicit consent

MicDrop will use cloud batch transcription after explicit user analysis consent rather than requiring on-device transcription for every MVP platform.

### Context

R0A proves local capture and playback only. Audio formats, browser support, device performance, and native model packaging differ across iPhone, Android, iPad, Chromium, and Safari. Transcription is not required to prove the first speaking repetition.

### Alternatives considered

- On-device transcription on every platform.
- Cloud streaming transcription during recording.
- Cloud batch transcription after the recording is complete and the user opts into analysis.

### Tradeoffs

Cloud batch transcription keeps the recording loop small, avoids platform-specific model packaging, and allows cost/retention controls. It introduces upload latency, privacy/consent requirements, provider cost, and a future backend dependency. On-device transcription would improve offline privacy but increases binary size, battery use, model maintenance, and cross-platform parity risk. Streaming is unnecessary for the first analysis slice and creates higher latency and cost complexity.

### Refactor trigger

Revisit this decision if offline transcription becomes a contractual requirement, privacy policy prohibits cloud processing, analysis latency exceeds the product target, or recurring transcription cost exceeds the approved per-recording budget.

## 2026-07-18 — Runtime web recording MIME capability selection

The local recording adapter probes `MediaRecorder.isTypeSupported` and selects the first supported audio MIME type, preferring WebM/Opus and then MP4/AAC. It no longer relies on `audio/webm` being accepted by every browser.

### Context

Expo’s SDK 57 high-quality preset names `audio/webm` for web, while browser MediaRecorder support varies. Safari acceptance was unavailable in this run, so the adapter records only the runtime-selected capability and leaves the actual Safari output unclaimed.

### Alternatives considered

- Keep the preset’s static `audio/webm` value.
- Add Safari-specific UI/platform branches.
- Detect capabilities inside the recording adapter.

### Tradeoffs

Adapter-local capability detection preserves the UI contract and lets Chromium, Safari, and future browsers select their supported container. The actual returned Blob MIME, extension, codec, duration, and size still require platform execution to verify.

### Refactor trigger

Revisit when Expo exposes the actual MediaRecorder MIME/container through its public adapter API or when Safari and Chromium acceptance evidence establishes a single supported format.

## 2026-07-18 — Prioritized iOS and Chromium support; defer Android and Safari

MicDrop’s initial supported development targets are Chromium desktop, iPhone, and iPad. Android and Safari compatibility are deferred until after the local first-use loop is complete.

### Context

Chromium automated recording is green, and the shared iOS adapter can be built for iPhone and iPad. This environment has no physical iPhone and cannot execute Safari automation. A simulator cannot establish microphone hardware, native interruption, codec, or file-integrity acceptance.

### Tradeoffs

Prioritizing Chromium and iOS keeps R0B focused on the local first-use loop while preserving the shared adapter and avoiding platform-specific business logic. The tradeoff is an explicit temporary support limitation and residual Android/Safari compatibility risk.

### Risk

Android may expose permission, media-service, or file-format differences. Safari may select a different MediaRecorder container or MIME type. These risks do not affect local-only R0B development but do affect public release readiness.

### Revisit trigger

Revisit before public beta or App Store release, or earlier if a prioritized-platform change touches the shared recording adapter.

### Removal criteria

Remove the limitation only after focused Android and Safari validation covers permission, recording, automatic stop, playback, interruption, retry, deletion, non-zero file output, actual file properties, and runtime format, with no critical or high security findings.
