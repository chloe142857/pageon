-- 교사가 이해하기 쉬운 학급 코드와 중복 학급 방지 규칙.
alter table public.classrooms
  drop constraint if exists classrooms_join_code_check;
alter table public.classrooms
  add constraint classrooms_join_code_check
  check (join_code ~ '^[A-Z0-9]{4,12}$');

create unique index if not exists classrooms_active_teacher_name_year_key
  on public.classrooms (teacher_id, name, school_year)
  where archived_at is null;
