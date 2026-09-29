-- Phase 3: 학생 촬영 제출 원본과 페이지 단위 제출 데이터

alter table public.worksheets
  add column total_pages integer not null default 1 check (total_pages between 1 and 30);

create type public.submission_status as enum ('uploading', 'submitted', 'upload_failed');

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid not null references public.worksheets (id) on delete restrict,
  student_id uuid not null references public.students (id) on delete restrict,
  worksheet_version integer not null check (worksheet_version >= 1),
  status public.submission_status not null default 'uploading',
  page_count integer not null check (page_count between 1 and 30),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.submission_pages (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  original_storage_path text not null unique,
  original_mime_type text not null,
  original_byte_size integer not null check (original_byte_size > 0),
  created_at timestamptz not null default now(),
  unique (submission_id, page_number)
);

create index submissions_worksheet_student_idx on public.submissions (worksheet_id, student_id, created_at desc);
create index submission_pages_submission_id_idx on public.submission_pages (submission_id);

create trigger submissions_set_updated_at
before update on public.submissions
for each row execute function public.set_updated_at();

alter table public.submissions enable row level security;
alter table public.submission_pages enable row level security;

-- 학생은 Supabase Auth 계정이 없으므로, 제출 데이터와 원본은 학생 세션을
-- 검증하는 서버 Route Handler만 service role로 다룬다.
revoke all on public.submissions from anon, authenticated;
revoke all on public.submission_pages from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submission-originals',
  'submission-originals',
  false,
  12582912,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- 이 private bucket에는 anon/authenticated 정책을 만들지 않는다.
-- 원본 업로드와 조회는 학생 세션을 확인한 서버에서만 service role로 수행한다.
