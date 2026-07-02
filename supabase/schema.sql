-- Online Examination Portal schema + RLS
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text unique not null,
  role text not null check (role in ('main_admin','teacher','student')) default 'student',
  can_manage_questions boolean not null default false,
  can_view_reports boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  chapter_name text not null,
  subject text not null,
  created_at timestamptz default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option text not null check (correct_option in ('A','B','C','D')),
  difficulty text not null check (difficulty in ('easy','medium','hard')) default 'medium',
  marks int not null default 1,
  created_at timestamptz default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  total_questions int not null default 20,
  min_chapters int not null default 5,
  duration_minutes int not null default 30,
  marks_per_question int not null default 1,
  difficulty text not null check (difficulty in ('easy','medium','hard','mixed')) default 'mixed',
  result_visible boolean not null default false,
  analysis_visible boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.exam_chapters (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  unique(exam_id, chapter_id)
);

create table if not exists public.student_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete cascade,
  started_at timestamptz default now(),
  submitted_at timestamptz,
  status text not null check (status in ('in_progress','submitted')) default 'in_progress',
  total_score numeric default 0,
  correct_count int default 0,
  incorrect_count int default 0,
  accuracy numeric default 0,
  attempt_type text not null default 'exam' check (attempt_type in ('exam','practice')),
  practice_subject text,
  practice_chapter_ids uuid[] default '{}',
  practice_question_count int,
  practice_difficulty text default 'mixed',
  practice_signature text,
  practice_duration_minutes int default 0
);

-- Keep existing databases in sync when this schema is re-run on an older project.
alter table if exists public.student_attempts alter column exam_id drop not null;
alter table if exists public.student_attempts add column if not exists attempt_type text not null default 'exam' check (attempt_type in ('exam','practice'));
alter table if exists public.student_attempts add column if not exists attempt_number int not null default 1;
alter table if exists public.student_attempts add column if not exists percentage numeric default 0;
alter table if exists public.student_attempts add column if not exists time_taken_seconds int default 0;
alter table if exists public.student_attempts add column if not exists practice_subject text;
alter table if exists public.student_attempts add column if not exists practice_chapter_ids uuid[] default '{}';
alter table if exists public.student_attempts add column if not exists practice_question_count int;
alter table if exists public.student_attempts add column if not exists practice_difficulty text default 'mixed';
alter table if exists public.student_attempts add column if not exists practice_signature text;
alter table if exists public.student_attempts add column if not exists practice_duration_minutes int default 0;

create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.student_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  question_order int not null
);

create table if not exists public.student_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.student_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_option text check (selected_option in ('A','B','C','D')),
  is_correct boolean default false,
  answered_at timestamptz default now(),
  unique(attempt_id, question_id)
);

-- Helpers
create or replace function public.my_role() returns text language sql security definer set search_path=public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_main_admin() returns boolean language sql security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'main_admin');
$$;

create or replace function public.can_teacher_manage_questions() returns boolean language sql security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role='teacher' and can_manage_questions=true);
$$;

create or replace function public.can_teacher_view_reports() returns boolean language sql security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role='teacher' and can_view_reports=true);
$$;

-- Create profile automatically after signup
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name','Student'), new.email, coalesce(new.raw_user_meta_data->>'role','student'))
  on conflict (id) do nothing;
  return new;
end;
$$;

grant execute on function public.start_exam(uuid) to authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.chapters enable row level security;
alter table public.questions enable row level security;
alter table public.exams enable row level security;
alter table public.exam_chapters enable row level security;
alter table public.student_attempts enable row level security;
alter table public.exam_questions enable row level security;
alter table public.student_answers enable row level security;

-- Profiles
drop policy if exists "profile self read" on public.profiles;
drop policy if exists "profile self insert" on public.profiles;
drop policy if exists "admin update profiles" on public.profiles;
drop policy if exists "self update basic profile" on public.profiles;
create policy "profile self read" on public.profiles for select using (id = auth.uid() or public.is_main_admin() or public.can_teacher_view_reports());
create policy "profile self insert" on public.profiles for insert with check (id = auth.uid());
create policy "admin update profiles" on public.profiles for update using (public.is_main_admin()) with check (public.is_main_admin());
create policy "self update basic profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Chapters
drop policy if exists "chapters readable authenticated" on public.chapters;
drop policy if exists "admin manage chapters" on public.chapters;
create policy "chapters readable authenticated" on public.chapters for select to authenticated using (true);
create policy "admin manage chapters" on public.chapters for all using (public.is_main_admin()) with check (public.is_main_admin());

-- Questions: students can read only assigned questions after attempt is created. They do not need correct_option in UI; frontend strips it.
drop policy if exists "admin teacher read questions" on public.questions;
drop policy if exists "student read own attempt questions" on public.questions;
drop policy if exists "admin teacher manage questions" on public.questions;
create policy "admin teacher read questions" on public.questions for select using (public.is_main_admin() or public.can_teacher_manage_questions() or public.my_role()='teacher');
create policy "student read own attempt questions" on public.questions for select using (
  exists(select 1 from public.exam_questions eq join public.student_attempts sa on sa.id=eq.attempt_id where eq.question_id=questions.id and sa.student_id=auth.uid())
);
create policy "admin teacher manage questions" on public.questions for all using (public.is_main_admin() or public.can_teacher_manage_questions()) with check (public.is_main_admin() or public.can_teacher_manage_questions());

-- Exams
drop policy if exists "exams readable authenticated" on public.exams;
drop policy if exists "admin manage exams" on public.exams;
create policy "exams readable authenticated" on public.exams for select to authenticated using (true);
create policy "admin manage exams" on public.exams for all using (public.is_main_admin()) with check (public.is_main_admin());

