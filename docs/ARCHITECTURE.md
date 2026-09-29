# 수학 활동지 AI 평가 시스템 — 구현 설계

> 작성일: 2026-09-28  
> 상태: 구현 전 설계. 이 문서는 현재 저장소 조사 결과와 1인 개발 기준의 구현 순서를 기록한다. 승인 전에는 이 문서에 적힌 구현을 시작하지 않는다.

## 1. 조사 결과와 현재 프로젝트 구조

현재 폴더는 아직 애플리케이션 코드나 Git 저장소가 아닌 **초기 기획 워크스페이스**다. `package.json`, Next.js 설정, Supabase 설정, 테스트, 환경 변수, DB migration은 존재하지 않는다. 따라서 기존 프레임워크나 구현을 교체할 문제는 없다.

```text
pageon/
├── Codex 시작 프롬프트.md
├── math_worksheet_project_brief.md
├── 수학 활동지 AI 평가 시스템 개발 설계 v0.2.md
├── achievement_standards_math.json
├── achievement_level_math.json
└── docs/
    └── ARCHITECTURE.md
```

두 기획 문서의 방향은 일치한다. `math_worksheet_project_brief.md`를 우선 기준 문서로 사용하고, `수학 활동지 AI 평가 시스템 개발 설계 v0.2.md`의 화면·카메라 UX 상세를 보조 기준으로 사용한다.

### 이미 있는 데이터

- `achievement_standards_math.json`: 초등 수학 성취기준 121건. 학년군(1~2, 3~4, 5~6), 영역 4개, 코드·내용·핵심 아이디어를 포함한다.
- `achievement_level_math.json`: 초등 수학의 3개 학년군 성취수준(A/B/C)을 포함한다.
- 두 JSON은 문법 검증을 통과했다. Phase 2에서 DB 시드의 원본으로 사용한다.

## 2. 현재 사용 기술과 권장 기술

현재 실제로 사용 중인 런타임 기술은 없다. 첫 구현부터 다음의 작은 구성을 사용한다.

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 웹앱 | Next.js App Router + TypeScript | 교사/학생 웹을 한 프로젝트에서 만들고 서버 로직도 가까이 둔다. |
| UI | React + CSS 중심의 단순 컴포넌트 구조 | 초기 디자인 시스템·상태 관리 라이브러리를 추가하지 않는다. |
| 데이터·파일 | Supabase PostgreSQL, Auth, Storage, RLS | DB, 교사 인증, 비공개 파일을 별도 백엔드 없이 운영한다. |
| 교사 인증 | Supabase Auth 이메일 로그인 | 교사 계정에 표준 세션과 RLS를 적용한다. |
| 학생 인증 | 서버 검증 PIN + HttpOnly 학생 세션 쿠키 | 학생 이메일 계정을 만들지 않으며 PIN 평문을 저장하지 않는다. |
| 비동기 처리 | `processing_jobs` DB 테이블부터 시작 | Phase 4에 처리기를 연결한다. 별도 큐·마이크로서비스는 실제 부하가 확인될 때만 추가한다. |

AI, OCR, 수식 인식 공급자는 지금 선택하지 않는다. Phase 4의 실제 종이·실제 필기 테스트로 정확도와 비용을 비교한 뒤, 교체 가능한 서버 측 어댑터 하나로 연결한다.

## 3. 유지할 부분과 변경이 필요한 부분

### 유지할 부분

- 종이 활동지 → QR → 모바일 촬영 → 제출 → 검토·분석이라는 제품 흐름
- 교사와 학생을 하나의 Next.js 앱에서 `/teacher`, `/student`로 분리하는 방향
- 활동지 PDF와 구조화된 문항 데이터를 같은 버전으로 보관하는 원칙
- 원본 촬영본 보존, 비공개 저장소, AI 결과와 최종 판정의 분리
- 성취기준 중심의 학생 분석과 활동지 단위의 학급 분석
- 제공된 두 성취기준 JSON을 초기 교육과정 데이터 원본으로 사용하는 계획

