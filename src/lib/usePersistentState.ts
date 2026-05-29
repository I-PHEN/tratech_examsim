import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';

const PREFIX = 'examsim:';

function readInitial<T>(key: string, initial: T): T {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (raw === null) return initial;
    return JSON.parse(raw) as T;
  } catch {
    return initial;
  }
}

export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readInitial(key, initial));

  useEffect(() => {
    // Swallow QuotaExceeded / serialization errors — persisted UI state isn't load-bearing.
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* noop */
    }
  }, [key, value]);

  return [value, setValue];
}
