-- Phase 7: 기존 PDF 원본과 교사 확인 전 분석 초안을 비공개로 보관한다.

alter table public.worksheets
  drop constraint if exists worksheets_generation_source_check;
alter table public.worksheets
  add constraint worksheets_generation_source_check
  check (generation_source in ('manual', 'mock', 'pdf_import'));

create type public.worksheet_import_status as enum ('analyzed', 'registered', 'failed');

create table public.worksheet_imports (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles (id) on delete cascade,
  worksheet_id uuid unique references public.worksheets (id) on delete set null,
  original_filename text not null,
  original_storage_path text not null unique,
  original_byte_size integer not null check (original_byte_size > 0),
  page_count integer not null check (page_count between 1 and 100),
  extracted_text text not null default '',
  analysis jsonb not null default '{}'::jsonb,
  analysis_mode text not null check (analysis_mode in ('heuristic_mock', 'ai')),
  status public.worksheet_import_status not null default 'analyzed',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index worksheet_imports_teacher_id_idx on public.worksheet_imports (teacher_id, created_at desc);

create trigger worksheet_imports_set_updated_at
before update on public.worksheet_imports
for each row execute function public.set_updated_at();

alter table public.worksheet_imports enable row level security;
revoke all on public.worksheet_imports from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('worksheet-sources', 'worksheet-sources', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- PDF 원본은 교사의 권한을 확인한 서버 코드에서만 서명 URL로 제공한다.