-- Exam chapters
drop policy if exists "exam chapters readable" on public.exam_chapters;
drop policy if exists "admin manage exam chapters" on public.exam_chapters;
create policy "exam chapters readable" on public.exam_chapters for select to authenticated using (true);
create policy "admin manage exam chapters" on public.exam_chapters for all using (public.is_main_admin()) with check (public.is_main_admin());

-- Attempts
drop policy if exists "students manage own attempts" on public.student_attempts;
create policy "students manage own attempts" on public.student_attempts for all using (
  student_id = auth.uid()
  or public.is_main_admin()
  or (
    public.can_teacher_view_reports()
    and (
      attempt_type = 'practice'
      or exists(select 1 from public.exams e where e.id = student_attempts.exam_id and e.created_by = auth.uid())
    )
  )
) with check (student_id = auth.uid() or public.is_main_admin());

-- Exam questions
drop policy if exists "students read own exam_questions" on public.exam_questions;
drop policy if exists "students insert own exam_questions" on public.exam_questions;
create policy "students read own exam_questions" on public.exam_questions for select using (exists(select 1 from public.student_attempts sa where sa.id=attempt_id and (sa.student_id=auth.uid() or public.is_main_admin() or (public.can_teacher_view_reports() and (sa.attempt_type='practice' or exists(select 1 from public.exams e where e.id=sa.exam_id and e.created_by=auth.uid()))))));
create policy "students insert own exam_questions" on public.exam_questions for insert with check (exists(select 1 from public.student_attempts sa where sa.id=attempt_id and sa.student_id=auth.uid() and sa.status='in_progress'));

-- Student answers
drop policy if exists "students manage own answers" on public.student_answers;
create policy "students manage own answers" on public.student_answers for all using (exists(select 1 from public.student_attempts sa where sa.id=attempt_id and (sa.student_id=auth.uid() or public.is_main_admin() or (public.can_teacher_view_reports() and (sa.attempt_type='practice' or exists(select 1 from public.exams e where e.id=sa.exam_id and e.created_by=auth.uid())))))) with check (exists(select 1 from public.student_attempts sa where sa.id=attempt_id and sa.student_id=auth.uid() and sa.status='in_progress'));

-- Starts an exam without exposing the full question bank to students.
create or replace function public.start_exam(p_exam_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_student uuid := auth.uid();
  v_exam public.exams%rowtype;
  v_existing_attempt uuid;
  v_chapter_ids uuid[];
  v_used_question_ids uuid[];
  v_final_question_ids uuid[] := '{}';
  v_chapter_id uuid;
  v_chapter_count int;
  v_chapter_index int := 0;
  v_needed int;
  v_pool_ids uuid[];
  v_take_ids uuid[];
  v_missing int;
  v_attempt_id uuid;
begin
  if v_student is null then
    raise exception 'You must be logged in to start an exam.';
  end if;

  select id into v_existing_attempt
  from public.student_attempts
  where exam_id = p_exam_id
    and student_id = v_student
    and status in ('in_progress', 'submitted')
  order by case when status = 'in_progress' then 0 else 1 end, started_at desc
  limit 1;

  if v_existing_attempt is not null then
    return v_existing_attempt;
  end if;

  select * into v_exam from public.exams where id = p_exam_id;
  if not found then
    raise exception 'Exam not found.';
  end if;

  select coalesce(array_agg(chapter_id order by random()), '{}')
  into v_chapter_ids
  from public.exam_chapters
  where exam_id = p_exam_id;

  v_chapter_count := coalesce(array_length(v_chapter_ids, 1), 0);
  if v_chapter_count < v_exam.min_chapters then
    raise exception 'This exam needs at least % chapters.', v_exam.min_chapters;
  end if;

  select coalesce(array_agg(eq.question_id), '{}')
  into v_used_question_ids
  from public.exam_questions eq
  join public.student_attempts sa on sa.id = eq.attempt_id
  where sa.student_id = v_student
    and sa.exam_id = p_exam_id;

  foreach v_chapter_id in array v_chapter_ids loop
    v_chapter_index := v_chapter_index + 1;
    v_needed := floor(v_exam.total_questions::numeric / v_chapter_count)::int
      + case when v_chapter_index <= mod(v_exam.total_questions, v_chapter_count) then 1 else 0 end;

    select coalesce(array_agg(id), '{}')
    into v_pool_ids
    from (
      select id
      from public.questions
      where chapter_id = v_chapter_id
        and (v_exam.difficulty = 'mixed' or difficulty = v_exam.difficulty)
      order by random()
    ) q;

    select coalesce(array_agg(id), '{}')
    into v_take_ids
    from (
      select id
      from unnest(v_pool_ids) as id
      where not id = any(v_used_question_ids)
      order by random()
      limit v_needed
    ) fresh;

    if coalesce(array_length(v_take_ids, 1), 0) < v_needed then
      select coalesce(array_agg(id), '{}')
      into v_take_ids
      from (
        select id
        from unnest(v_pool_ids) as id
        order by random()
        limit v_needed
      ) fallback;
    end if;

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
        and (v_exam.difficulty = 'mixed' or difficulty = v_exam.difficulty)
        and not (id = any(v_final_question_ids))
      order by random()
      limit v_missing
    ) backup;

    v_final_question_ids := v_final_question_ids || v_take_ids;
  end if;

  if coalesce(array_length(v_final_question_ids, 1), 0) <> v_exam.total_questions then
    raise exception 'Not enough questions are available for this exam.';
  end if;

  insert into public.student_attempts(student_id, exam_id, attempt_type, status)
  values (v_student, p_exam_id, 'exam', 'in_progress')
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
