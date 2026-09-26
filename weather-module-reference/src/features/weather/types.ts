/**
 * Tipos usados pelo módulo de meteorologia (Open-Meteo) da Erasmus Help.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface CurrentWeather {
  time: string;
  /** Temperatura do ar a 2m, em °C */
  temperature: number;
  /** Temperatura aparente (sensação térmica), em °C */
  apparentTemperature: number;
  /** Humidade relativa a 2m, em % */
  humidity: number;
  isDay: boolean;
  /** Precipitação total na última hora, em mm */
  precipitation: number;
  /** Código de tempo WMO — ver weatherCodes.ts */
  weatherCode: number;
  /** Cobertura de nuvens, em % */
  cloudCover: number;
  /** Velocidade do vento a 10m, em km/h */
  windSpeed: number;
  /** Rajadas de vento a 10m, em km/h */
  windGusts: number;
}

export interface DailyForecast {
  /** Data no formato ISO (YYYY-MM-DD) */
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  /** Probabilidade máxima de precipitação nesse dia, em % */
  precipitationProbability: number;
  uvIndexMax?: number;
  sunrise: string;
  sunset: string;
}

export interface WeatherData {
  latitude: number;
  longitude: number;
  timezone: string;
  current: CurrentWeather;
  daily: DailyForecast[];
}

/** Um resultado de pesquisa de cidade (API de geocoding da Open-Meteo) */
export interface CitySuggestion {
  id: number;
  name: string;
  /** Nome do país (ex: "Portugal") */
  country: string;
  /** Código ISO do país (ex: "PT") */
  countryCode?: string;
  /** Região/distrito, quando disponível (ex: "Lisboa") */
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}
