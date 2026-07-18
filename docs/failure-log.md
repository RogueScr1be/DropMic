# Failure log

## 2026-07-18 — Expo dependencies were not installed after scaffold

- Symptom: `npx expo install` could not determine the Expo SDK version.
- Cause: the foundation was intentionally created with `create-expo-app --no-install`.
- Resolution: ran `npm install` before adding SDK-compatible dependencies.
- Prevention: run dependency installation before any Expo CLI command that resolves project modules.

## 2026-07-18 — Native and Safari validation unavailable in this pass

- iPhone, Android, iPad, and Safari require a real device/browser manual run.
- No platform result is claimed until those checks are performed.