### 변경·추가가 필요한 부분

- 현재는 실행 코드가 없으므로 Next.js 프로젝트, Supabase 프로젝트 연결, 환경 변수 예시, migration, 기본 테스트를 새로 만든다.
- "DB에는 Storage URL"이라는 표현은 파일의 영구 공개 URL을 뜻하지 않도록 바꾼다. DB에는 **버킷명과 객체 경로**만 저장하고, 화면에는 권한 확인 뒤 짧게 만료되는 signed URL만 발급한다.
- 학생은 Supabase Auth 계정을 만들지 않는다. `student_identifier`와 해시된 PIN을 서버에서 검증해 제한된 학생 세션을 만든다. 학생 경로의 데이터 조회·업로드 권한은 서버가 학생·학급·활동지 관계를 매번 검증한다.
- Phase 1에는 AI, PDF 생성, 카메라, OCR, 채점, 분석을 넣지 않는다. 빈 화면이나 TODO로 위장하지 않고, 각 Phase의 완료 기준을 충족할 때만 다음 단계로 진행한다.

## 4. 권장 데이터 모델

### 설계 원칙

- UUID를 기본 키로 사용하고 모든 시간은 `timestamptz`로 저장한다.
- 교사 소유 데이터는 `teacher_id` 또는 해당 교사의 학급을 통해 권한을 판정한다.
- 활동지는 수정 가능한 초안(`worksheets`)과 인쇄·배포 후 바뀌지 않는 버전(`worksheet_versions`)을 나눈다. 제출은 항상 특정 버전을 가리킨다.
- 통계는 처음에는 최종 채점 결과를 조회해 계산한다. 성능 문제가 측정되기 전까지 별도 집계 테이블은 만들지 않는다.
- enum은 DB migration에서 명시한다. 자유로운 문자열 상태값을 여러 곳에서 만들지 않는다.

### Phase 1: 계정·학급·학생

| 테이블 | 주요 필드 | 책임 |
| --- | --- | --- |
| `teacher_profiles` | `id` (→ `auth.users.id`), `display_name` | Supabase Auth 교사 프로필 |
| `classrooms` | `id`, `teacher_id`, `name`, `school_year`, `join_code`, `archived_at` | 교사가 소유한 학급 |
| `students` | `id`, `classroom_id`, `display_name`, `student_identifier`, `pin_hash`, `active` | 학생 식별자와 해시된 PIN. `(classroom_id, student_identifier)`는 유일 |
| `student_sessions` | `id`, `student_id`, `token_hash`, `expires_at`, `revoked_at` | DB에는 세션 토큰 해시만 보관. 쿠키에는 원문 토큰만 둠 |

`join_code`는 학급을 찾는 용도일 뿐 인증 수단이 아니다. PIN은 Argon2id 또는 bcrypt로 해시하며, 평문과 복호화 가능한 암호화값을 저장하지 않는다.

### Phase 2: 교육과정·활동지

| 테이블 | 주요 필드 | 책임 |
| --- | --- | --- |
| `achievement_standards` | `id`, `code`, `grade_band`, `area`, `description`, `core_idea`, `achievement_levels` JSONB | 제공 JSON에서 시드하는 성취기준 |
| `worksheets` | `id`, `teacher_id`, `title`, `grade_band`, `semester`, `unit_name`, `lesson_title`, `status` | 활동지의 현재 초안과 공통 메타데이터 |
| `worksheet_versions` | `id`, `worksheet_id`, `version_number`, `submission_token`, `page_count`, `pdf_bucket`, `pdf_path`, `published_at` | 인쇄·QR·제출의 불변 기준. `submission_token`은 고유한 무작위 값 |
| `worksheet_pages` | `id`, `worksheet_version_id`, `page_number`, `template_width`, `template_height` | 페이지와 정렬 기준 |
| `questions` | `id`, `worksheet_version_id`, `page_id`, `question_number`, `type`, `prompt`, `answer_spec` JSONB, `max_score`, `answer_bbox` JSONB | 유형, 정답·허용표현, 배점, 정규화 좌표(0~1) |
| `question_achievement_standards` | `question_id`, `achievement_standard_id` | 문항과 여러 성취기준의 연결 |

