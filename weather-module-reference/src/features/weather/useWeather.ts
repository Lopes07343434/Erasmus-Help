import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWeather, OfflineError } from './weatherApi';
import type { Coordinates, WeatherData } from './types';

interface UseWeatherOptions {
  /**
   * Coordenadas a consultar (ex: a cidade Erasmus escolhida pelo estudante).
   * Se omitido, tenta usar a geolocalização do browser.
   */
  coordinates?: Coordinates;
  /** Coordenadas de recurso caso a geolocalização falhe, seja recusada ou não exista */
  fallbackCoordinates?: Coordinates;
  /** Intervalo de atualização automática em ms (0 desativa). Por omissão: 15 min. */
  refreshIntervalMs?: number;
}

interface UseWeatherResult {
  weather: WeatherData | null;
  loading: boolean;
  error: string | null;
  /** true quando o último erro foi por falta de rede (útil para a PWA mostrar um aviso diferente) */
  offline: boolean;
  refresh: () => void;
}

// Lisboa, como localização de recurso
const DEFAULT_FALLBACK: Coordinates = { latitude: 38.7167, longitude: -9.1333 };

export function useWeather({
  coordinates,
  fallbackCoordinates = DEFAULT_FALLBACK,
  refreshIntervalMs = 15 * 60 * 1000,
}: UseWeatherOptions = {}): UseWeatherResult {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (coords: Coordinates) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setOffline(false);
    try {
      const data = await fetchWeather(coords, { signal: controller.signal });
      setWeather(data);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      if (err instanceof OfflineError) {
        setOffline(true);
        setError('Sem ligação à internet. A mostrar os últimos dados disponíveis.');
      } else {
        setError('Não foi possível obter os dados meteorológicos.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Usamos as coordenadas como valores primitivos (não o objeto) nas dependências:
  // um consumidor que passe `coordinates={{ latitude, longitude }}` inline em cada
  // render criaria uma nova referência a cada vez, o que recriava este callback,
  // reexecutava o efeito abaixo e entrava num ciclo infinito de pedidos.
  const coordLat = coordinates?.latitude;
  const coordLon = coordinates?.longitude;
  const fallbackLat = fallbackCoordinates.latitude;
  const fallbackLon = fallbackCoordinates.longitude;

  const resolveCoordinatesAndLoad = useCallback(() => {
    if (coordLat !== undefined && coordLon !== undefined) {
      load({ latitude: coordLat, longitude: coordLon });
      return;
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      load({ latitude: fallbackLat, longitude: fallbackLon });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        load({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        // utilizador recusou a permissão ou falhou — usa o fallback
        load({ latitude: fallbackLat, longitude: fallbackLon });
      },
      { timeout: 8000 }
    );
  }, [coordLat, coordLon, fallbackLat, fallbackLon, load]);

  useEffect(() => {
    resolveCoordinatesAndLoad();

    if (refreshIntervalMs <= 0) return;
    const interval = setInterval(resolveCoordinatesAndLoad, refreshIntervalMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveCoordinatesAndLoad, refreshIntervalMs]);

  return { weather, loading, error, offline, refresh: resolveCoordinatesAndLoad };
}
