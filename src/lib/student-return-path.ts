export function getSafeStudentReturnPath(value: string | null | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/student";
  }

  return value.startsWith("/student") || value.startsWith("/submit/")
    ? value
    : "/student";
}
