'use client';

import { useRef, useEffect } from 'react';

interface DigitCountProps {
  value: number;
  className?: string;
}

/**
 * Renders a number as individual character spans with the t-digit-group CSS.
 * On each value change the digits replay the number pop-in animation:
 * remove .is-animating → force reflow → re-add .is-animating.
 * No animation on first mount — the parent's enter animation handles that.
 */
export default function DigitCount({ value, className }: DigitCountProps) {
  const groupRef = useRef<HTMLSpanElement>(null);
  const prevValue = useRef<number | null>(null);

  useEffect(() => {
    // Skip the very first render so we don't fight the parent's framer-motion entry.
    if (prevValue.current === null) {
      prevValue.current = value;
      return;
    }
    if (prevValue.current === value) return;
    prevValue.current = value;

    const group = groupRef.current;
    if (!group) return;

    group.classList.remove('is-animating');
    void group.offsetHeight; // force reflow so keyframes restart
    group.classList.add('is-animating');
  }, [value]);

  const chars = String(value).split('');

  return (
    <span ref={groupRef} className={`t-digit-group${className ? ` ${className}` : ''}`}>
      {chars.map((ch, i) => {
        // Stagger the last two characters per the skill spec
        const fromEnd = chars.length - 1 - i;
        const stagger = fromEnd === 0 ? '2' : fromEnd === 1 ? '1' : undefined;
        return (
          <span
            key={i}
            className="t-digit"
            {...(stagger ? { 'data-stagger': stagger } : {})}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}
