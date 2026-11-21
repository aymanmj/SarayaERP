import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosResponse } from 'axios';
import { useIdempotentPost } from './useIdempotentPost';
const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/api/apiClient', () => ({ apiClient: { post } }));
const rejected = (status: number) => new AxiosError('rejected', undefined, undefined, undefined, { status } as AxiosResponse);
describe('durable identity during an uncertain request', () => {
  beforeEach(() => { post.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('generates a v4 request ID on local HTTP without crypto.randomUUID', async () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(255) });
    post.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useIdempotentPost('scope'));
    await act(async () => { await result.current.submit('/vitals/encounter/3', { pulse: 70 }); });
    expect(post.mock.calls[0][1].requestId).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
  it('retries the exact original body, then permits a new operation after confirmation', async () => {
    post.mockRejectedValueOnce(new Error('lost reply')).mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useIdempotentPost('staff:1:patient:2'));
    await act(async () => { await expect(result.current.submit('/deposit', { amount: '0.001' })).rejects.toThrow(); });
    const original = post.mock.calls[0][1];
    expect(original.requestId).toMatch(/^[a-f0-9-]{36}$/);
    await act(async () => { await result.current.submit('/deposit', { amount: '999' }); });
    expect(post.mock.calls[1][1]).toEqual(original);
    expect(result.current.pending).toBeNull();
    await act(async () => { await result.current.submit('/deposit', { amount: '1.000' }); });
    expect(post.mock.calls[2][1].requestId).not.toBe(original.requestId);
  });
  it('does not replay an uncertain request as a different staff member or patient', async () => {
    post.mockRejectedValue(new Error('lost reply'));
    const { result, rerender } = renderHook(({ scope }) => useIdempotentPost(scope), { initialProps: { scope: 'staff1:patient2' } });
    await act(async () => { await expect(result.current.submit('/deposit', {})).rejects.toThrow(); });
    expect(result.current.pending?.scope).toBe('staff1:patient2');
    rerender({ scope: 'staff2:patient2' });
    await act(async () => { await expect(result.current.retry()).rejects.toThrow('السابق'); });
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('retains uncertainty even if a retry returns a later definitive rejection', async () => {
    post.mockRejectedValueOnce(new Error('timeout')).mockRejectedValueOnce(rejected(403));
    const { result } = renderHook(() => useIdempotentPost('scope'));
    await act(async () => { await expect(result.current.submit('/administer', {})).rejects.toThrow(); });
    await act(async () => { await expect(result.current.retry()).rejects.toThrow(); });
    expect(result.current.pending).not.toBeNull();
  });
  it('permits correction after a first definitive validation rejection', async () => {
    post.mockRejectedValueOnce(rejected(400));
    const { result } = renderHook(() => useIdempotentPost('scope'));
    await act(async () => { await expect(result.current.submit('/deposit', {})).rejects.toThrow(); });
    expect(result.current.pending).toBeNull();
  });
  it('preserves the original medication request when the gateway throttles it', async () => {
    post.mockRejectedValueOnce(rejected(429)).mockResolvedValueOnce({ data: { id: 5 } });
    const { result } = renderHook(() => useIdempotentPost('staff:1:patient:2'));
    await act(async () => { await expect(result.current.submit('/administer', { prescriptionItemId: 3 })).rejects.toThrow(); });
    expect(result.current.pending?.body.requestId).toBe(post.mock.calls[0][1].requestId);
    await act(async () => { await result.current.retry(); });
    expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
    expect(result.current.pending).toBeNull();
  });
  it('prevents two simultaneous posts before React renders again', async () => {
    let finish!: (value: unknown) => void;
    post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useIdempotentPost('scope'));
    await act(async () => {
      const first = result.current.submit('/deposit', {});
      await expect(result.current.submit('/deposit', {})).rejects.toThrow('قيد التنفيذ');
      finish({ data: {} }); await first;
    });
    expect(post).toHaveBeenCalledTimes(1);
  });
});
