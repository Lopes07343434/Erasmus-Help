import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchCities } from '../geocoding';
import { mockFetchOnce, sampleGeocodingResponse } from './fixtures';

describe('searchCities', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('não chama a API para pesquisas com menos de 2 caracteres', async () => {
    const results = await searchCities('L');
    expect(results).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('devolve as cidades encontradas, normalizadas', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchOnce(sampleGeocodingResponse));

    const results = await searchCities('Lisboa');

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: 2267057,
      name: 'Lisboa',
      country: 'Portugal',
      countryCode: 'PT',
      admin1: 'Lisboa',
      latitude: 38.71667,
      longitude: -9.13333,
      timezone: 'Europe/Lisbon',
    });
  });

  it('devolve lista vazia quando a API não encontra resultados', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchOnce({}));

    const results = await searchCities('cidadeinexistentexyz');

    expect(results).toEqual([]);
  });

  it('lança erro quando a API responde com um estado de erro', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchOnce({}, { ok: false, status: 503 }));

    await expect(searchCities('Lisboa')).rejects.toThrow(/503/);
  });
});
