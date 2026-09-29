-- Phase 4: 제출 이미지 보정, 문항 답안 crop, OCR 결과

alter table public.submissions
  add column image_processing_status text not null default 'pending'
    check (image_processing_status in ('pending', 'processing', 'completed', 'failed')),
  add column image_processing_error text,
  add column image_processing_started_at timestamptz,
  add column image_processing_completed_at timestamptz;

alter table public.submission_pages
  add column processed_storage_path text unique,
  add column processed_mime_type text,
  add column document_corners jsonb,
  add column applied_transforms jsonb not null default '[]'::jsonb,
  add column processed_at timestamptz;

create table public.submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_page_id uuid not null references public.submission_pages (id) on delete cascade,
  question_id uuid not null references public.worksheet_questions (id) on delete restrict,
  crop_bbox jsonb,
  crop_source text not null check (crop_source in ('template_bbox', 'page_fallback')),
  answer_storage_path text not null unique,
  recognized_text text,
  recognition_confidence numeric(5,2),
  recognition_engine text not null default 'tesseract.js',
  recognition_error text,
  created_at timestamptz not null default now(),
  unique (submission_page_id, question_id)
);

create index submission_answers_page_id_idx on public.submission_answers (submission_page_id);
create index submission_answers_question_id_idx on public.submission_answers (question_id);

alter table public.submission_answers enable row level security;
revoke all on public.submission_answers from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submission-processed',
  'submission-processed',
  false,
  12582912,
  array['image/jpeg']
)
on conflict (id) do nothing;

-- 제출 처리본과 문항 crop도 원본과 동일하게 서버의 학생 세션/교사 권한 검증 뒤에만 접근한다.