`answer_spec`은 문항별 정답·허용 표현·필수 개념처럼 채점에 필요한 작은 구조화 데이터다. 문항 유형은 우선 `multiple_choice`, `short_answer`, `calculation`, `constructed_response` 네 개로 제한한다. `answer_bbox`는 PDF 편집 뒤 해당 버전을 다시 생성할 때 함께 갱신한다.

### Phase 3~5: 제출·인식·채점·검토

| 테이블 | 주요 필드 | 책임 |
| --- | --- | --- |
| `submissions` | `id`, `student_id`, `worksheet_version_id`, `status`, `attempt_number`, `submitted_at` | 한 학생의 특정 버전 제출. 재제출 정책과 상태의 기준 |
| `submission_pages` | `id`, `submission_id`, `worksheet_page_id`, `original_bucket`, `original_path`, `processed_bucket`, `processed_path`, `processing_status` | 원본·보정본과 페이지별 처리 상태 |
| `student_answers` | `id`, `submission_id`, `question_id`, `submission_page_id`, `image_bucket`, `image_path`, `status` | 문항 답안 이미지 및 처리 단위 |
| `answer_recognition_results` | `id`, `student_answer_id`, `provider`, `model`, `recognized_text`, `recognized_math` JSONB, `confidence`, `created_at` | 무엇을 썼는지에 대한 인식 결과. 재처리 이력 보존 |
| `ai_grading_results` | `id`, `student_answer_id`, `recognition_result_id`, `provider`, `model`, `outcome`, `awarded_score`, `confidence`, `reason`, `created_at` | AI 채점 제안. 최종 채점과 분리 |
| `final_grading_results` | `student_answer_id`(유일), `status`, `outcome`, `awarded_score`, `source_ai_grading_result_id`, `decided_by`, `decided_at` | 현재 최종 판정. `AUTO_CONFIRMED`, `REVIEW_REQUIRED`, `TEACHER_CONFIRMED` 상태 |
| `grading_audit_logs` | `id`, `student_answer_id`, `actor_type`, `actor_id`, `before_value` JSONB, `after_value` JSONB, `created_at` | 자동 확정·교사 수정의 변경 이력 |
| `processing_jobs` | `id`, `submission_id`, `job_type`, `status`, `attempts`, `last_error`, `locked_at`, `completed_at` | 오래 걸리는 이미지/OCR/채점 작업의 재시도 상태 |

AI 결과의 `outcome`은 `correct`, `partial`, `incorrect`, `unreadable`, `teacher_review_required`로 제한한다. 점수는 `numeric(6,2)`로 저장하고, 부분점수 규칙은 Phase 5 시작 전에 문항 유형별로 확정한다.

### 재제출과 삭제 정책

- 기본 정책: 제출 전에는 페이지 재촬영을 자유롭게 허용한다. 제출 후 재제출을 허용할지는 활동지 발행 시 교사가 선택하고, 허용하면 새 `submissions.attempt_number`를 생성한다.
- 기본 분석 대상은 교사가 정한 최신 유효 제출이다. 이전 제출과 원본은 감사·문제 해결을 위해 유지한다.
- 학생 사진과 최종 평가 데이터의 보존·삭제 기간은 학교 정책이 필요하다. 정책이 확정되기 전 자동 삭제 작업은 만들지 않는다.

## 5. 권한과 RLS

| 주체 | 허용 범위 |
| --- | --- |
| 교사 | 자신의 프로필, 자신이 소유한 학급·학생·활동지·제출·최종 결과만 조회·변경 |
| 학생 | 자신의 유효 세션으로 QR의 활동지와 자신의 제출만 생성·조회. 다른 학생과 다른 학급 데이터는 접근 불가 |
| 서버 작업자 | 비공개 서비스 키로 OCR·채점 작업을 수행하되, 내부 인증된 서버 코드에서만 사용 |

