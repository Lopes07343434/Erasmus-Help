/**
 * Cliente para a API gratuita da Open-Meteo (https://open-meteo.com).
 * Não requer chave de API. Suporta CORS, por isso pode ser chamada
 * diretamente do browser.
 */

import type { Coordinates, WeatherData, CurrentWeather, DailyForecast } from './types';

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

const CURRENT_PARAMS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
  'wind_gusts_10m',
].join(',');

const DAILY_PARAMS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
  'uv_index_max',
  'sunrise',
  'sunset',
].join(',');

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    is_day: number;
    precipitation: number;
    weather_code: number;
    cloud_cover: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    uv_index_max: number[];
    sunrise: string[];
    sunset: string[];
  };
}

export interface FetchWeatherOptions {
  /** Número de dias de previsão a pedir (1–16). Por omissão: 5. */
  forecastDays?: number;
  signal?: AbortSignal;
}

/** Erro lançado quando não há rede — útil numa PWA para distinguir de um erro da API */
export class OfflineError extends Error {
  constructor() {
    super('Sem ligação à internet.');
    this.name = 'OfflineError';
  }
}

export async function fetchWeather(
  { latitude, longitude }: Coordinates,
  { forecastDays = 5, signal }: FetchWeatherOptions = {}
): Promise<WeatherData> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new OfflineError();
  }

  const url = new URL(BASE_URL);
  url.searchParams.set('latitude', latitude.toFixed(4));
  url.searchParams.set('longitude', longitude.toFixed(4));
  url.searchParams.set('current', CURRENT_PARAMS);
  url.searchParams.set('daily', DAILY_PARAMS);
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', String(forecastDays));

  const response = await fetch(url.toString(), { signal });

  if (!response.ok) {
    throw new Error(`Open-Meteo respondeu ${response.status}: ${response.statusText}`);
  }

  const data: OpenMeteoResponse = await response.json();

  const current: CurrentWeather = {
    time: data.current.time,
    temperature: data.current.temperature_2m,
    apparentTemperature: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    isDay: data.current.is_day === 1,
    precipitation: data.current.precipitation,
    weatherCode: data.current.weather_code,
    cloudCover: data.current.cloud_cover,
    windSpeed: data.current.wind_speed_10m,
    windGusts: data.current.wind_gusts_10m,
  };

  const daily: DailyForecast[] = data.daily.time.map((date, i) => ({
    date,
    weatherCode: data.daily.weather_code[i],
    tempMax: data.daily.temperature_2m_max[i],
    tempMin: data.daily.temperature_2m_min[i],
    precipitationProbability: data.daily.precipitation_probability_max[i],
    uvIndexMax: data.daily.uv_index_max?.[i],
    sunrise: data.daily.sunrise[i],
    sunset: data.daily.sunset[i],
  }));

  return {
    latitude: data.latitude,
    longitude: data.longitude,
    timezone: data.timezone,
    current,
    daily,
  };
}
