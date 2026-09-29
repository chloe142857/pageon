"use client";

import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  confirmMessage?: string;
};

/** Prevents accidental repeat submissions while a Server Action is still running. */
export function PendingSubmitButton({ children, pendingLabel = "처리 중…", className, confirmMessage }: Props) {
  const { pending } = useFormStatus();

  return <button className={className} type="submit" disabled={pending} aria-busy={pending} onClick={(event) => { if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault(); }}>{pending ? pendingLabel : children}</button>;
}
