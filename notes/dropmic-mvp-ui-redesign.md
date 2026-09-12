# DropMic UI-D0 — MVP experience discovery

Audit date: 2026-09-07
Audit baseline: `438c81ff06b483d87afae033ef43519dbab63814` (`fix: validate Mic Flow timezones against PostgreSQL catalog`)
Scope: architecture and experience audit only. No UI implementation, dependency installation, staging, deployment, or remote mutation is part of UI-D0.

### Accepted UI-D1 baseline (2026-09-09)

UI-D1, UI-D1-R1, and the narrowly authorized UI-D1-R2 correction are accepted as one implementation boundary:

- Solari uses a fixed 5×10 contract in every supported layout: five complete rows, ten tiles per row, and 50 tiles total.
- iPad portrait and iPad landscape are intentional tablet compositions rather than widened phone layouts.
- The primary iPad landscape prompt screen is a single vertical hierarchy with a full-width board inside the bounded tablet canvas. It has no prompt/Flow side rail.
- The primary prompt order is DropMic header, Today’s Drop, New Drop!, full-width Solari board, inline Flow disclosure, and Let’s Go!.
- Flow starts collapsed and expands/collapses inline without navigation or another snapshot request. Loading, unavailable, and `reset_pending` continue to avoid fabricated or stale values.
- Flow presentation only was pulled forward from D3 for UI-D1-R2. Flow authority, completion behavior, Mic Saves, status semantics, and remaining Flow work stay deferred to D3.
- Recorder lifecycle work, including same-object pause/resume, countdown direction, cancellation, deletion ordering, and completion persistence, remains deferred to D2.
- Auth conversion, Settings, completion-screen redesign, confirmations, and all remaining Flow work remain deferred to D3.
- Fraunces/Inter loading, licenses, production icon/splash assets, and final visual polish remain deferred to D4.

## 1. Executive architecture map

The current product is a single Expo Router screen with two modal workflows and one callback route. The root screen owns almost every experience transition, recorder orchestration, prompt choice, completion persistence trigger, Flow coordination, and modal visibility flag.

```text
src/app/_layout.tsx
└── headerless Expo Router Stack
    ├── src/app/index.tsx (AudioProofScreen)
    │   ├── first-use phase state
    │   ├── recording Zustand state
    │   ├── prompt/Solari state
    │   ├── anonymous identity + Flow coordination
    │   ├── local-attempt recovery metadata
    │   ├── SignupFlow modal
    │   ├── QuickReadFlow modal
    │   └── Mic Save non-dismissible modal
    └── src/app/auth/callback.tsx
        └── token callback parsing, session restoration, redirect to /?auth=complete
```

There is no screen-level Settings route or component. Navigation among splash, prompt reveal, duration selection, countdown, recorder, and completion is local React/Zustand state rather than Expo Router navigation. `SignupFlow` and `QuickReadFlow` are transparent bottom-sheet-style `Modal` components rendered above the root screen.

Primary current implementation files and symbols:

| Concern | Exact file | Current component/hook/service |
|---|---|---|
| Root experience and orchestration | `src/app/index.tsx` | `AudioProofScreen`, `TopicReveal`, `DurationSelection`, `CountdownView`, `RecordingView`, `CompletionView`, `MicFlowSavePrompt`, `CompletionMark`, `StatusPanel`, `PromptCard`, `ActionButton` |
| Router shell | `src/app/_layout.tsx` | `RootLayout` / headerless `Stack` |
| Auth callback | `src/app/auth/callback.tsx` | `AuthCallbackRoute` |
| First-use phase helpers | `src/features/first-use/first-use-flow.ts` | `FirstUsePhase`, `phaseForRecordingState`, countdown/time formatters |
| Splash | `src/features/first-use/SplashReveal.tsx` | `SplashReveal` |
| Reduced motion | `src/features/first-use/use-reduced-motion.ts` | `useReducedMotion` |
| Prompt reveal | `src/features/solari/SolariBoard.tsx` | `SolariBoard` |
| Prompt catalog/selection | `src/features/topics/topic-catalog.ts` | `TOPIC_CATALOG`, `selectTopic`, `selectNextTopic` |
| Recorder state | `src/features/recording/recording-machine.ts` | pure `transition`, `deriveElapsedMs`, duration/state/event contracts |
| Recorder store | `src/features/recording/recording-store.ts` | `useRecordingStore` |
| Audio object lifecycle | `src/features/recording/use-local-audio-recorder.ts` | `useLocalAudioRecorder` |
| Anonymous and permanent auth | `src/features/auth/auth-client.ts` | persistent Supabase client |
| Auth operations | `src/features/auth/auth-service.ts` | anonymous session, email conversion/sign-in, onboarding, claim, sign-out/delete |
| Auth modal state | `src/features/auth/auth-flow-store.ts` | `useAuthFlowStore` |
| Auth/attempt recovery | `src/features/auth/auth-recovery.ts` | pending auth and unclaimed attempt metadata in AsyncStorage |
| Visible account workflow | `src/features/auth/SignupFlow.tsx` | `SignupFlow` |
| Callback parser | `src/features/auth/auth-callback.ts` | `parseAuthCallbackUrl`, callback result contract |
| Flow read/write client | `src/features/mic-flow/mic-flow-service.ts` | anonymous identity capture, completion RPC, snapshot coordinator |
| Flow rendering | `src/features/mic-flow/MicFlowCard.tsx` | `MicFlowCard` |
| Flow copy mapping | `src/features/mic-flow/mic-flow-presentation.ts` | `presentationForStatus`, `formatFlowCount` |
| Quick Read UI | `src/features/quick-read/QuickReadFlow.tsx` | consent, processing, result, error, Take Two |
| Quick Read orchestration | `src/features/quick-read/quick-read-service.ts` | attempt request, upload, Edge invocation, result validation |
| App identity/assets | `app.json`, `assets/expo.icon/**`, `assets/images/**` | app names, orientation, icon/splash/favicon paths |

Architectural conclusion: preserve the proven service modules and pure state-machine approach, but reduce `src/app/index.tsx` to an experience coordinator. Reusable visual primitives should move to `src/ui/`; feature state and destructive operations should remain in their feature directories. Do not rename historical database modes, RPCs, table columns, storage keys, or internal `mic_flow` identifiers merely to change customer-facing copy.

## 2. Current navigation, first-run, age gate, and prompt flow

Current navigation state machine:

```text
mount
  -> splash (900 ms animated reveal; immediate completion under Reduce Motion)
  -> topic_reveal
       Solari animates each character at a 90 ms stagger
       onComplete automatically sets duration_selection
  -> duration_selection
  -> requesting_permission -> ready -> countdown (1.8 s)
  -> recording
  -> processing
  -> completion

recording/countdown override local first-use phase through phaseForRecordingState()
interrupted/error override both and render StatusPanel
SignupFlow, QuickReadFlow, and Mic Save are modal overlays, not routes
```

