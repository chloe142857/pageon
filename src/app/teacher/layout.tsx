import { TeacherNavigation } from "@/components/teacher-navigation";

export const dynamic = "force-dynamic";

export default function TeacherLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <TeacherNavigation />
      <main className="page teacher-page">{children}</main>
    </>
  );
}
