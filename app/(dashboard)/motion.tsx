"use client";

import { MotionConfig, motion } from "motion/react";
import type { ReactNode } from "react";

// iOS-like ease-out: fast start, long soft landing (same curve as --ease-ios).
const EASE = [0.32, 0.72, 0, 1] as const;

/**
 * Fades and slides its children up into place on mount. Use one per page
 * section with increasing `delay` for a gentle cascade. Server Components can
 * pass server-rendered children through it.
 *
 * reducedMotion="user": people with "Reduce motion" on get no movement.
 */
export function FadeIn({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay }}
        className={className}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