There is no persisted “first run complete” flag. Every fresh mount begins at `splash`. The age gate is not a first-run gate: it is a checkbox in `SignupFlow` after a recording and after the user selects Quick Read. It is also required again by `saveOnboarding`, alongside a goal and blocker selection. This is the opposite of the locked direction that the age gate is visible only before the first recording.

The initial prompt is selected from a static six-item local catalog; there is no generated content, network request, or model call. `selectTopic(seed, previousTopicId)` is deterministic for a supplied numeric seed, normalizes it to a catalog index, and advances one index if that entry equals the immediately previous ID. The UI seeds it with `Date.now()`, so a session is not replay-deterministic, and only the immediately prior prompt is excluded. No selection/history is persisted. The selected prompt is held in `AudioProofScreen` state and is used by duration, recorder, completion, unclaimed attempt metadata, Flow completion, and Quick Read.

`chooseNewTopic()` calls `selectNextTopic(topic.id, Date.now() + revealKey + 1)`, increments `revealKey`, and returns to `topic_reveal`. Today the Solari completion callback automatically advances to duration selection. Prompt length therefore controls the delay; at 90 ms per character plus the final animation, longer prompts approach or exceed five seconds.

Target first-run/navigation model for UI-D1:

```text
unknown first-run state
  -> load local age-gate receipt
  -> age_gate (only when no valid receipt)
       accept -> persist versioned local receipt -> prompt
  -> prompt (Today’s Drop)
       New Drop -> select different local prompt -> replay Solari, remain on prompt
       Let’s Go -> selected_drop
  -> selected_drop
       Back -> prompt, preserving selection
       choose 30/60/90 -> update recorder context
       Let’s Go -> invisible anonymous-session preflight, permission, countdown
  -> recorder -> completion
```

The prompt screen must not auto-navigate when Solari completes. `onComplete` should mark reveal readiness only. The prompt itself must remain the primary screen and selection must survive Back, recorder preparation, modal entry, and completion. “New Drop” must retain the existing deterministic immediate no-repeat rule and should use a monotonically changing local seed; no server query or AI generation is needed.

Age acceptance should use a versioned AsyncStorage record such as `{ version: 1, confirmedAt }`. It should not create a visible login, profile write, or provider call. When a permanent account is later created, the existing profile age timestamp can be populated from the accepted gate without showing the gate again.

## 3. Current and target recorder state machines

Current pure recorder states are:

```text
idle
  -> requesting_permission
      -> permission_denied -> requesting_permission
      -> ready
ready
  -> countdown
      -> ready                    (Cancel)
      -> recording                (countdown complete)
recording
  -> processing                   (Stop or automatic duration limit)
  -> interrupted                  (app/background/media interruption)
  -> error
processing
  -> completed                    (URI returned)
  -> error
completed
  -> ready                        (Retry)
  -> idle                         (Delete recording)
  -> error                        (playback failure currently poisons recorder state)
interrupted/error
  -> ready                        (Retry)
```

Current timing is timestamp-derived from one `startedAtMs`. It counts upward from `00:00` and clamps at the selected 30/60/90-second duration. A 100 ms interval updates `nowMs`; reaching the selected maximum calls the same finalizing `stopRecording()` used by the Stop button. There is no pause state, no accumulated active-time field, and no cancellation state during an active recording.

Required UI-D2 recorder state machine:

```text
idle
  -> requesting_permission -> preparing -> countdown -> recording

recording
  -> paused                       (Stop: recorder.pause(); timer freezes)
  -> completing                   (remaining active time reaches zero)
  -> failed                       (recorder/interruption failure)

paused
  -> recording                    (Resume: same recorder.record())
  -> cancelling                   (hold Cancel begins)
  -> failed

cancelling
  -> paused                       (release before 1,500 ms; cancel only the gesture)
  -> idle/selected_drop           (threshold reached; stop/finalize, delete file, clear transient attempt)
  -> failed                       (deletion cannot be verified; do not persist completion)

completing
  -> completed                    (one local URI finalized and recovery metadata persisted)
  -> failed

completed
  -> selected_drop                (Retry Recording; delete old file first)
  -> prompt                       (confirmed Delete Recording; delete old file first)

failed
  -> prior safe state or selected_drop after explicit retry
```

Permission and countdown are preflight states; the canonical recording lifecycle is `idle → recording ↔ paused → cancelling/completing → completed/failed`. Add `pausedAtMs`, `accumulatedActiveMs`, and/or consume recorder `durationMillis`; never use wall time across a pause. The visible timer is `selectedDurationMs - activeRecordedMs`, counts down, freezes while paused/cancelling, and automatically enters `completing` at zero. Stop must pause rather than finalize. Resume must call `record()` on the same prepared recorder object.

Cancellation is destructive only after the 1.5-second threshold. Releasing early returns to `paused` and must not stop, delete, reset, or persist anything. Once the threshold is reached, finalize the recorder only as needed to obtain a deletable URI, delete/revoke it, clear transient identity and metadata, and then leave the recorder workflow. No Flow completion, unclaimed attempt, attempt row, Storage upload, or Quick Read request may occur on cancellation.

Playback errors should become playback-local UI errors rather than transition a valid completed recording to the recorder-wide `error` state.

## 4. Audio object lifecycle and pause/resume feasibility

`useLocalAudioRecorder()` creates one hook-managed `AudioRecorder` with `RecordingPresets.HIGH_QUALITY`, overrides native storage to the app document directory, and selects a supported web MIME type. Its current public surface is permission, `prepare`, `start`, `stop`, `play`, and `deleteRecording`.

Current lifecycle:

1. Permission is read on mount.
2. `prepare()` enables recording mode and prepares the recorder.
3. `start()` calls `recorder.record()`.
4. Stop or automatic duration calls `recorder.stop()` and reads `recorder.uri`.
5. Playback reuses one hook-managed player, replaces its source only when the URI changes, seeks to zero, and plays.
6. Native deletion calls `new File(uri).delete()`; web deletion revokes the blob URL.
7. App/background interruption calls stop, then deletes the returned URI, then renders a retryable interruption.
8. Retry and Delete delete the completed URI before clearing state. `beginTakeTwo` also deletes the previous URI, but currently does so fire-and-forget and suppresses deletion errors.

Pause/resume is feasible without audio concatenation in Expo SDK 57:

- The pinned `expo-audio` API exposes `AudioRecorder.pause()` and `AudioRecorder.record()`.
- Web calls `MediaRecorder.pause()` and, when `record()` sees the same recorder in `paused`, calls `MediaRecorder.resume()`.
- Android calls native recorder `pause()` and `resume()` on the same recorder instance.
- iOS calls `AVAudioRecorder.pause()` and then `record()` on the same prepared/paused instance while tracking accumulated duration.

