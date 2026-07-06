-- Practice test RPCs
-- Run this after schema/feature upgrade so practice attempts can be generated and restarted.

alter table if exists public.student_attempts alter column exam_id drop not null;
alter table if exists public.student_attempts add column if not exists attempt_type text not null default 'exam' check (attempt_type in ('exam', 'practice'));
alter table if exists public.student_attempts add column if not exists attempt_number int not null default 1;
alter table if exists public.student_attempts add column if not exists percentage numeric default 0;
alter table if exists public.student_attempts add column if not exists time_taken_seconds int default 0;
alter table if exists public.student_attempts add column if not exists practice_subject text;
alter table if exists public.student_attempts add column if not exists practice_chapter_ids uuid[] default '{}';
alter table if exists public.student_attempts add column if not exists practice_question_count int;
alter table if exists public.student_attempts add column if not exists practice_difficulty text default 'mixed';
alter table if exists public.student_attempts add column if not exists practice_signature text;
alter table if exists public.student_attempts add column if not exists practice_duration_minutes int default 0;

create or replace function public.start_practice_test(
  p_subject text,
  p_chapter_ids uuid[],
  p_question_count int,
  p_difficulty text default 'mixed',
  p_signature text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_student uuid := auth.uid();
  v_signature text;
  v_attempt_count int := 0;
  v_attempt_number int := 1;
  v_duration_minutes int := 0;
  v_selected_chapters uuid[] := '{}';
  v_final_question_ids uuid[] := '{}';
  v_chapter_id uuid;
  v_chapter_count int;
  v_chapter_index int := 0;
  v_needed int;
  v_take_ids uuid[];
  v_missing int;
  v_attempt_id uuid;
begin
  if v_student is null then
    raise exception 'You must be logged in to start a practice test.';
  end if;

  if p_question_count is null or p_question_count <= 0 then
    raise exception 'Question count must be greater than 0.';
  end if;

  if p_chapter_ids is null or coalesce(array_length(p_chapter_ids, 1), 0) = 0 then
    raise exception 'Select at least one chapter.';
  end if;

  select coalesce(array_agg(chapter_id order by chapter_id), '{}')
  into v_selected_chapters
  from (
    select distinct chapter_id
    from unnest(p_chapter_ids) as chapter_id
  ) unique_chapters;

  v_signature := coalesce(
    p_signature,
    lower(trim(coalesce(p_subject, ''))) || '|' || coalesce(array_to_string(v_selected_chapters, ','), '') || '|' || p_question_count::text || '|' || lower(coalesce(p_difficulty, 'mixed'))
  );

  select count(*)
  into v_attempt_count
  from public.student_attempts
  where student_id = v_student
    and attempt_type = 'practice'
    and practice_signature = v_signature;

  v_attempt_number := v_attempt_count + 1;
  v_duration_minutes := greatest(10, ceil(p_question_count * 1.5))::int;

  v_chapter_count := coalesce(array_length(v_selected_chapters, 1), 0);
  if v_chapter_count = 0 then
    raise exception 'Select at least one chapter.';
  end if;

  foreach v_chapter_id in array v_selected_chapters loop
    v_chapter_index := v_chapter_index + 1;
    v_needed := floor(p_question_count::numeric / v_chapter_count)::int
      + case when v_chapter_index <= mod(p_question_count, v_chapter_count) then 1 else 0 end;

    select coalesce(array_agg(id), '{}')
    into v_take_ids
    from (
      select id
      from public.questions
      where chapter_id = v_chapter_id
        and coalesce(is_deleted, false) = false
        and (
          lower(coalesce(difficulty, 'mixed')) = lower(coalesce(p_difficulty, 'mixed'))
          or lower(coalesce(p_difficulty, 'mixed')) = 'mixed'
        )
      order by random(), created_at
      limit v_needed
    ) chosen;

    v_final_question_ids := v_final_question_ids || v_take_ids;
  end loop;

  if coalesce(array_length(v_final_question_ids, 1), 0) < p_question_count then
    v_missing := p_question_count - coalesce(array_length(v_final_question_ids, 1), 0);
    select coalesce(array_agg(id), '{}')
    into v_take_ids
    from (
      select id
      from public.questions
      where chapter_id = any(v_selected_chapters)
        and coalesce(is_deleted, false) = false
        and (
          lower(coalesce(difficulty, 'mixed')) = lower(coalesce(p_difficulty, 'mixed'))
          or lower(coalesce(p_difficulty, 'mixed')) = 'mixed'
        )
        and not (id = any(v_final_question_ids))
      order by random(), created_at
      limit v_missing
    ) backup;
    v_final_question_ids := v_final_question_ids || v_take_ids;
  end if;

  if coalesce(array_length(v_final_question_ids, 1), 0) <> p_question_count then
    raise exception 'Not enough questions are available for this practice test.';
  end if;

  insert into public.student_attempts(
    student_id,
    exam_id,
    attempt_type,
    status,
    attempt_number,
    practice_subject,
    practice_chapter_ids,
    practice_question_count,
    practice_difficulty,
    practice_signature,
    practice_duration_minutes
  )
  values (
    v_student,
    null,
    'practice',
    'in_progress',
    v_attempt_number,
    p_subject,
    v_selected_chapters,
    p_question_count,
    lower(coalesce(p_difficulty, 'mixed')),
    v_signature,
    v_duration_minutes
  )
  returning id into v_attempt_id;

  insert into public.exam_questions(attempt_id, question_id, question_order)
  select v_attempt_id, id, row_number() over ()
  from (
    select id
    from unnest(v_final_question_ids) as id
    order by random()
  ) shuffled;

  return v_attempt_id;
end;
$$;

create or replace function public.restart_practice_test(p_attempt_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_student uuid := auth.uid();
  v_source public.student_attempts%rowtype;
  v_new_attempt_id uuid;
  v_attempt_number int := 1;
begin
  if v_student is null then
    raise exception 'You must be logged in to restart a practice test.';
  end if;

  select * into v_source
  from public.student_attempts
  where id = p_attempt_id
    and attempt_type = 'practice';

  if not found then
    raise exception 'Practice test not found.';
  end if;

  if v_source.student_id <> v_student then
    raise exception 'You can only restart your own practice tests.';
  end if;

  if v_source.status = 'in_progress' then
    return v_source.id;
  end if;

  select count(*)
  into v_attempt_number
  from public.student_attempts
  where student_id = v_student
    and attempt_type = 'practice'
    and practice_signature = v_source.practice_signature;

  v_attempt_number := v_attempt_number + 1;

  insert into public.student_attempts(
    student_id,
    exam_id,
    attempt_type,
    status,
    attempt_number,
    practice_subject,
    practice_chapter_ids,
    practice_question_count,
    practice_difficulty,
    practice_signature,
    practice_duration_minutes
  )
  values (
    v_source.student_id,
    null,
    'practice',
    'in_progress',
    v_attempt_number,
    v_source.practice_subject,
    v_source.practice_chapter_ids,
    v_source.practice_question_count,
    v_source.practice_difficulty,
    v_source.practice_signature,
    coalesce(v_source.practice_duration_minutes, 0)
  )
  returning id into v_new_attempt_id;

  insert into public.exam_questions(attempt_id, question_id, question_order)
  select v_new_attempt_id, question_id, question_order
  from public.exam_questions
  where attempt_id = p_attempt_id
  order by question_order;

  return v_new_attempt_id;
end;
$$;

grant execute on function public.start_practice_test(text, uuid[], int, text, text) to authenticated;
grant execute on function public.restart_practice_test(uuid) to authenticated;

create or replace function public.get_practice_chapter_counts(
  p_subject text,
  p_difficulty text default 'mixed'
)
returns table (chapter_id uuid, available_count int)
language sql
security definer
set search_path=public
as $$
  select
    q.chapter_id,
    count(*)::int as available_count
  from public.questions q
  join public.chapters c on c.id = q.chapter_id
  where c.subject = p_subject
    and coalesce(q.is_deleted, false) = false
    and (
      lower(coalesce(q.difficulty, 'mixed')) = lower(coalesce(p_difficulty, 'mixed'))
      or lower(coalesce(p_difficulty, 'mixed')) = 'mixed'
    )
  group by q.chapter_id;
$$;

grant execute on function public.get_practice_chapter_counts(text, text) to authenticated;
notify pgrst, 'reload schema';
