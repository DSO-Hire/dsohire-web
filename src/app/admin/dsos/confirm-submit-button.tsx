"use client";

/**
 * <ConfirmSubmitButton> — a form submit button that requires an
 * explicit confirm() before the server action fires. Used to guard
 * destructive admin actions (e.g. suspending a DSO) on otherwise
 * plain server-action <form>s. Also reflects the form's pending
 * state so a double-click can't fire the action twice.
 */

import { useFormStatus } from "react-dom";

interface ConfirmSubmitButtonProps {
  confirmMessage: string;
  className?: string;
  children: React.ReactNode;
}

export function ConfirmSubmitButton({
  confirmMessage,
  className,
  children,
}: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
      className={className}
    >
      {pending ? "Working…" : children}
    </button>
  );
}