Therefore the architecture supports one recorder object and one final URI; no segment files or concatenation layer is required. The current app does not safely support pause/resume because neither the wrapper nor state machine exposes those transitions. UI-D2 must add `pause()` and `resume()` methods, in-flight guards, paused duration accounting, and interruption behavior for both recording and paused states.

The implementation gate is a native proof on physical iPhone and iPad (plus web): record audible A, pause, wait, resume with audible B, finalize, verify one URI, verify A and B are present in order, verify pause silence is not counted by the app timer, and verify no second file or concatenation operation exists. Expo SDK 57 documentation reference: <https://docs.expo.dev/versions/v57.0.0/sdk/audio/>.

## 5. Completion persistence ordering and deletion guarantees

Current completion ordering is effect-driven and partially parallel:

```text
recorder.stop()
  -> URI returned
  -> RECORDING_READY
  -> recording state becomes completed
  -> currentAttempt memo becomes non-null
      ├── submitMicFlowCompletion(null) begins asynchronously
      └── saveUnclaimedAttempt(currentAttempt) begins asynchronously
```

The local recovery record contains metadata only and explicitly stores `audioRetained: false`; it never stores the local URI. Flow completion and AsyncStorage recovery are not ordered relative to each other. The server-authoritative Flow RPC can succeed even if local recovery metadata fails. The completion screen can render before either operation finishes. Quick Read later claims the attempt only after permanent auth; explicit consent then requests a run, uploads audio to private Storage, and invokes the Edge function/provider.

Required ordering in UI-D2/D3:

1. At timer zero, enter `completing` and reject duplicate actions.
2. Stop/finalize the same recorder object once.
3. Verify a non-empty local URI and final active duration.
4. Persist unclaimed attempt metadata locally and verify the write can be read back. Never persist the URI.
5. Transition to `completed` and render `Drop Secured!` with playback available.
6. Submit the idempotent Flow completion using the identity captured at recording start. Flow status may settle asynchronously on the completion screen.
7. Only after the user explicitly requests Quick Read, require/complete permanent-account conversion, claim the attempt idempotently, show retention consent, then request/upload/invoke.

If step 4 fails, keep the local audio, enter a recoverable `failed` state, and do not credit Flow yet. If the Flow call fails after local persistence, keep completion/playback valid and expose only the existing retry-safe Flow status. A Mic Save decision remains a non-dismissible modal and is never bypassed by Quick Read or navigation.

Deletion guarantees:

- Active cancellation: stop only to finalize if required, delete/revoke URI, clear transient attempt and completion identity, then navigate. No persistence.
- Retry Recording: await deletion of the prior URI before rotating take identity and returning to selected Drop.
- Delete Recording: require confirmation; await deletion before clearing completion metadata and UI. If deletion fails, preserve the completion screen and show a retryable error.
- Take Two: await prior deletion or make the retained-file policy explicit; do not silently suppress deletion failure.
- Account deletion remains separate from recording deletion and retains its existing confirmation.

## 6. Anonymous session and visible account conversion

Current anonymous ownership is established invisibly inside `beginRecording()`, before microphone permission/countdown. `establishAnonymousMicFlowSession()` reuses a persistent session or calls `signInAnonymously()` with a bounded wait, then captures `{ userId, accessToken }`. Flow completion uses that captured identity so a later auth transition cannot silently write under another owner. This placement satisfies “no visible login before the first Drop” and should remain.

Visible conversion occurs only after completion when Quick Read is selected. Current capabilities:

- Email conversion of the current anonymous user: `auth.updateUser({ email })`, followed by `email_change` OTP. This preserves the anonymous UUID when successful.
- Existing-account email sign-in: `signInWithOtp({ shouldCreateUser: false })`, followed by email OTP. This changes to the existing account UUID.
- Google conversion: not implemented. There is no Google button, OAuth/link call, provider configuration, or OAuth callback-code exchange path.
- Post-auth onboarding: age checkbox, at least one goal, and at least one blocker are mandatory before the attempt is claimed and Quick Read opens.

Target sequence:

```text
first age acceptance (local, no login)
  -> first recording begins
  -> invisible anonymous Supabase session; capture owner UUID
  -> local completion + Flow under captured UUID
  -> user taps Quick Read
  -> visible conversion sheet (email or Google)
       email: update current anonymous user -> OTP -> same UUID
       Google: link identity to current signed-in anonymous user -> callback -> same UUID
  -> assert post-conversion UUID equals captured anonymous UUID
  -> copy age receipt to profile if needed
  -> claim local attempt idempotently
  -> Quick Read consent
  -> explicit upload/provider execution
```

The age gate must be removed from `SignupFlow`. Goal/blocker onboarding must not block delivery of the value that triggered conversion; it can be moved to Settings or a later optional personalization step. This does not alter the existing profile/preferences schema.

Auth implications of login after the first recording:

- Converting the current anonymous identity by email preserves Flow ownership, attempt continuity, and RevenueCat user binding.
- Linking Google to the current authenticated anonymous user can preserve UUID, but requires manual identity linking/provider configuration and a callback that validates the original UUID.
- Signing into a pre-existing account replaces the UUID. The anonymous Flow completion remains owned by the old UUID, while local attempt metadata could be claimed by the new UUID. The current auth-state handler intentionally invalidates the captured Flow identity and marks it unprotected. This is safe but does not satisfy the locked continuity requirement.
- Pending email auth stores the anonymous UUID, but current verification does not assert that the returned UUID matches it. UI-D3 must add this invariant before claim or Quick Read.
- Callback parsing currently accepts access/refresh tokens. Google PKCE/code callbacks would require `exchangeCodeForSession` handling and state/intent validation rather than treating an empty token callback as complete.

## 7. Flow card behavior and state mapping

As accepted in UI-D1-R2, `MicFlowCard` is reusable and has local presentation-only disclosure state. It starts collapsed, expands/collapses inline, and renders within the primary prompt hierarchy between the Solari board and Let’s Go!. Loading and unavailable remain explicit variants, and unavailable never fabricates zero values. `reset_pending` continues to hide stale current Flow while retaining authoritative expanded details.

The service contract is already suitable and should not change. It exposes one server-derived snapshot with `status`, `current_flow`, `best_flow`, `saves_available`, `last_qualified_day`, and `timezone`. The snapshot coordinator deduplicates in-flight reads and drops stale owner responses. Expansion must not trigger another database request.

Accepted disclosure behavior and remaining D3 work:

