import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWeather } from '../useWeather';
import { mockFetchOnce, sampleOpenMeteoResponse } from './fixtures';

function stubGeolocation(coords = { latitude: 38.7167, longitude: -9.1333 }) {
  Object.defineProperty(global.navigator, 'geolocation', {
    value: {
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        success({ coords: { ...coords } } as GeolocationPosition);
      }),
    },
    configurable: true,
  });
}

describe('useWeather', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    stubGeolocation();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('usa a geolocalização do browser e carrega o tempo', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchOnce(sampleOpenMeteoResponse));

    const { result } = renderHook(() => useWeather({ refreshIntervalMs: 0 }));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.weather?.current.temperature).toBe(22.4);
    expect(result.current.error).toBeNull();
  });

  it('usa coordenadas fixas quando fornecidas, sem pedir geolocalização', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchOnce(sampleOpenMeteoResponse));
    const getCurrentPosition = vi.fn();
    Object.defineProperty(global.navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    });

    const { result } = renderHook(() =>
      useWeather({ coordinates: { latitude: 48.8534, longitude: 2.3488 }, refreshIntervalMs: 0 })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(result.current.weather).not.toBeNull();
  });

  it('define um erro quando o pedido falha', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useWeather({ refreshIntervalMs: 0 }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toMatch(/não foi possível/i);
    expect(result.current.weather).toBeNull();
  });
});