Supabase RLS는 교사 데이터에 적용한다. 학생 세션은 Supabase 클라이언트에서 직접 넓은 DB 권한을 받지 않는다. 학생용 Server Action/Route Handler가 서명된 쿠키를 검증하고, 학생·학급·활동지 관계를 확인한 뒤 필요한 최소 DB 작업과 signed upload URL 발급만 수행한다. 이는 PIN과 관리자 권한이 브라우저로 노출되는 것을 막는다.

## 6. 주요 화면·Route

| 경로 | 사용자 | 목적 | Phase |
| --- | --- | --- | --- |
| `/` | 모두 | 교사 로그인 또는 학생 제출 안내 | 1 |
| `/teacher/sign-in` | 교사 | 이메일 로그인 | 1 |
| `/teacher` | 교사 | 홈: 학급·최근 활동지·제출·검토 요약 | 1부터 점진 확장 |
| `/teacher/classrooms` | 교사 | 학급 목록·생성 | 1 |
| `/teacher/classrooms/[classroomId]` | 교사 | 학생 목록·등록·PIN 재설정 | 1 |
| `/student/sign-in` | 학생 | 학급 코드·학생 식별자·PIN 인증 | 1 |
| `/student` | 학생 | 인증된 학생의 제출 안내 | 1 |
| `/teacher/worksheets` | 교사 | 활동지 목록 | 2 |
| `/teacher/worksheets/new` | 교사 | 활동지 생성·편집 | 2 |
| `/teacher/worksheets/[worksheetId]` | 교사 | 활동지·제출 현황·문항 분석·성취기준 탭 | 2부터 점진 확장 |
| `/submit/[submissionToken]` | 학생 | QR 진입점. 미인증이면 로그인 후 이 경로로 복귀 | 2 |
| `/student/submit/[submissionToken]` | 학생 | 페이지별 촬영·확인·제출 | 3 |
| `/teacher/review` | 교사 | 답안 단위의 검토 큐 | 5 |
| `/teacher/analytics` | 교사 | 학급/활동지/성취기준 분석 | 6 |
| `/teacher/students/[studentId]` | 교사 | 학생 성취기준별 결과와 변화 | 6 |

`/submit/[submissionToken]`은 QR에 넣는 짧고 안정적인 주소다. 인증 이후에도 원래 토큰을 유지해 학생이 해당 활동지로 정확히 돌아간다.

## 7. Storage 구조

Supabase Storage는 모두 **private bucket**으로 만든다. 버킷을 과도하게 나누지 않고 두 개로 유지한다.

```text
worksheets (private)
└── {teacherId}/{worksheetId}/{versionNumber}/worksheet.pdf

submissions (private)
├── {submissionId}/original/{pageNumber}.jpg
├── {submissionId}/processed/{pageNumber}.jpg
└── {submissionId}/answers/{questionId}.jpg
```

- DB에는 `bucket`과 `path`만 저장한다. 영구 URL, 브라우저에 노출되는 서비스 키, 공개 버킷은 사용하지 않는다.
- 교사가 원본·보정본·답안 이미지를 볼 때는 서버가 소유 관계를 확인한 뒤 짧은 만료 시간의 signed URL을 만든다.
- 학생의 모바일 업로드는 서버에서 인증·제출 대상을 확인한 뒤 해당 파일 한 개에만 쓸 수 있는 signed upload URL을 발급한다.
- 이미지 메타데이터(EXIF 위치 정보)는 업로드/처리 시 제거한다.

## 8. 필요한 Server Action·Route Handler

서버 로직은 화면 기능 가까이에 둔다. 초기부터 별도 API 레이어나 범용 repository 패턴을 만들지 않는다.

### Phase 1

- `teacherSignIn`, `teacherSignOut`
- `createClassroom`, `updateClassroom`, `archiveClassroom`
- `createStudent`, `updateStudent`, `resetStudentPin`, `setStudentActive`
- `studentSignIn`, `studentSignOut`, `requireStudentSession`

