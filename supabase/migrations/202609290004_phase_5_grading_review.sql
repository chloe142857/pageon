-- Phase 5: 자동채점 결과와 교사 최종 판정을 분리해 저장한다.

create type public.grading_result as enum ('correct', 'partial', 'incorrect', 'unreadable');
create type public.grading_status as enum ('AUTO_CONFIRMED', 'REVIEW_REQUIRED', 'TEACHER_CONFIRMED');

create table public.ai_grading_results (
  id uuid primary key default gen_random_uuid(),
  submission_answer_id uuid not null unique references public.submission_answers (id) on delete cascade,
  predicted_result public.grading_result not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  reasoning_summary text not null default '',
  needs_teacher_review boolean not null default true,
  grading_status public.grading_status not null,
  grading_strategy text not null,
  model_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.final_grading_results (
  id uuid primary key default gen_random_uuid(),
  submission_answer_id uuid not null unique references public.submission_answers (id) on delete cascade,
  result public.grading_result not null,
  score_awarded numeric(6,2) not null check (score_awarded >= 0),
  grading_status public.grading_status not null default 'TEACHER_CONFIRMED'
    check (grading_status = 'TEACHER_CONFIRMED'),
  teacher_id uuid not null references public.teacher_profiles (id) on delete restrict,
  teacher_note text not null default '',
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_grading_results_review_idx
  on public.ai_grading_results (needs_teacher_review, created_at asc)
  where needs_teacher_review = true;
create index final_grading_results_teacher_idx on public.final_grading_results (teacher_id, confirmed_at desc);

create trigger ai_grading_results_set_updated_at
before update on public.ai_grading_results
for each row execute function public.set_updated_at();

create trigger final_grading_results_set_updated_at
before update on public.final_grading_results
for each row execute function public.set_updated_at();

alter table public.ai_grading_results enable row level security;
alter table public.final_grading_results enable row level security;

-- 채점과 검토는 교사/학생 세션 검증을 마친 서버 코드만 service role로 수행한다.
revoke all on public.ai_grading_results from anon, authenticated;
revoke all on public.final_grading_results from anon, authenticated;
