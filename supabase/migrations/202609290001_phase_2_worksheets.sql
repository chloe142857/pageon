-- Phase 2: 교육과정, 활동지, 구조화된 문항, QR 발행 상태

create type public.worksheet_status as enum ('draft', 'published');
create type public.question_type as enum (
  'multiple_choice',
  'short_answer',
  'calculation',
  'constructed_response'
);

create table public.achievement_standards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  grade_band text not null,
  subject text not null default '수학',
  area text not null,
  core_idea text not null default '',
  description text not null,
  achievement_levels jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worksheets (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  grade_band text not null,
  semester text not null,
  area text not null default '',
  unit_name text not null default '',
  lesson_objective text not null,
  generation_source text not null default 'manual' check (generation_source in ('manual', 'mock')),
  status public.worksheet_status not null default 'draft',
  version_number integer not null default 0 check (version_number >= 0),
  worksheet_token text not null unique,
  structured_content jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worksheet_standards (
  worksheet_id uuid not null references public.worksheets (id) on delete cascade,
  achievement_standard_id uuid not null references public.achievement_standards (id) on delete restrict,
  primary key (worksheet_id, achievement_standard_id)
);

create table public.worksheet_questions (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid not null references public.worksheets (id) on delete cascade,
  question_number integer not null check (question_number >= 1),
  type public.question_type not null,
  question_text text not null,
  answer text not null,
  explanation text not null default '',
  score numeric(6,2) not null check (score >= 0),
  achievement_standard_id uuid not null references public.achievement_standards (id) on delete restrict,
  page integer not null default 1 check (page >= 1),
  question_bbox jsonb,
  answer_bbox jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worksheet_id, question_number)
);

create index worksheets_teacher_id_idx on public.worksheets (teacher_id);
create index worksheets_token_idx on public.worksheets (worksheet_token);
create index worksheet_questions_worksheet_id_idx on public.worksheet_questions (worksheet_id);
create index worksheet_standards_standard_id_idx on public.worksheet_standards (achievement_standard_id);

create trigger achievement_standards_set_updated_at
before update on public.achievement_standards
for each row execute function public.set_updated_at();

create trigger worksheets_set_updated_at
before update on public.worksheets
for each row execute function public.set_updated_at();

create trigger worksheet_questions_set_updated_at
before update on public.worksheet_questions
for each row execute function public.set_updated_at();

alter table public.achievement_standards enable row level security;
alter table public.worksheets enable row level security;
alter table public.worksheet_standards enable row level security;
alter table public.worksheet_questions enable row level security;

create policy "authenticated users can read achievement standards"
on public.achievement_standards for select to authenticated
using (true);

create policy "teachers manage their worksheets"
on public.worksheets for all to authenticated
using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "teachers manage worksheet standards"
on public.worksheet_standards for all to authenticated
using (
  exists (
    select 1 from public.worksheets
    where worksheets.id = worksheet_standards.worksheet_id
      and worksheets.teacher_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.worksheets
    where worksheets.id = worksheet_standards.worksheet_id
      and worksheets.teacher_id = auth.uid()
  )
);

create policy "teachers manage worksheet questions"
on public.worksheet_questions for all to authenticated
using (
  exists (
    select 1 from public.worksheets
    where worksheets.id = worksheet_questions.worksheet_id
      and worksheets.teacher_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.worksheets
    where worksheets.id = worksheet_questions.worksheet_id
      and worksheets.teacher_id = auth.uid()
  )
);

grant select on public.achievement_standards to authenticated;
grant select, insert, update, delete on public.worksheets to authenticated;
grant select, insert, update, delete on public.worksheet_standards to authenticated;
grant select, insert, update, delete on public.worksheet_questions to authenticated;
