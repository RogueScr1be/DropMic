-- Local-development recovery only.
-- Run only after verifying zero Mic Flow rows; never execute against deployed remote.

drop function if exists public.record_mic_flow_completion(text, text, text, integer, integer, text, boolean);
drop table if exists public.mic_flow_state;
drop table if exists public.mic_flow_completions;
