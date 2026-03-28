import { useState, useRef, useCallback } from 'react';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30000; // 30 seconds

export default function useRateLimit() {
  const [lockedUntil, setLockedUntil] = useState(null);
  const attempts = useRef(0);

  const checkLimit = useCallback(() => {
    if (lockedUntil && Date.now() < lockedUntil) {
      const seconds = Math.ceil((lockedUntil - Date.now()) / 1000);
      return `Muitas tentativas. Aguarde ${seconds}s.`;
    }
    if (lockedUntil && Date.now() >= lockedUntil) {
      setLockedUntil(null);
      attempts.current = 0;
    }
    return null;
  }, [lockedUntil]);

  const recordAttempt = useCallback(() => {
    attempts.current += 1;
    if (attempts.current >= MAX_ATTEMPTS) {
      const multiplier = Math.min(attempts.current - MAX_ATTEMPTS + 1, 4);
      setLockedUntil(Date.now() + LOCKOUT_MS * multiplier);
    }
  }, []);

  const reset = useCallback(() => {
    attempts.current = 0;
    setLockedUntil(null);
  }, []);

  return { checkLimit, recordAttempt, reset, isLocked: lockedUntil && Date.now() < lockedUntil };
}
