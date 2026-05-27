'use client';

import { useState, useRef, useEffect } from 'react';

interface TextSwapProps {
  text: string;
  className?: string;
}

/**
 * Swaps text in place with a blurred up-and-out / down-and-in transition.
 *
 * Three-phase sequence (transitions.dev 04-text-states-swap):
 *   1. Add .is-exit        — old text slides up + blurs + fades (150ms)
 *   2. el.textContent =    — write new text directly into DOM (no flushSync —
 *      target               flushSync is unsafe in React 18 concurrent mode
 *                           when called alongside async state dispatches)
 *   3. is-enter-start      — jump to "below, invisible, no transition"
 *      reflow              — force layout so transition has a start point
 *      remove enter-start  — new text animates back to rest
 *   4. setCurrent(target)  — sync React state so next renders stay consistent
 *
 * inFlight guard prevents overlapping animations; latestText always tracks
 * the most recent prop so rapid updates converge on the final value.
 */
export default function TextSwap({ text, className }: TextSwapProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [current, setCurrent] = useState(text);
  const inFlight = useRef(false);
  const latestText = useRef(text);

  useEffect(() => {
    latestText.current = text;
    if (text === current || inFlight.current) return;

    const el = ref.current;
    if (!el) return;

    inFlight.current = true;
    el.classList.add('is-exit');

    const timer = setTimeout(() => {
      const target = latestText.current;
      const el2 = ref.current;
      if (!el2) { inFlight.current = false; return; }

      // Write directly to the DOM — avoids flushSync which throws in
      // React 18 concurrent mode when called during in-flight dispatches.
      // setCurrent below then syncs React's state so the next render is clean.
      el2.textContent = target;
      el2.classList.remove('is-exit');
      el2.classList.add('is-enter-start');
      void el2.offsetHeight; // force reflow so transition has a start point
      el2.classList.remove('is-enter-start');

      inFlight.current = false;
      // Sync React state — DOM already has `target`, so this re-render is a no-op.
      setCurrent(target);
    }, 150);

    return () => clearTimeout(timer);
  }, [text, current]);

  return (
    <span ref={ref} className={`t-text-swap${className ? ` ${className}` : ''}`}>
      {current}
    </span>
  );
}