- The accepted customer label remains `MIC FLOW`; any later copy change is D3 presentation work. Internal files/types/RPCs retain `mic-flow` and `mic_flow`.
- The collapsed card shows the authoritative current Flow when status permits, or a truthful status summary when it does not.
- Expanded inline content reveals Best, Saves, and the full status explanation without opening a modal or leaving the prompt.
- The disclosure uses a button role, explicit label/hint, native and web expanded state, and a minimum 44-point target.
- Loading and unavailable use polite status treatment; unavailable does not expose stale current Flow or fabricated counts.
- `reset_pending` continues to hide current Flow while retaining Best and Saves.
- Mic Save decision remains a separate, non-dismissible blocking modal after completion.
- Expansion state is local presentation state; snapshot state remains server authority.
- Expansion/collapse issues no request and survives responsive orientation changes while the screen remains mounted.

## 8. Completion, Quick Read, Settings, and destructive actions

Current completion renders an animated dark-green check, “That’s a take.”, captured duration plus selected setting, a hidden completion timestamp, Flow persistence status, the prompt, Play recording, Get a Quick Read, Retry recording, and Delete recording. Playback is primary, Quick Read secondary, and deletion has no confirmation.

Target completion:

- Soft-green circle enters from the right and the check appears after it; under Reduce Motion use an opacity transition only.
- Heading: `Drop Secured!`.
- Show one human duration value and the prompt. Remove captured-setting syntax, timestamp, URI/technical reassurance, and implementation status copy.
- Primary: `Quick Read` (never automatic).
- Secondary: playback.
- Short tertiary actions: `Retry Recording` and `Delete Recording`.
- Delete opens an accessible confirmation dialog; destructive confirmation is visually and semantically distinct and focus returns correctly on cancel.

Current Quick Read gate is correct in principle: anonymous/no session opens account setup, permanent session claims the attempt and opens consent, and provider execution happens only after the explicit upload action. Current account modal is titled `QUICK READ SETUP`; Quick Read consent contains `What happens next`. Both phrases must be removed. The retention facts and explicit upload/AI-processing consent must remain.

The target account/Quick Read flow should use one centered/responsive sheet primitive with a single reserved header row. The title is `Quick Read`; Close occupies the trailing header slot. The root AppHeader/Settings control must be hidden from modal accessibility and pointer focus while a modal is open, preventing the current/future Close-versus-Settings collision. On iPad, the sheet is centered with a bounded width rather than stretched edge-to-edge.

There is no Settings UI today. Add `SettingsSheet` in UI-D3 for account state/actions and deferred personalization, using the same sheet header contract. It must never share the same visual layer/header row as a child modal. Only one of Settings, account conversion, Quick Read, Delete confirmation, or Mic Save can be active at a time; Mic Save has priority and cannot be dismissed.

## 9. User-facing string inventory

The search covered runtime source, tests, app configuration, migrations/docs for context, and exact/case-insensitive variants. Historical/internal identifiers should remain where contract-sensitive; runtime customer copy should change.

| Requested string | Current result | Exact runtime locations / action |
|---|---|---|
| `MicDrop` | Present | `app.json` name/slug/mic permission; `SplashReveal.tsx`; `SignupFlow.tsx`; `src/app/auth/callback.tsx`. Change visible/app display copy to DropMic; preserve scheme, bundle ID, storage keys, and historical identifiers unless separately migrated. |
| `DropMic` | No runtime UI occurrence | Present only in product/decision notes. Add as customer-facing brand. |
| `Mic Flow` | Present broadly | `src/app/index.tsx`, `MicFlowCard.tsx`, `mic-flow-presentation.ts`, their tests. Replace visible copy/accessibility labels with Flow; preserve internal feature paths, types, modes, RPCs, SQL, and historical notes. |
| `ROB Local Take` | Exact literal absent | Near match is `R0B / LOCAL TAKE` in `src/app/index.tsx`. Remove. |
| `Today’s Speaking Prompt` | Present uppercase | `src/app/index.tsx` (`TODAY’S SPEAKING PROMPT`). Replace with `Today’s Drop`. |
| `Story / Your Take` | Dynamically present | `src/app/index.tsx` composes `${topicCategory.toUpperCase()} / YOUR TAKE`; the Story catalog entry produces this phrase. Remove category/Your Take eyebrow. |
| `You’re Live` | Present in combined phrase | `src/app/index.tsx` (`YOU’RE LIVE / LOCAL ONLY`). Remove; retain only pulse red dot with accessible recording status. |
| `Local Only` | Present in combined phrase and technical reassurance | `src/app/index.tsx`; related local-only copy in auth/completion flows. Remove from primary experience while preserving legally/operationally required consent facts at Quick Read. |
| `That’s a Take` | Present with sentence case/punctuation | `src/app/index.tsx` (`That’s a take.`), `e2e/audio-proof.spec.ts`. Replace with `Drop Secured!`. |
| `Quick Read Setup` | Present uppercase | `src/features/auth/SignupFlow.tsx`. Rename to `Quick Read`. |
| `What happens next` | Present | `src/features/quick-read/QuickReadFlow.tsx`. Remove heading; retain concise consent/retention facts. |
| `Get a Quick Read` | Present | `src/app/index.tsx`, `e2e/audio-proof.spec.ts`, historical notes. Runtime CTA becomes `Quick Read`. |
| `Retry Recording` | Present as `Retry recording` | `src/app/index.tsx`, `e2e/audio-proof.spec.ts`. Normalize requested casing/copy. |
| `Delete Recording` | Present as `Delete recording` | `src/app/index.tsx`, `e2e/audio-proof.spec.ts`. Normalize and add confirmation. |

Additional visible technical strings to remove or rewrite include `R0B`, `SET THE CLOCK`, `No upload. No analysis. Just one local speaking rep.`, captured-setting metadata, completion timestamp, `LOCAL RECOVERY`, and “Protecting your Mic Flow…” implementation-status language. Quick Read consent must still state upload, processing, successful cloud-audio deletion, transcript retention up to 30 days, and daily quota.

## 10. Reusable components versus screen-specific changes

Reusable primitives to add under `src/ui/`:

- `theme.ts`: semantic colors, type roles, spacing, radii, shadows, and motion durations.
- `responsive.ts`: named phone/tablet breakpoints and orientation/layout helpers derived from width and height.
- `AppShell.tsx`: SafeArea + ScrollView/content-grid rules, including modal accessibility hiding.
- `AppHeader.tsx`: DropMic wordmark, Settings action, and optional accessible Back slot.
- `ActionButton.tsx`: primary/secondary/tertiary/destructive variants, compact mode, busy/disabled semantics.
- `PromptCard.tsx`: prompt typography and accessible label.
- `DurationPicker.tsx`: reusable 30/60/90 radiogroup.
- `Sheet.tsx`: one modal surface/header/focus contract used by Settings, conversion, and Quick Read.
- `ConfirmDialog.tsx`: reusable destructive confirmation contract.

Reusable feature components:

