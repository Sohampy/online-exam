-- Run this in the Supabase SQL editor if students see:
-- "Could not find the function public.start_exam(p_exam_id) in the schema cache"
-- This version supports separate retake attempts.

create or replace function public.start_exam(p_exam_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_student uuid := auth.uid();
  v_exam public.exams%rowtype;
  v_in_progress uuid;
  v_attempt_count int;
  v_attempt_number int;
  v_chapter_ids uuid[];
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
    raise exception 'You must be logged in to start an exam.';
  end if;

  select * into v_exam from public.exams where id = p_exam_id;
  if not found then
    raise exception 'Exam not found.';
  end if;

  select id into v_in_progress
  from public.student_attempts
  where exam_id = p_exam_id and student_id = v_student and status = 'in_progress'
  order by started_at desc
  limit 1;

  if v_in_progress is not null then
    return v_in_progress;
  end if;

  select count(*) into v_attempt_count
  from public.student_attempts
  where exam_id = p_exam_id and student_id = v_student and status = 'submitted';

  if coalesce(v_exam.allow_multiple_attempts, false) = false and v_attempt_count > 0 then
    raise exception 'Already Attempted';
  end if;

  if coalesce(v_exam.allow_multiple_attempts, false) = true
     and v_exam.max_attempts is not null
     and v_attempt_count >= v_exam.max_attempts then
    raise exception 'Maximum attempts completed.';
  end if;

  v_attempt_number := v_attempt_count + 1;

  select coalesce(array_agg(chapter_id order by random()), '{}')
  into v_chapter_ids
  from public.exam_chapters
  where exam_id = p_exam_id;

  v_chapter_count := coalesce(array_length(v_chapter_ids, 1), 0);
  if v_chapter_count < greatest(v_exam.min_chapters, 1) then
    raise exception 'This exam needs at least % chapters.', v_exam.min_chapters;
  end if;

  foreach v_chapter_id in array v_chapter_ids loop
    v_chapter_index := v_chapter_index + 1;
    v_needed := floor(v_exam.total_questions::numeric / v_chapter_count)::int
      + case when v_chapter_index <= mod(v_exam.total_questions, v_chapter_count) then 1 else 0 end;

    select coalesce(array_agg(id), '{}')
    into v_take_ids
    from (
      select id
      from public.questions
      where chapter_id = v_chapter_id
        and coalesce(is_deleted, false) = false
        and (v_exam.difficulty = 'mixed' or difficulty = v_exam.difficulty)
      order by case when coalesce(v_exam.randomize_questions, true) then random() else 0 end, created_at
      limit v_needed
    ) q;

    v_final_question_ids := v_final_question_ids || v_take_ids;
  end loop;

  if coalesce(array_length(v_final_question_ids, 1), 0) < v_exam.total_questions then
    v_missing := v_exam.total_questions - coalesce(array_length(v_final_question_ids, 1), 0);
    select coalesce(array_agg(id), '{}')
    into v_take_ids
    from (
      select id
      from public.questions
      where chapter_id = any(v_chapter_ids)
        and coalesce(is_deleted, false) = false
        and (v_exam.difficulty = 'mixed' or difficulty = v_exam.difficulty)
        and not id = any(v_final_question_ids)
      order by case when coalesce(v_exam.randomize_questions, true) then random() else 0 end, created_at
      limit v_missing
    ) backup;
    v_final_question_ids := v_final_question_ids || v_take_ids;
  end if;

  if coalesce(array_length(v_final_question_ids, 1), 0) <> v_exam.total_questions then
    raise exception 'Not enough questions are available for this exam.';
  end if;

  insert into public.student_attempts(student_id, exam_id, status, attempt_number)
  values (v_student, p_exam_id, 'in_progress', v_attempt_number)
  returning id into v_attempt_id;

  insert into public.exam_questions(attempt_id, question_id, question_order)
  select v_attempt_id, id, row_number() over ()
  from (
    select id
    from unnest(v_final_question_ids) as id
    order by case when coalesce(v_exam.randomize_questions, true) then random() else 0 end
  ) shuffled;

  return v_attempt_id;
end;
$$;

grant execute on function public.start_exam(uuid) to authenticated;
notify pgrst, 'reload schema';
