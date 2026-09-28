import { LegalPage } from '@/features/legal/LegalPage';

export default function TermsPage() {
  return <LegalPage
    title="Terms"
    description="The terms for using DropMic speaking practice and Quick Read features."
    sections={[
      {
        title: 'Using DropMic',
        paragraphs: [
          'DropMic is a speaking-practice app operated by Prentiss Whitley. You may use it for personal practice if you are at least 13 years old and follow applicable law.',
          'Keep your sign-in details private and use only recordings, prompts, and other content that you have the right to use. Do not use DropMic to harass, impersonate, defraud, or interfere with another person or the service.',
        ],
      },
      {
        title: 'Your content',
        paragraphs: [
          'You keep ownership of the content you create. You give DropMic only the limited permission needed to store, process, display, and return content when you request an app feature such as saved playback or Quick Read.',
          'You are responsible for the content you submit and for protecting access to your account. Do not submit confidential information that you do not want processed by the feature you select.',
        ],
      },
      {
        title: 'Availability and changes',
        paragraphs: [
          'Features may change, be temporarily unavailable, or depend on third-party services. DropMic does not promise that every feature will be available on every device or at every time.',
          'We may update these terms as the product changes. The current version is posted at this route. Continued use after an update means you accept the updated terms.',
        ],
      },
      {
        title: 'Contact',
        paragraphs: [
          'For questions about these terms or the service, contact support@thedropmic.com.',
        ],
      },
    ]}
  />;
}
