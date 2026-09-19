-- UP

-- New Quick Read results persist the bounded provider-selected vibe. Existing
-- rows remain valid and render without a vibe until they are replaced naturally.
alter table public.analysis_results
  add column if not exists speaker_vibe text
  check (speaker_vibe is null or speaker_vibe in (
    'The Storyteller',
    'The Straight Shooter',
    'The Debater',
    'The Connector',
    'The Explorer',
    'The Builder',
    'The Analyst',
    'The Spark'
  ));

-- DOWN
-- alter table public.analysis_results drop column if exists speaker_vibe;
