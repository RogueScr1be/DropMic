# QA7-A: copy, prompt catalog, and static visual polish

## Changes

- Updated completion, delete-confirmation, saved-drop, and account-entry copy while preserving the existing handlers and OTP flow selection.
- Replaced the six placeholder prompts with the ordered 20-prompt catalog while keeping deterministic selection and immediate no-repeat behavior.
- Added a mirrored closing quotation mark to `PromptCard` with reserved space for long prompts and preserved the accessible prompt text.

## Risks and validation scope

The main risk is copy drifting from action behavior, especially at the conversion/sign-in boundary. Focused tests cover the changed labels, handler transitions, catalog order, deterministic selection, prompt semantics, and saved-drop stack contract. Native microphone, playback, and OTP delivery remain environment-dependent checks.

## QA7-D-R1 repair

- Repaired the confirmed cold anonymous-owner timeout race: the owner-establishment bound is now 5000ms, concurrent starts share one underlying operation, and a timed-out caller cannot trigger a duplicate signup while that operation remains unresolved.
- Added development-only, non-sensitive owner failure classifications for timeout, network, auth, invalid session, and unknown failures. The recording UI continues to show the existing concise preparation message and does not request microphone permission or begin countdown until the owner identity is verified.

## QA7-E final reconciliation

QA7 is a CONDITIONAL PASS. Accepted native/manual evidence covers copy, the exact 20-prompt catalog, mirrored PromptCard quotes, the normal-flow closing-quote repair, recognizable settled uppercase `I` in portrait and landscape, completion animation, Reduced Motion, one bell per distinct identity with no reopen replay, the cold anonymous-owner timeout/single-flight repair, pending/consumed TakeIdentity rotation, recorder blob cleanup, saved-take completion-dismissal state retirement, a genuine 1,500ms Hold to Cancel, iPhone/iPad rotation with retained playback, and scrollable compact-landscape content.

External caveats remain: physical-device VoiceOver, physical-device silent-mode/audio-session behavior, and live OTP without an authorized mailbox. The development Metro audio-path defect remains separate; embedded Release assets passed. QA7 does not claim full physical-device acceptance.

Historical R6/R7 findings are superseded: R6 landscape “clipping” was offscreen scrollable content, R7A’s nested-flex diagnosis was disproven, R7B was fully rolled back, and the missing-uppercase-`I` investigation found no data or settled-render loss. These findings remain historical, not current defects.

## QA7-D-R3B consumed TakeIdentity repair

The parent now distinguishes pending from consumed recording identities. Owner-preparation failure and microphone permission denial preserve a pending identity. Permission success consumes it before countdown. Any later genuine recording start rotates a consumed identity once, while existing Retry Drop, Delete, successful Hold-to-Cancel, and Take Two paths retain their pending replacement identities without a second rotation. Saved Drop recovery restores the persisted identity as consumed, and same-take persistence/Quick Read/auth/playback paths preserve it.

Focused and full automated tests pass. Release native two-completion ID/bell evidence remains required on the iPhone 16e and iPad Pro 13-inch M5; the Metro asset and owner-preparation issues remain separate gates.
