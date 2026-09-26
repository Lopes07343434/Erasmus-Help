/**
 * Tabela de códigos de tempo WMO devolvidos pela Open-Meteo (campo `weather_code`).
 * Referência: https://open-meteo.com/en/docs (secção "WMO Weather interpretation codes")
 */

export interface WeatherCodeInfo {
  label: string;
  /** Emoji de referência — substituir por um ícone próprio do design system quando fizer sentido */
  icon: string;
  /** Indicação simples de se este tipo de tempo é razoável para sair de casa/caminhar */
  outdoorFriendly: boolean;
}

const WEATHER_CODES: Record<number, WeatherCodeInfo> = {
  0: { label: 'Céu limpo', icon: '☀️', outdoorFriendly: true },
  1: { label: 'Poucas nuvens', icon: '🌤️', outdoorFriendly: true },
  2: { label: 'Parcialmente nublado', icon: '⛅', outdoorFriendly: true },
  3: { label: 'Nublado', icon: '☁️', outdoorFriendly: true },
  45: { label: 'Nevoeiro', icon: '🌫️', outdoorFriendly: false },
  48: { label: 'Nevoeiro com geada', icon: '🌫️', outdoorFriendly: false },
  51: { label: 'Chuvisco fraco', icon: '🌦️', outdoorFriendly: false },
  53: { label: 'Chuvisco moderado', icon: '🌦️', outdoorFriendly: false },
  55: { label: 'Chuvisco forte', icon: '🌧️', outdoorFriendly: false },
  56: { label: 'Chuvisco gelado fraco', icon: '🌧️', outdoorFriendly: false },
  57: { label: 'Chuvisco gelado forte', icon: '🌧️', outdoorFriendly: false },
  61: { label: 'Chuva fraca', icon: '🌧️', outdoorFriendly: false },
  63: { label: 'Chuva moderada', icon: '🌧️', outdoorFriendly: false },
  65: { label: 'Chuva forte', icon: '🌧️', outdoorFriendly: false },
  66: { label: 'Chuva gelada fraca', icon: '🌧️', outdoorFriendly: false },
  67: { label: 'Chuva gelada forte', icon: '🌧️', outdoorFriendly: false },
  71: { label: 'Neve fraca', icon: '🌨️', outdoorFriendly: false },
  73: { label: 'Neve moderada', icon: '🌨️', outdoorFriendly: false },
  75: { label: 'Neve forte', icon: '❄️', outdoorFriendly: false },
  77: { label: 'Grãos de neve', icon: '❄️', outdoorFriendly: false },
  80: { label: 'Aguaceiros fracos', icon: '🌦️', outdoorFriendly: false },
  81: { label: 'Aguaceiros moderados', icon: '🌧️', outdoorFriendly: false },
  82: { label: 'Aguaceiros violentos', icon: '⛈️', outdoorFriendly: false },
  85: { label: 'Aguaceiros de neve fracos', icon: '🌨️', outdoorFriendly: false },
  86: { label: 'Aguaceiros de neve fortes', icon: '❄️', outdoorFriendly: false },
  95: { label: 'Trovoada', icon: '⛈️', outdoorFriendly: false },
  96: { label: 'Trovoada com granizo fraco', icon: '⛈️', outdoorFriendly: false },
  99: { label: 'Trovoada com granizo forte', icon: '⛈️', outdoorFriendly: false },
};

export function getWeatherCodeInfo(code: number): WeatherCodeInfo {
  return WEATHER_CODES[code] ?? { label: 'Desconhecido', icon: '❓', outdoorFriendly: true };
}
