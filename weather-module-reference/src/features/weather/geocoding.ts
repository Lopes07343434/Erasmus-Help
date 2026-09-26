/**
 * Cliente para a API de geocoding gratuita da Open-Meteo
 * (https://open-meteo.com/en/docs/geocoding-api), usada para pesquisar
 * cidades por nome — útil para o estudante Erasmus escolher a sua cidade
 * de destino em vez de depender só da localização do dispositivo.
 * Não requer chave de API.
 */

import type { CitySuggestion } from './types';

const BASE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country?: string;
  country_code?: string;
  admin1?: string;
}

interface GeocodingResponse {
  results?: GeocodingResult[];
}

export interface SearchCitiesOptions {
  /** Número máximo de resultados (1–100). Por omissão: 5. */
  count?: number;
  /** Idioma dos nomes devolvidos (ex: "pt", "en", "fr"). Por omissão: "pt". */
  language?: string;
  signal?: AbortSignal;
}

/**
 * Pesquisa cidades pelo nome. Devolve uma lista vazia se a pesquisa
 * tiver menos de 2 caracteres ou não encontrar nada — nunca lança erro
 * por não haver resultados.
 */
export async function searchCities(
  query: string,
  { count = 5, language = 'pt', signal }: SearchCitiesOptions = {}
): Promise<CitySuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const url = new URL(BASE_URL);
  url.searchParams.set('name', trimmed);
  url.searchParams.set('count', String(count));
  url.searchParams.set('language', language);
  url.searchParams.set('format', 'json');

  const response = await fetch(url.toString(), { signal });

  if (!response.ok) {
    throw new Error(`Open-Meteo geocoding respondeu ${response.status}: ${response.statusText}`);
  }

  const data: GeocodingResponse = await response.json();

  return (data.results ?? []).map((result) => ({
    id: result.id,
    name: result.name,
    country: result.country ?? '',
    countryCode: result.country_code,
    admin1: result.admin1,
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone,
  }));
}