- Rename only the exported customer component to `FlowCard` if useful, while retaining file/service/internal Mic Flow identifiers; add inline expansion.
- `SolariBoard` remains the prompt-specific reveal component, but completion no longer navigates.
- `CompletionMark` should move out of the root screen and accept reduced-motion behavior.
- `HoldToCancel` is recorder-specific but reusable within recorder layouts and tests.

Screen-specific composition that should remain feature-owned:

- Age-gate content and receipt handling: first-use feature.
- Prompt and selected-Drop compositions: root experience/first-use feature.
- Recorder pause/cancel/completion transitions: recording feature.
- Flow snapshot and Mic Save decisions: Flow feature.
- Account conversion: auth feature.
- Consent/result/Take Two: Quick Read feature.
- Settings account/personalization composition: settings feature; it consumes shared Sheet and buttons.

Do not build a generic workflow engine, navigation abstraction, animation framework, or form library. The pure recorder transition function and existing focused services are sufficient.

## 11. Responsive layouts

At the UI-D0 baseline, responsiveness was one `width >= 700` check and native orientation was portrait-only. Accepted UI-D1 now derives phone/tablet and portrait/landscape behavior from usable width, height, safe-area insets, and font scale; `app.json` permits intentional portrait and landscape layouts. Remaining recorder, completion, modal, and Settings responsiveness is deferred with those features.

Proposed primitives:

```text
compact phone:   min(width, height) < 600
tablet portrait: min(width, height) >= 600 and height >= width
tablet landscape:min(width, height) >= 600 and width > height
phone landscape: min(width, height) < 600 and width > height
```

Use both width and height, safe-area insets, content-size category, and keyboard state. `app.json` orientation must permit landscape. Avoid device-name checks.

### iPhone portrait

- Single column, 16–20 point side gutters, maximum readable prompt width, and bottom CTA inside safe-area padding.
- Header is one 44-point row: DropMic left, Settings right; selected Drop adds Back without displacing either accessible target.
- Prompt is dominant above Flow. Flow is compact/collapsed by default.
- Duration choices remain one three-column row when Dynamic Type fits; otherwise wrap into a vertical/radio list.
- Recorder centers the countdown timer and prompt; paused controls stack vertically. No fixed `minHeight` that forces content below the fold.
- Completion actions stack primary/secondary, with Retry/Delete in a compact row only when labels fit.

### iPhone landscape

- Two compact columns: prompt/context on the left, duration/recorder/actions on the right.
- Header and safe areas consume notch/home-indicator insets; scrolling remains available.
- Flow collapses to one line/card at the bottom of the prompt column.
- Modals use near-full viewport with internal scrolling and keyboard avoidance.

### iPad portrait

- Intentional bounded tablet canvas, not a widened phone stack.
- The primary prompt screen uses the accepted vertical hierarchy: heading, New Drop!, full-width 5×10 board, inline Flow disclosure, and Let’s Go!.
- Selected Drop uses prompt on the left and duration + CTA in a right control rail.
- Recorder uses a large central timer with prompt and controls in a bounded secondary region.
- Sheets are centered cards around 560–640 points with bounded height and dimmed backdrop.

### iPad landscape

- The primary prompt screen remains one full-width vertical composition inside the bounded tablet canvas; there is no secondary right column.
- The 5×10 Solari board is the dominant region and spans nearly the full available canvas width. Flow remains a compact inline disclosure beneath it, followed by Let’s Go!.
- Later selected-Drop, recorder, and completion layouts may use intentional tablet regions only where their phase specifications authorize them.
- Completion keeps Drop Secured/prompt/playback on the main panel and Quick Read/actions/Flow in the side panel.
- Settings, conversion, confirmation, and Quick Read are centered modal cards; never bottom sheets stretched across the full landscape width.

Every phase must validate iPhone portrait/landscape and iPad portrait/landscape together. Desktop web remains supported but must not dictate tablet composition.

## 12. Typography, colors, icon pipeline, spacing, and motion

Current typography has no font-loading code and no `.ttf`/`.otf` assets. `expo-font` is installed but unused. Headings, Solari cells, timers, and values specify the platform `Georgia` family. Body text uses the default system sans; Inter is neither bundled nor loaded. The repository `LICENSE` is Expo’s MIT license and does not license Recoleta or any font asset.

Recoleta Bold may be used only if a licensed local font file and its distribution terms are supplied. They are not present. The closest proposed legally redistributable alternative is Fraunces Bold/Black for display headings, paired with Inter for body/UI; both are available under SIL OFL 1.1. Bundle exact local font files and their OFL texts rather than depending on network loading. Inter license reference: <https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt>. Fraunces source/license reference: <https://github.com/undercasetype/Fraunces>.

Proposed semantic palette, sampled from the locked direction rather than preserving the current green/orange theme:

| Token | Proposed value/use |
|---|---|
| `ink` | `#102A43` dark app-icon blue; headings, primary controls |
| `inkStrong` | `#081F33`; recording timer/high contrast |
| `cream` | `#FFF7E8`; app background |
| `surface` | `#FFFCF5`; cards/sheets |
| `coral` | `#F47C6B`; primary accent and New Drop |
| `coralDark` | `#B94E43`; accessible text/destructive emphasis as contrast permits |
| `greenSoft` | `#BFE3C0`; completion mark |
| `greenInk` | `#205C3B`; success text/check |
| `muted` | `#5D7083`; secondary text |
| `border` | `#DDD4C5`; borders/dividers |
| `danger` | `#A73535`; destructive action/error |

All final combinations require automated contrast checks; do not use soft coral for small text on cream unless the measured ratio passes.

Use a 4-point spacing base with semantic steps 4/8/12/16/20/24/32/40/48/64, 12–20 point radii, and minimum 44×44 interactive targets. Keep line length near 45–70 characters and scale type with Dynamic Type rather than hard-coded clipping.

Current icon pipeline is inconsistent and still Expo-template artwork:

- generic `assets/images/icon.png`: 1024×1024 blue Expo “A” template;
- iOS `assets/expo.icon/icon.json`: Icon Composer package with a white Expo symbol SVG over a 1024×1024 grid and blue automatic gradient;
- Android adaptive assets: 512×512 background/foreground, 432×432 monochrome, Expo template symbol;
- favicon: 48×48;
- splash icon: 228×213 Expo template symbol on `#208AEF`.

No 2048×2048 supplied DropMic source exists in the repository. UI-D4 must start from that source, preserve a master asset, derive iOS Icon Composer layers and Android safe-zone/monochrome assets, then generate favicon and splash derivatives. Do not upscale the current 1024 template or treat `grid.png` as the source. Visual checks are required at 16/20/29/40/60/76/83.5/1024-point contexts and in iOS dark/tinted and Android adaptive masks.

