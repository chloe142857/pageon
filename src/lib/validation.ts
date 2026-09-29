import { z } from "zod";

export const classroomInputSchema = z.object({
  name: z.string().trim().min(1, "학급 이름을 입력하세요.").max(60),
  schoolYear: z.string().trim().max(20).optional(),
  joinCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,12}$/, "학급 코드는 영문 대문자 또는 숫자 4~12자로 입력하세요."),
});

export const studentInputSchema = z.object({
  displayName: z.string().trim().min(1, "학생 이름을 입력하세요.").max(60),
  studentNumber: z.coerce.number().int().min(1, "학생 번호는 1 이상이어야 합니다.").max(9999),
  pin: z.string().regex(/^\d{4,8}$/, "PIN은 숫자 4~8자리여야 합니다."),
});

export const studentUpdateSchema = studentInputSchema.extend({
  pin: z.union([z.literal(""), z.string().regex(/^\d{4,8}$/, "PIN은 숫자 4~8자리여야 합니다.")]),
});

export const studentSignInSchema = z.object({
  classroomCode: z.string().trim().min(4, "학급 코드를 입력하세요.").max(20),
  studentNumber: z.coerce.number().int().min(1, "번호를 입력하세요.").max(9999),
  displayName: z.string().trim().min(1, "이름을 입력하세요.").max(60),
  pin: z.string().regex(/^\d{4,8}$/, "PIN은 숫자 4~8자리여야 합니다."),
});
