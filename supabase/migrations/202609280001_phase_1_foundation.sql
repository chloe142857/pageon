-- Phase 1: 교사 인증, 학급, 학생, 서버 전용 학생 PIN/세션
-- 적용: Supabase SQL Editor 또는 `supabase db push`

create extension if not exists pgcrypto;

create table public.teacher_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  school_year text not null default '',
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{6,12}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  student_number integer not null check (student_number between 1 and 9999),
  student_identifier text not null check (student_identifier ~ '^[A-Z0-9_-]{2,32}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classroom_id, student_number),
  unique (classroom_id, student_identifier)
);

-- PIN 해시는 교사 브라우저에도 노출하지 않는다. service role을 쓰는 서버 코드만 접근한다.
create table public.student_credentials (
  student_id uuid primary key references public.students (id) on delete cascade,
  pin_hash text not null check (pin_hash like '$2%'),
  updated_at timestamptz not null default now()
);

-- 쿠키에는 무작위 토큰 원문, DB에는 SHA-256 해시만 둔다.
create table public.student_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index classrooms_teacher_id_idx on public.classrooms (teacher_id);
create index students_classroom_id_idx on public.students (classroom_id);
create index student_sessions_active_token_idx on public.student_sessions (token_hash, expires_at) where revoked_at is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger teacher_profiles_set_updated_at
before update on public.teacher_profiles
for each row execute function public.set_updated_at();

create trigger classrooms_set_updated_at
before update on public.classrooms
for each row execute function public.set_updated_at();

create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

create trigger student_credentials_set_updated_at
before update on public.student_credentials
for each row execute function public.set_updated_at();

-- Supabase Auth에서 교사 계정이 생기면 같은 id의 프로필을 자동 생성한다.
create or replace function public.handle_new_teacher()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.teacher_profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_teacher();

alter table public.teacher_profiles enable row level security;
alter table public.classrooms enable row level security;
alter table public.students enable row level security;
alter table public.student_credentials enable row level security;
alter table public.student_sessions enable row level security;

create policy "teachers can read their profile"
on public.teacher_profiles for select to authenticated
using (id = auth.uid());

create policy "teachers can update their profile"
on public.teacher_profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy "teachers manage their classrooms"
on public.classrooms for all to authenticated
using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "teachers manage students in their classrooms"
on public.students for all to authenticated
using (
  exists (
    select 1 from public.classrooms
    where classrooms.id = students.classroom_id
      and classrooms.teacher_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.classrooms
    where classrooms.id = students.classroom_id
      and classrooms.teacher_id = auth.uid()
  )
);

grant usage on schema public to anon, authenticated;
grant select, update on public.teacher_profiles to authenticated;
grant select, insert, update, delete on public.classrooms to authenticated;
grant select, insert, update, delete on public.students to authenticated;

-- 학생 PIN·세션은 브라우저용 anon/authenticated 역할이 읽거나 쓰지 못한다.
revoke all on public.student_credentials from anon, authenticated;
revoke all on public.student_sessions from anon, authenticated;