### Phase 2~3

- `createWorksheet`, `saveWorksheetDraft`, `publishWorksheetVersion`
- `getWorksheetPdfUrl`, `createSubmissionForToken`
- `createSubmissionPageUploadUrl`, `completeSubmission`

### Phase 4~5

- 내부 전용 `POST /api/internal/process-jobs`: 인증된 작업자만 대기 작업을 가져와 처리한다.
- `getAnswerImageUrl`, `confirmFinalGrade`, `correctFinalGrade`

### Phase 6~7

- `getWorksheetAnalytics`, `getStudentStandardProgress`
- `analyzeExistingPdf`와 교사 확인·발행 Action

교사 생성·수정 Action은 항상 현재 Supabase 사용자와 소유권을 확인한다. 내부 처리 Route는 서비스 키를 사용하는 유일한 장소이며, 외부에서 호출 가능한 공개 API가 아니다.

## 9. Phase 1~7 구현 및 완료 기준

| Phase | 범위 | 완료 기준·검증 |
| --- | --- | --- |
| 1. 기반 | Next.js, Supabase 교사 인증, 교사/학생 경로, 학급·학생·PIN·RLS | 교사가 학급과 학생을 만들고, 학생이 학급 코드·식별자·PIN으로 로그인한다. 다른 교사·학생 데이터에 접근할 수 없음을 확인한다. |
| 2. 활동지 | 성취기준 시드, 활동지 초안·버전·문항 구조, PDF, QR | 교사가 성취기준을 연결한 활동지를 만들고 PDF를 인쇄한다. QR은 개인정보 없이 해당 발행 버전으로 진입하며 PDF와 문항 데이터가 같은 버전을 가리킨다. |
| 3. 제출 | QR 인증 복귀, 모바일 카메라, 전/후면 전환, 다중 페이지·재촬영, 비공개 업로드 | 실제 스마트폰과 태블릿에서 3페이지 종이를 촬영·재촬영·제출한다. 원본 세 장은 보존되고, 교사는 제출·미제출을 볼 수 있다. |
| 4. 처리·인식 | 문서 보정, 템플릿 정렬, 답안 영역 추출, OCR·수식 인식, 작업 재시도 | 실제 학생 필기에서 원본·보정·크롭 이미지와 인식값을 교사가 대조한다. 실패 유형과 인식 신뢰도를 기록한다. |
| 5. 채점·검토 | 유형별 채점 제안, 인식/채점 신뢰도, 자동 확정·검토 큐, 교사 수정 이력 | 낮은 신뢰도·부분점수 가능 답안만 큐에 나타난다. 교사 수정 후 AI 결과와 최종 결과가 모두 남고, 통계는 최종 결과를 쓴다. |
| 6. 분석 | 제출 현황, 활동지 분포·문항 정답률, 성취기준·학생 변화 | 활동지 평균·중앙값·분포·문항 정답률·미제출을 확인한다. 학생 상세는 성취기준별 최근 성과, 최근 오답, 최근 3회 대 이전 3회 변화를 보여 준다. |
| 7. 기존 PDF | PDF 분석, 문항·영역·성취기준 추천, 교사 수정·발행 | 기존 PDF 하나를 교사가 검토·확정한 뒤 QR 제출부터 인식·채점·분석까지 기존 파이프라인으로 통과시킨다. |

각 Phase에서 DB가 바뀌면 `supabase/migrations/<timestamp>_<description>.sql`을 추가하고, 실제 빈 Supabase 프로젝트에 migration 적용과 권한 검증을 한다. 테스트가 통과하지 않으면 다음 Phase로 넘어가지 않는다.

## 10. 분석 규칙

