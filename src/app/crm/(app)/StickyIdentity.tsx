"use client";

/*
 * Compact name bar for account profiles. It slides in under the
 * top bar once the profile hero scrolls away, so whoever is editing contacts
 * or details halfway down the page can see whose record it is.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export default function StickyIdentity({
  watch,
  accent,
  children,
}: {
  /* id of the hero element; the bar shows once it is fully scrolled past */
  watch: string;
  accent?: string;
  children: ReactNode;
}) {
  const [on, setOn] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = document.getElementById(watch);
    if (!hero) return;
    const offset = document.querySelector<HTMLElement>(".crm-topbar")?.offsetHeight ?? 64;
    if (wrap.current) wrap.current.style.top = `${offset}px`;
    const io = new IntersectionObserver(
      ([e]) => setOn(!e.isIntersecting && e.boundingClientRect.top < offset),
      { rootMargin: `-${offset}px 0px 0px 0px` },
    );
    io.observe(hero);
    return () => io.disconnect();
  }, [watch]);

  return (
    <div className="sid-wrap" ref={wrap} style={{ top: 64 }}>
      <div
        className={`sid${on ? " on" : ""}`}
        style={accent ? ({ "--accent": accent } as CSSProperties) : undefined}
        aria-hidden={!on}
        inert={!on}
      >
        {children}
      </div>
    </div>
  );
}
