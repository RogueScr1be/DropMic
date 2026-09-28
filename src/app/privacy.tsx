import { LegalPage } from '@/features/legal/LegalPage';

export default function PrivacyPage() {
  return <LegalPage
    title="Privacy"
    description="How DropMic handles account, practice, recording, and Quick Read data."
    sections={[
      {
        title: 'What DropMic collects',
        paragraphs: [
          'DropMic uses an anonymous account to keep a practice session together. When you convert that account or sign in, Supabase processes the email address and authentication data needed to maintain your account.',
          'The app stores practice metadata such as prompts, selected and completed durations, completion times, progress, and privacy-safe product events. These events do not include recordings, transcripts, access tokens, or provider responses.',
        ],
      },
      {
        title: 'Recordings and Quick Read',
        paragraphs: [
          'Regular Drops and saved recordings stay on your device unless you choose an in-app feature that sends content for processing. Quick Read sends a selected recording to private cloud storage for transcription and structured feedback after you choose that feature.',
          'Cloud audio is deleted after successful Quick Read analysis. Temporary audio from a failed analysis may be retained for recovery and cleanup for up to 24 hours. Quick Read transcripts may be retained for up to 30 days, then deleted. Account deletion removes associated account data through the app’s deletion flow.',
        ],
      },
      {
        title: 'How data is used',
        paragraphs: [
          'Data is used to provide DropMic, keep your practice history and progress available, generate Quick Read feedback when requested, protect account boundaries, and understand basic product events. DropMic does not sell personal information.',
          'Supabase provides authentication, database, storage, and server functions. Quick Read uses the configured transcription and feedback providers only for the requested analysis. Provider secrets stay on the server and are not placed in the app.',
        ],
      },
      {
        title: 'Your choices',
        paragraphs: [
          'You can keep recordings local, decline Quick Read, delete saved Drops, and delete your account from the app. You may also contact support to ask a privacy question or request help with an account-related request.',
          'DropMic is intended for people age 13 and older. Do not use the service if you are under 13.',
        ],
      },
    ]}
  />;
}