- **학생 분석 기본 단위**: 성취기준. 모든 활동지를 합친 평균을 대표 지표로 강조하지 않는다.
- **활동지 분석 기본 단위**: 같은 활동지를 수행한 같은 학급의 유효 최종 제출. 평균, 중앙값, 분포, 문항별 정답률, 성취기준별 정답률, 미제출을 제공한다.
- **검토 대기**: 집계에서 확정 결과와 분리해 "검토 대기 n건"으로 보인다. 미확정 답안을 확정 점수처럼 계산하지 않는다.
- **성장 추이 초기 방식**: 성취기준별 최근 점수, 최근 3회 평균, 그 이전 3회 평균, 변화량. 데이터가 쌓이기 전에는 복잡한 예측 모델을 만들지 않는다.
- **성취수준**: 원점수는 보존하고 A/B/C 또는 잘함/보통/노력요함은 교사가 나중에 조정 가능한 기준값으로 계산한다.

## 11. 기술적으로 위험한 영역과 대응

| 위험 | 이유 | 초기 대응 |
| --- | --- | --- |
| 모바일 카메라 | 기기·브라우저별 권한, 후면 카메라 선택, 메모리 차이 | Phase 3에서 실제 iOS/Android 태블릿·폰으로 테스트하고 파일 선택 대체 경로를 둔다. |
| 촬영 정렬·보정 | 그림자, 기울기, 원근, 흐림, 인쇄 오차 | 원본을 보존하고, AI 생성 활동지는 템플릿 정렬 후 저장된 답안 영역만 자른다. |
| 손글씨·수식 인식 | 초등학생 필기와 수식 구조는 오류가 많다 | 실제 표본으로 인식 성공률·실패 유형을 측정한다. 낮은 신뢰도는 자동 확정하지 않는다. |
| 서술형 채점 | 부분정답과 의미 해석이 모호하다 | AI는 근거를 포함한 제안만 내고, 낮은 채점 신뢰도·부분정답은 검토 큐로 보낸다. |
| 장시간 AI 작업 | 웹 요청 시간 초과와 재처리 필요 | `processing_jobs`로 상태·오류·재시도를 남기고, Phase 4에 별도 처리 호출을 연결한다. |
| 아동 데이터 보호 | 사진과 성적은 민감하다 | private Storage, RLS, 서버 권한 검사, 해시 PIN, signed URL, 공개 QR 무정보 원칙을 적용한다. |
| PDF와 좌표 불일치 | PDF 편집 후 답안 영역이 달라질 수 있다 | 배포된 활동지는 버전 고정한다. 내용·레이아웃 변경은 새 버전을 발행한다. |

## 12. 현재 바로 시작할 첫 작업

이 문서 검토 후 **Phase 1만** 시작한다. 첫 작업 묶음은 아래로 한정한다.

1. 빈 폴더에 Next.js + TypeScript 프로젝트를 만든다.
2. Supabase 프로젝트 연결에 필요한 환경 변수 예시를 추가한다.
3. 교사 프로필·학급·학생·학생 세션 테이블과 RLS를 담은 첫 migration을 작성한다.
4. 교사 로그인, 학급 생성, 학생 등록, 학생 PIN 로그인이라는 최소 화면과 서버 검증을 구현한다.
5. migration 적용, TypeScript 검사, production build, 교사·학생 권한 흐름을 실제로 확인한다.

활동지 생성, PDF, QR, 카메라, Storage 업로드, AI/OCR/채점은 이 첫 작업에 포함하지 않는다.

## 13. 구현 전 결정이 필요한 외부 항목

다음은 Phase 1 구현을 시작할 때 사용자가 제공하거나 선택해야 하는 외부 설정이다.

- Supabase 프로젝트의 URL·anon key·서버 전용 service role key 및 배포 환경 변수 등록 방식
- 교사 로그인 방식(초기에는 이메일·비밀번호 또는 magic link 중 하나)
- 학생 표시명과 사진·성적의 학교 보존 기간

이 항목들은 제품 범위를 바꾸지 않지만 실제 인증·운영에 필요한 설정이다. 그 외 기술 선택은 위 설계를 기준으로 작은 Phase 안에서 결정한다.
