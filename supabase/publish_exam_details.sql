-- Optional helper for Supabase SQL editor.
-- Replace the id below with the exam id, then run it to publish both result and detailed analysis.

update public.exams
set result_visible = true,
    analysis_visible = true
where id = '00000000-0000-0000-0000-000000000000';

notify pgrst, 'reload schema';
