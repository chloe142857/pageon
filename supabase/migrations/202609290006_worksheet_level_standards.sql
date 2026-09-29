-- 성취기준은 문항이 아니라 활동지(worksheet_standards)에 선택적으로 연결한다.
-- 기존 문항의 값은 과거 데이터 보존을 위해 남겨 두고, 새 문항은 NULL로 저장한다.
alter table public.worksheet_questions
  alter column achievement_standard_id drop not null;

comment on column public.worksheet_questions.achievement_standard_id is
  '이전 활동지 호환용. 신규 성취기준 연결은 worksheet_standards를 사용한다.';