Motion tokens should be sparse: Solari character reveal, completion mark, sheet entry, and hold progress. Avoid continuous decorative motion. Sound remains user-controlled and cannot be required to understand state.

## 13. Reduced motion and accessibility

`useReducedMotion()` correctly reads `AccessibilityInfo.isReduceMotionEnabled()` and subscribes to changes. It is currently passed to Splash, Solari, countdown styling, and completion mark. Splash and Solari complete immediately under Reduce Motion. Completion still renders a scale transform set directly to 1 rather than the required opacity-only entrance. Modal `animationType="slide"` is not conditioned on Reduce Motion.

Required behavior:

- Solari: render final characters immediately or use a brief crossfade; never gate navigation because navigation is manual.
- Completion: opacity only under Reduce Motion; no translation/scale.
- Sheets: use `animationType="none"` or an opacity-only implementation under Reduce Motion.
- Hold-to-cancel progress: display static textual progress/status and provide an accessibility action that does not require precision holding. A destructive confirmation remains required for assistive activation.
- Pulse dot: use a static red dot under Reduce Motion and announce `Recording` once, not every timer tick.
- Timer: do not announce every 100 ms/second. Announce meaningful thresholds (for example 10 seconds and completion) or expose the current value on focus.
- Back, Settings, Flow expansion, durations, Stop/Resume, cancel, playback, Quick Read, Retry, and Delete require explicit roles/states and 44-point targets.
- Selected duration remains a radiogroup with selected/disabled state.
- Modal focus is trapped/restored; background content is hidden from the accessibility tree while open.
- Delete confirmation names the recording effect. Mic Save modal clearly explains that a choice is required and cannot be dismissed.
- Dynamic Type must not clip the prompt, timer, buttons, modal headers, or 30/60/90 labels. Layout must reflow rather than shrink below readable sizes.
- Contrast, color-independent status, VoiceOver/TalkBack order, hardware keyboard focus, and switch-control access are acceptance requirements.

## 14. UI-D1 — Brand shell, first-run gate, prompt, and selected Drop

Objective: establish the responsive DropMic shell and correct pre-recording journey without altering recorder semantics, auth backend, Flow RPCs, or Quick Read provider behavior.

Accepted implementation record: UI-D1 plus R1 establishes the persisted age gate, manual prompt navigation, selected duration hierarchy, responsive shell, intentional iPhone/iPad orientations, and fixed 5×10 Solari board. The narrow R2 exception moves only the inline collapsed/expanded `MicFlowCard` presentation and its tests forward from D3; it does not move Flow services, status authority, Mic Save behavior, auth, recorder, or completion work.

Exact file boundary:

Modify:

- `app.json` — customer display name/microphone copy and unlock supported orientations; do not change scheme or bundle ID.
- `src/app/index.tsx` — adopt shell/header, add age-gate/prompt/selected-Drop compositions, remove auto-navigation, preserve current recorder handoff.
- `src/features/first-use/first-use-flow.ts` — explicit age-gate/prompt/selected phase contract.
- `src/features/first-use/SplashReveal.tsx` — DropMic branding; first-run-only behavior.
- `src/features/solari/SolariBoard.tsx` — reveal-ready callback without navigation and responsive cells.
- `src/features/topics/topic-catalog.ts` — retain deterministic immediate no-repeat contract; expose a testable next-seed helper only if needed.
- `src/features/first-use/first-use-flow.test.ts`
- `src/features/solari/SolariBoard.test.ts`
- `src/features/topics/topic-catalog.test.ts`
- `e2e/responsive.spec.ts`
- `e2e/audio-proof.spec.ts` — update only pre-recording selectors/copy while preserving the existing audio proof.

Add:

- `src/ui/theme.ts`
- `src/ui/responsive.ts`
- `src/ui/AppShell.tsx`
- `src/ui/AppHeader.tsx`
- `src/ui/ActionButton.tsx`
- `src/ui/PromptCard.tsx`
- `src/ui/DurationPicker.tsx`
- `src/features/first-use/AgeGate.tsx`
- `src/features/first-use/first-run-storage.ts`
- `src/features/first-use/first-run-storage.test.ts`
- `src/ui/responsive.test.ts`

Do not touch in D1: auth service/callbacks, recorder machine/hook, Flow service/RPCs, Quick Read service/Edge function, Supabase migrations, billing, icon binary assets, or fonts.

Accepted R2 additions to the D1 file boundary are `src/features/mic-flow/MicFlowCard.tsx` and `src/features/mic-flow/mic-flow-card.test.ts`, plus composition and responsive assertions in the already authorized `src/app/index.tsx` and `e2e/responsive.spec.ts`.

Required tests/gates:

- Age gate appears before the first recording, persists a versioned local receipt, and does not reappear on remount.
- No auth/provider/storage/Flow completion calls occur on age acceptance or prompt browsing.
- Initial prompt and New Drop are local and deterministic for a supplied seed; New Drop never immediately repeats.
- Solari completion never changes screen; Let’s Go and Back preserve selected prompt.
- 30/60/90 semantics remain unchanged.
- String assertions for DropMic, Today’s Drop, removal of R0B/Local Take/Today’s Speaking Prompt/Your Take/Set the clock technical copy.
- Browser responsive acceptance at iPhone 390×844 and 844×390, iPad 834×1194 and 1194×834, plus desktop smoke; no overflow and intentional column assertions.
- iOS simulator screenshots for iPhone and iPad in both orientations; VoiceOver order and Dynamic Type smoke.
- Existing typecheck, lint, full Jest, independent responsive Playwright, independent audio Playwright, auth callback Playwright, and web export.

Rollback boundary: one D1 commit. Revert that commit to restore the old shell/phase flow. The local first-run key is additive and harmless if left behind, but the rollback should ignore unknown future versions.

## 15. UI-D2 — Recorder pause/resume, countdown timer, cancellation, and completion transaction

Objective: replace finalize-on-Stop with same-object pause/resume, count down active recorded time, add hold cancellation, and make local completion/deletion ordering deterministic. Do not alter Flow SQL or Quick Read provider behavior.

Status after UI-D2 implementation: implemented as an uncommitted local change pending acceptance. Stop now pauses, Resume continues the same Expo recorder/file, countdown displays remaining active time, and completion is not exposed until local recovery metadata is saved and read back. No Flow SQL, Quick Read provider, auth conversion, billing, icon, or font work moved into D2.

Exact file boundary:

Modify:

- `src/app/index.tsx` — delegate recorder orchestration to the revised state contract and render new controls.
- `src/features/recording/recording-machine.ts` — add paused/cancelling/completing/error transitions and accumulated active duration.
- `src/features/recording/recording-store.ts` — expose the revised context/events without side effects.
- `src/features/recording/use-local-audio-recorder.ts` — add guarded `pause`, `resume`, finalization, and verified deletion on one recorder object.
- `src/features/first-use/first-use-flow.ts` — phase mapping only.
- `src/features/auth/auth-recovery.ts` — add save-and-readback verification for local completion metadata.
- `src/features/recording/recording-machine.test.ts`
- `src/features/first-use/first-use-flow.test.ts`
- `src/features/auth/auth-recovery.test.ts`
- `e2e/audio-proof.spec.ts`
- `e2e/responsive.spec.ts`
- `docs/failure-log.md`
- `docs/decision-log.md`
- `notes/dropmic-mvp-ui-redesign.md`

Add:

- `src/features/recording/HoldToCancel.tsx`
- `src/features/recording/HoldToCancel.test.tsx`
- `src/features/recording/use-local-audio-recorder.test.tsx`

Do not touch in D2: auth conversion, Quick Read service/Edge function, Flow service/SQL, billing, icon/font assets.

Required tests/gates:

- Pure transition coverage for `recording → paused → recording`, early-release cancellation, threshold cancellation, auto-completion, stale/duplicate events, interruption in recording and paused states, and failure recovery.
- Timer starts at 30/60/90, counts down active recording time only, freezes when paused, resumes without drift, and automatically completes exactly once at zero.
- Stop calls pause and never produces a completion; Resume uses the same recorder identity.
- Hold under 1.5 seconds cancels only the cancellation gesture. Threshold hold creates no completion/attempt/Flow write and deletes/revokes the temporary audio.
- Completion writes recovery metadata before Flow submission; simulated local persistence failure prevents Flow credit and keeps audio recoverable.
- Delete failure preserves state; retry waits for deletion; no swallowed Take Two deletion errors.
- Web E2E verifies one blob URI across pause/resume, playable non-empty audio, automatic completion, cancel cleanup, and confirmation-independent recorder safety.
- Physical iPhone and iPad audible A/pause/B proof, interruption proof, document-file count before/after cancel/delete, and 30/60/90 auto-stop checks. Simulator UI checks do not replace physical microphone proof.
- Reduced Motion and VoiceOver hold-cancel alternative.
- Full baseline validation suite from D1.

