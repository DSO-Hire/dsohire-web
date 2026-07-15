"use client";

/**
 * PasswordInput — password field with a show/hide (eye) toggle.
 *
 * Every password box in the app renders through this so a typo is checkable
 * before submit (launch-day fix 2026-07-15: the bare inputs had no reveal
 * affordance, so a mistyped password was invisible until the sign-in failed).
 *
 * Drop-in for a bare <input type="password">: same name/id/autoComplete
 * contract, pass the exact input className through — the wrapper only adds
 * right padding so text never runs under the toggle. The toggle is a real
 * focusable button (≥24px target) that flips type between password and text.
 */

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({
  className = "",
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...inputProps}
        type={visible ? "text" : "password"}
        className={`${className} pr-12`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-meta hover:text-ink transition-colors"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden />
        ) : (
          <Eye className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  );
}
