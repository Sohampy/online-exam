-- Feature upgrade for bulk question upload, multiple attempts, review status, and richer summaries.
-- Run this after the original schema.sql in the Supabase SQL Editor.

alter table public.questions add column if not exists explanation text default '';
alter table public.questions add column if not exists created_by uuid references public.profiles(id);
alter table public.questions add column if not exists is_deleted boolean not null default false;
alter table public.questions add column if not exists deleted_at timestamptz;
alter table public.questions add column if not exists deleted_by uuid references public.profiles(id);

alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists removed_at timestamptz;
alter table public.profiles add column if not exists removed_by uuid references public.profiles(id);
alter table public.profiles add column if not exists removal_reason text;

alter table public.exams add column if not exists total_marks int default 0;
alter table public.exams add column if not exists passing_marks int default 0;
alter table public.exams add column if not exists allow_multiple_attempts boolean not null default false;
alter table public.exams add column if not exists max_attempts int;
alter table public.exams add column if not exists show_correct_answers boolean not null default true;
alter table public.exams add column if not exists randomize_questions boolean not null default true;
alter table public.exams add column if not exists randomize_options boolean not null default false;
alter table public.exams add column if not exists status text not null default 'published';

alter table public.student_attempts add column if not exists attempt_number int not null default 1;
alter table public.student_attempts add column if not exists percentage numeric default 0;
alter table public.student_attempts add column if not exists time_taken_seconds int default 0;

alter table public.student_answers add column if not exists marks_awarded numeric default 0;
alter table public.student_answers add column if not exists review_status text not null default 'not_answered';

create table if not exists public.teacher_students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz default now(),
  status text not null default 'active',
  unique(teacher_id, student_id)
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  class_name text not null,
  section_name text default '',
  description text default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  is_active boolean not null default true
);

alter table public.profiles add column if not exists class_id uuid references public.classes(id);
alter table public.profiles add column if not exists class_name text;