Implementation caveat: the repository's current Jest config matches `src/**/*.test.ts`, so the new authorized `.test.tsx` recorder component/hook tests require an explicit `--testMatch '**/*.test.tsx'` invocation unless a later authorized config change expands the default matcher.

Rollback boundary: one D2 commit containing machine, wrapper, controls, and tests. Revert as a unit; never revert only the UI because Stop semantics would then disagree with the state machine. No database rollback is involved.

## 16. UI-D3 — Completion, remaining Flow work, Quick Read conversion, Settings, and confirmations

Objective: complete the post-recording MVP experience, finish Flow copy/status presentation around the accepted disclosure, expose account conversion only when value requires it, preserve anonymous UUID ownership, and fix modal/header interactions. No backend schema or provider-policy expansion is authorized.

Exact file boundary:

Modify:

- `src/app/index.tsx` — completion composition, mutually exclusive overlays, Settings entry, Quick Read sequence.
- `src/features/mic-flow/MicFlowCard.tsx` — remaining customer-facing copy/status polish only; preserve the accepted local inline disclosure contract.
- `src/features/mic-flow/mic-flow-presentation.ts` — concise Flow copy only; status semantics unchanged.
- `src/features/mic-flow/mic-flow-card.test.ts`
- `src/features/mic-flow/mic-flow-presentation.test.ts`
- `src/features/auth/SignupFlow.tsx` — rename to Quick Read experience, remove repeated age gate and mandatory goals/blockers, add email/Google conversion surfaces when supported, enforce UUID continuity.
- `src/features/auth/auth-flow-store.ts` — revised conversion steps/intents.
- `src/features/auth/auth-recovery.ts` — preserve original anonymous UUID and Google/email conversion intent.
- `src/features/auth/auth-service.ts` — assert email conversion UUID; add Google identity-link initiation/completion only after external configuration is accepted.
- `src/features/auth/auth-callback.ts` — support validated OAuth code callback/state in addition to existing OTP tokens.
- `src/app/auth/callback.tsx` — DropMic copy and conversion resume handling.
- `src/features/auth/auth-service.test.ts`
- `src/features/auth/auth-recovery.test.ts`
- `src/features/auth/auth-callback.test.ts`
- `src/features/quick-read/QuickReadFlow.tsx` — Quick Read title/copy, remove “What happens next,” preserve explicit consent/retention.
- `src/features/quick-read/attempt-identity.test.ts`
- `src/features/quick-read/quick-read-service.test.ts` only for unchanged gate/call-order assertions; avoid service changes unless required for orchestration safety.
- `src/features/quick-read/r0f-c-take-two.test.ts`
- `src/features/quick-read/r0f-d-take-two.test.ts`
- `e2e/audio-proof.spec.ts`
- `e2e/auth-callback.spec.ts`
- `e2e/responsive.spec.ts`

Add:

- `src/ui/Sheet.tsx`
- `src/ui/ConfirmDialog.tsx`
- `src/features/settings/SettingsSheet.tsx`
- `src/features/settings/SettingsSheet.test.tsx`
- `src/features/completion/CompletionView.tsx`
- `src/features/completion/CompletionMark.tsx`
- `src/features/completion/CompletionView.test.tsx`

Explicitly unchanged unless a separately approved backend repair is required: `src/features/mic-flow/mic-flow-service.ts`, all Supabase migrations/rollbacks/tests, `src/features/quick-read/quick-read-service.ts` provider sequence, Edge functions, Storage policy, billing/RevenueCat adapters.

Required tests/gates:

- Completion copy/action hierarchy, opacity-only reduced-motion completion, playback secondary, Quick Read primary but never automatic.
- Recording deletion confirmation: cancel preserves file/state; confirm awaits deletion then clears state; failure preserves recovery.
- Preserve the accepted collapsed/expanded accessibility and no-request contract; extend coverage to all five server statuses, stale-owner suppression, final customer copy, and Mic Save non-dismissibility.
- Anonymous users see no login before recording; Quick Read triggers visible conversion.
- Email conversion returns the same UUID captured at recording start before attempt claim/Quick Read.
- Google linking returns the same UUID, validates callback intent/state, and never falls back to sign-in as another owner.
- Existing-account path cannot silently transfer an anonymous completion to another UUID.
- Account conversion cancel/OTP expiry retains the local recording and recovery metadata.
- Quick Read still performs zero upload/provider calls before explicit retention consent; then preserves request → private upload → Edge/provider ordering.
- Settings/Close never overlap visually or in the accessibility tree; one overlay at a time; iPad sheets are bounded/centered.
- String scan removes all locked legacy phrases from runtime UI while preserving internal identifiers.
- Full baseline validation suite and live auth acceptance only in the disposable approved environment with synthetic-user cleanup.

Rollback boundary: one D3 UI/auth orchestration commit, with any externally required Google provider configuration documented and independently reversible. Do not deploy database changes as part of this phase. If provider configuration cannot be rolled back independently, Google remains disabled while email conversion ships.

## 17. UI-D4 — Fonts, icon assets, final polish, acceptance, risks, cost, and unresolved blockers

Objective: apply licensed typography and final app-icon/visual polish, then run complete cross-form-factor acceptance. D4 does not change product state machines, auth ownership, Flow authority, Quick Read consent, or monetization contracts.

Status after UI-D1 acceptance: fonts, font loading/licenses, production icon/splash assets, and final token polish remain deferred and unimplemented.

Exact file boundary:

Modify:

- `src/app/_layout.tsx` — load bundled fonts and hold/release splash safely.
- `src/ui/theme.ts` — finalize font family names, measured palette/contrast, and motion tokens.
- `src/ui/AppShell.tsx`, `src/ui/AppHeader.tsx`, `src/ui/ActionButton.tsx`, `src/ui/PromptCard.tsx`, `src/ui/Sheet.tsx` — token-only visual polish where needed.
- `src/features/solari/SolariBoard.tsx` — final type metrics only.
- `src/features/completion/CompletionMark.tsx` — final timing only.
- `app.json` — final icon/splash/favicon references and colors; retain D1 orientation/name decisions.
- `assets/expo.icon/icon.json` and `assets/expo.icon/Assets/**` — replace Expo template layers from supplied master.
- `assets/images/icon.png`
- `assets/images/android-icon-background.png`
- `assets/images/android-icon-foreground.png`
- `assets/images/android-icon-monochrome.png`
- `assets/images/favicon.png`
- `assets/images/splash-icon.png`
- `e2e/responsive.spec.ts`

Add after assets are supplied/approved:

- `assets/brand/dropmic-icon-master-2048.png` (exact supplied 2048×2048 source; do not synthesize/upscale)
- `assets/fonts/Inter-Regular.ttf`
- `assets/fonts/Inter-SemiBold.ttf`
- `assets/fonts/Inter-Bold.ttf`
- `assets/fonts/Fraunces-Bold.ttf` or licensed `Recoleta-Bold` file if proof is supplied
- corresponding `assets/fonts/OFL-Inter.txt` and `assets/fonts/OFL-Fraunces.txt`, or the exact Recoleta distribution license

Do not touch in D4: recorder/auth/Flow/Quick Read service semantics, Supabase files, Edge functions, billing.

Required tests/gates:

- Font-load success and deterministic legal/system fallback; no flash that changes button/layout bounds; offline launch works.
- License files match every bundled font and are included in distribution obligations.
- Automated contrast checks and manual light/dark/tinted icon review.
- Icon source dimensions exactly 2048×2048; generated sizes, alpha, safe zones, Android masks, iOS Icon Composer layers, favicon, and splash verified.
- Screenshot matrix: representative small/large iPhone portrait and landscape, iPad portrait and landscape, Dynamic Type default/XXXL, Reduce Motion on/off, light/dark appearance where supported.
- VoiceOver traversal and actions, keyboard navigation on web/iPad, touch target measurement, modal focus restoration, and no Settings/Close overlap.
- Full typecheck, lint, Jest, independent browser suites, web export, iPhone/iPad simulator build, and physical-device recorder acceptance retained from D2.

Risks and mitigations:

- **Recorder regression:** pause semantics differ from old finalize-on-Stop. Keep machine/wrapper/UI in one commit and require physical one-file proof.
- **Timer drift:** wall-clock countdown would include paused time. Use accumulated recorder-active time and deterministic tests.
- **Destructive race:** retry/cancel/Take Two can rotate identity before deletion. Await deletion and invalidate stale operations before state change.
- **Split persistence:** Flow can currently credit before local metadata persists. Enforce the ordered completion transaction and idempotency.
- **Auth ownership split:** existing-account sign-in can replace the anonymous UUID. Assert continuity and disable unsafe transfer paths until resolved.
- **OAuth callback mismatch:** current token parser is insufficient for Google code flow. Validate intent/state and UUID before claim.
- **Modal collision:** independent booleans can stack Settings/auth/Quick Read/Mic Save. Use one overlay coordinator with Mic Save priority.
- **Responsive regression:** current portrait lock and width-only breakpoint conceal landscape failures. Unlock orientation in D1 and test every phase on all four native layouts.
- **Accessibility regression:** hold-only cancellation is not sufficient. Keep the gesture and provide an accessible destructive alternative with confirmation.
- **Brand/legal risk:** current artwork is Expo template and fonts are unlicensed/unbundled. Ship no Recoleta or new icon until provenance is present.

Rollback boundaries:

- D1, D2, D3, and D4 are separate commits and acceptance gates.
- Revert each phase as a unit; later phases depend on earlier shared primitives.
- No Supabase migration, Storage policy, Edge deployment, or RevenueCat change is expected, so no database/data rollback is required.
- D4 asset/config rollback restores the prior binaries without touching user data.
- Google provider configuration, if authorized, is an external rollback boundary and must be documented separately from the code commit.

Expected cost impact:

- D1: no API/provider cost; one small local AsyncStorage receipt. Anonymous session timing remains at recording start, so no intentional Auth MAU/query increase.
- D2: no network cost and no audio concatenation/processing service. Negligible local CPU/storage change; paused recordings remain one file.
- D3: Flow expansion reuses the loaded snapshot and adds no query. Quick Read remains explicit and retains the existing request/upload/transcription/feedback cost only after consent. Email/Google conversion adds only user-initiated auth traffic; no new recurring backend job is proposed. Optional onboarding deferral may reduce pre-value profile/preference writes.
- D4: no runtime API cost. Bundled fonts/icons increase binary size modestly; there is no font CDN or image-generation dependency.

Unresolved blockers only:

1. **Google identity-linking configuration and acceptance are absent.** The Supabase Google provider, authorized redirect/deep-link values, manual identity-linking setting, native/web browser return handling, and disposable live acceptance credentials must be supplied/approved before the Google path in D3 can ship. Email conversion can proceed independently.
2. **Existing-account ownership after an anonymous recording has no approved merge rule.** Current existing-account sign-in changes UUID and cannot preserve server-owned Flow continuity. Until a merge/transfer contract is approved, the post-recording path must permit same-UUID conversion only and must not silently offer existing-account sign-in that loses anonymous ownership.
3. **The required 2048×2048 DropMic icon master is not in the repository.** D4 icon work cannot start from the current Expo-template assets; the exact supplied source and provenance must be made available.

Recoleta is not treated as a blocker because the locked direction explicitly permits a legal fallback: use locally bundled Fraunces under OFL unless a licensed Recoleta Bold file and redistribution proof are supplied.
