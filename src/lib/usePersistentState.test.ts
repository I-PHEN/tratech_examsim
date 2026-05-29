// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistentState } from './usePersistentState';

beforeEach(() => sessionStorage.clear());

describe('usePersistentState', () => {
  it('returns initial when storage is empty', () => {
    const { result } = renderHook(() => usePersistentState('t.empty', 'default'));
    expect(result.current[0]).toBe('default');
  });

  it('returns the stored value when present', () => {
    sessionStorage.setItem('examsim:t.preset', JSON.stringify(42));
    const { result } = renderHook(() => usePersistentState('t.preset', 0));
    expect(result.current[0]).toBe(42);
  });

  it('persists updates to sessionStorage', () => {
    const { result } = renderHook(() => usePersistentState('t.write', 'a'));
    act(() => result.current[1]('b'));
    expect(result.current[0]).toBe('b');
    expect(sessionStorage.getItem('examsim:t.write')).toBe(JSON.stringify('b'));
  });

  it('falls back to initial on corrupt JSON without throwing', () => {
    sessionStorage.setItem('examsim:t.corrupt', '{not json');
    const { result } = renderHook(() => usePersistentState('t.corrupt', 'safe'));
    expect(result.current[0]).toBe('safe');
  });

  it('supports functional updaters', () => {
    const { result } = renderHook(() => usePersistentState('t.fn', 1));
    act(() => result.current[1]((prev) => prev + 1));
    expect(result.current[0]).toBe(2);
    expect(sessionStorage.getItem('examsim:t.fn')).toBe(JSON.stringify(2));
  });
});