create table if not exists public.exam_visibility (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  visibility_type text not null check (visibility_type in ('all_students','class_wise','specific_students')),
  class_id uuid references public.classes(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

alter table public.exams add column if not exists visibility_type text not null default 'all_students';
alter table public.exams add column if not exists is_published boolean not null default true;
alter table public.exams add column if not exists is_active boolean not null default true;
alter table public.exams add column if not exists created_by_role text;

alter table public.classes enable row level security;
alter table public.exam_visibility enable row level security;
alter table public.teacher_students enable row level security;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, full_name, email, role, class_id, class_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name','Student'),
    new.email,
    coalesce(new.raw_user_meta_data->>'role','student'),
    nullif(new.raw_user_meta_data->>'class_id','')::uuid,
    nullif(new.raw_user_meta_data->>'class_name','')
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role,
    class_id = excluded.class_id,
    class_name = excluded.class_name;
  return new;
end;
$$;

drop policy if exists "profile self read" on public.profiles;
drop policy if exists "profiles role scoped read" on public.profiles;
create policy "profiles role scoped read" on public.profiles
for select using (
  id = auth.uid()
  or public.is_main_admin()
  or (
    public.my_role() = 'teacher'
    and exists (
      select 1
      from public.teacher_students ts
      where ts.teacher_id = auth.uid()
        and ts.student_id = profiles.id
        and ts.status = 'active'
    )
  )
  or (
    public.my_role() = 'student'
    and exists (
      select 1
      from public.teacher_students ts
      where ts.student_id = auth.uid()
        and ts.teacher_id = profiles.id
        and ts.status = 'active'
    )
  )
);

drop policy if exists "admin insert profiles" on public.profiles;
create policy "admin insert profiles" on public.profiles
for insert with check (public.is_main_admin() or id = auth.uid());

drop policy if exists "admin upsert profiles" on public.profiles;
create policy "admin upsert profiles" on public.profiles
for update using (public.is_main_admin() or id = auth.uid())
with check (public.is_main_admin() or id = auth.uid());

drop policy if exists "classes readable authenticated" on public.classes;
drop policy if exists "active classes readable public" on public.classes;
create policy "active classes readable public" on public.classes
for select using (is_active = true or public.is_main_admin());

drop policy if exists "admin manage classes" on public.classes;
create policy "admin manage classes" on public.classes
for all using (public.is_main_admin()) with check (public.is_main_admin());

drop policy if exists "exam visibility readable" on public.exam_visibility;
create policy "exam visibility readable" on public.exam_visibility
for select to authenticated using (true);

drop policy if exists "admin manage exam visibility" on public.exam_visibility;
create policy "admin manage exam visibility" on public.exam_visibility
for all using (public.is_main_admin() or public.my_role()='teacher')
with check (public.is_main_admin() or public.my_role()='teacher');

drop policy if exists "admin manage teacher students" on public.teacher_students;
create policy "admin manage teacher students" on public.teacher_students
for all using (public.is_main_admin()) with check (public.is_main_admin());

drop policy if exists "teacher read own teacher students" on public.teacher_students;
create policy "teacher read own teacher students" on public.teacher_students
for select using (teacher_id = auth.uid() or public.is_main_admin());

drop policy if exists "student read own teacher assignments" on public.teacher_students;
create policy "student read own teacher assignments" on public.teacher_students
for select using (student_id = auth.uid() or public.is_main_admin());

drop policy if exists "admin manage chapters" on public.chapters;
drop policy if exists "admin teacher manage chapters" on public.chapters;
create policy "admin teacher manage chapters" on public.chapters
for all using (public.is_main_admin() or public.my_role()='teacher')
with check (public.is_main_admin() or public.my_role()='teacher');

drop policy if exists "admin manage exams" on public.exams;
drop policy if exists "admin teacher manage exams" on public.exams;
create policy "admin teacher manage exams" on public.exams
for all using (public.is_main_admin() or public.my_role()='teacher')
with check (public.is_main_admin() or public.my_role()='teacher');

drop policy if exists "admin manage exam chapters" on public.exam_chapters;
drop policy if exists "admin teacher manage exam chapters" on public.exam_chapters;
create policy "admin teacher manage exam chapters" on public.exam_chapters
for all using (public.is_main_admin() or public.my_role()='teacher')
with check (public.is_main_admin() or public.my_role()='teacher');

drop policy if exists "admin teacher manage questions" on public.questions;
create policy "admin teacher manage questions" on public.questions
for all using (
  public.is_main_admin()
  or (public.my_role()='teacher' and created_by = auth.uid())
)
with check (
  public.is_main_admin()
  or (public.my_role()='teacher' and created_by = auth.uid())
);

create or replace function public.prevent_used_question_delete()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if exists (select 1 from public.exam_questions where question_id = old.id)
     or exists (select 1 from public.student_answers where question_id = old.id) then
    raise exception 'This question is already used in student attempts. It cannot be permanently deleted unless report snapshots are created.';
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_used_question_delete_trigger on public.questions;
create trigger prevent_used_question_delete_trigger
before delete on public.questions
for each row execute function public.prevent_used_question_delete();

delete from public.questions q
where coalesce(q.is_deleted, false) = true
  and not exists (select 1 from public.exam_questions eq where eq.question_id = q.id)
  and not exists (select 1 from public.student_answers sa where sa.question_id = q.id);

drop policy if exists "students manage own attempts" on public.student_attempts;
drop policy if exists "attempts role scoped read" on public.student_attempts;
create policy "attempts role scoped read" on public.student_attempts
for select using (
  student_id = auth.uid()
  or public.is_main_admin()
  or (
    public.my_role() = 'teacher'
    and exists (
      select 1
      from public.teacher_students ts
      where ts.teacher_id = auth.uid()
        and ts.student_id = student_attempts.student_id
        and ts.status = 'active'
    )
    and exists (
      select 1
      from public.exams e
      where e.id = student_attempts.exam_id
        and e.created_by = auth.uid()
    )
  )
);

drop policy if exists "students insert own attempts" on public.student_attempts;
create policy "students insert own attempts" on public.student_attempts
for insert with check (student_id = auth.uid() or public.is_main_admin());

drop policy if exists "students update own attempts" on public.student_attempts;
create policy "students update own attempts" on public.student_attempts
for update using (student_id = auth.uid() or public.is_main_admin())
with check (student_id = auth.uid() or public.is_main_admin());

drop policy if exists "students read own exam_questions" on public.exam_questions;
drop policy if exists "exam questions role scoped read" on public.exam_questions;
create policy "exam questions role scoped read" on public.exam_questions
for select using (
  exists (
    select 1
    from public.student_attempts sa
    where sa.id = exam_questions.attempt_id
      and (
        sa.student_id = auth.uid()
        or public.is_main_admin()
        or (
          public.my_role() = 'teacher'
          and exists (
            select 1
            from public.teacher_students ts
            where ts.teacher_id = auth.uid()
              and ts.student_id = sa.student_id
              and ts.status = 'active'
          )
          and exists (
            select 1
            from public.exams e
            where e.id = sa.exam_id
              and e.created_by = auth.uid()
          )
        )
      )
  )
);

drop policy if exists "students manage own answers" on public.student_answers;
drop policy if exists "student answers role scoped read" on public.student_answers;
create policy "student answers role scoped read" on public.student_answers
for select using (
  exists (
    select 1
    from public.student_attempts sa
    where sa.id = student_answers.attempt_id
      and (
        sa.student_id = auth.uid()
        or public.is_main_admin()
        or (
          public.my_role() = 'teacher'
          and exists (
            select 1
            from public.teacher_students ts
            where ts.teacher_id = auth.uid()
              and ts.student_id = sa.student_id
              and ts.status = 'active'
          )
          and exists (
            select 1
            from public.exams e
            where e.id = sa.exam_id
              and e.created_by = auth.uid()
          )
        )
      )
  )
);

drop policy if exists "students upsert own answers" on public.student_answers;
create policy "students upsert own answers" on public.student_answers
for all using (
  exists (
    select 1
    from public.student_attempts sa
    where sa.id = student_answers.attempt_id
      and sa.student_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.student_attempts sa
    where sa.id = student_answers.attempt_id
      and sa.student_id = auth.uid()
      and sa.status = 'in_progress'
  )
);

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
