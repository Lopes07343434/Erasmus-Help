import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWeather, OfflineError } from '../weatherApi';
import { mockFetchOnce, sampleOpenMeteoResponse } from './fixtures';

describe('fetchWeather', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('normaliza a resposta da Open-Meteo para o formato interno', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchOnce(sampleOpenMeteoResponse));

    const weather = await fetchWeather({ latitude: 38.7167, longitude: -9.1333 });

    expect(weather.current.temperature).toBe(22.4);
    expect(weather.current.weatherCode).toBe(1);
    expect(weather.current.isDay).toBe(true);
    expect(weather.daily).toHaveLength(3);
    expect(weather.daily[1]).toMatchObject({
      date: '2026-09-26',
      weatherCode: 61,
      tempMax: 19,
      tempMin: 14,
      precipitationProbability: 80,
    });
  });

  it('chama a Open-Meteo com latitude/longitude e timezone automática', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchOnce(sampleOpenMeteoResponse));

    await fetchWeather({ latitude: 38.7167, longitude: -9.1333 });

    const calledUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(calledUrl.searchParams.get('latitude')).toBe('38.7167');
    expect(calledUrl.searchParams.get('longitude')).toBe('-9.1333');
    expect(calledUrl.searchParams.get('timezone')).toBe('auto');
  });

  it('lança erro quando a API responde com um estado de erro', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchOnce({}, { ok: false, status: 500 })
    );

    await expect(
      fetchWeather({ latitude: 38.7167, longitude: -9.1333 })
    ).rejects.toThrow(/500/);
  });

  it('lança OfflineError sem chamar a API quando o dispositivo está offline', async () => {
    const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    await expect(
      fetchWeather({ latitude: 38.7167, longitude: -9.1333 })
    ).rejects.toBeInstanceOf(OfflineError);
    expect(fetch).not.toHaveBeenCalled();

    if (originalOnLine) {
      Object.defineProperty(navigator, 'onLine', originalOnLine);
    }
  });
});
