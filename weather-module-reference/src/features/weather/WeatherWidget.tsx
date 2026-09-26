import { useWeather } from './useWeather';
import { getWeatherCodeInfo } from './weatherCodes';
import type { Coordinates } from './types';

interface WeatherWidgetProps {
  /** Título opcional acima do widget (ex: nome da cidade de destino) */
  title?: string;
  /** Mostrar a previsão dos próximos dias */
  showForecast?: boolean;
  /** Coordenadas fixas (ex: a cidade Erasmus escolhida). Sem isto, usa a localização do dispositivo. */
  coordinates?: Coordinates;
}

export function WeatherWidget({ title, showForecast = true, coordinates }: WeatherWidgetProps) {
  const { weather, loading, error, offline, refresh } = useWeather(
    coordinates ? { coordinates } : {}
  );

  if (loading && !weather) {
    return (
      <div
        data-testid="weather-widget-loading"
        className="animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800 p-4 h-32"
      />
    );
  }

  if (error && !weather) {
    return (
      <div
        role="alert"
        className="rounded-2xl bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-3"
      >
        <span>{error}</span>
        <button onClick={refresh} className="underline font-medium whitespace-nowrap">
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!weather) return null;

  const { current, daily } = weather;
  const info = getWeatherCodeInfo(current.weatherCode);

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {title ?? 'Condições atuais'}
        </h3>
        <button
          onClick={refresh}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          aria-label="Atualizar meteorologia"
        >
          ↻
        </button>
      </div>

      {offline && (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          Sem ligação — a mostrar os últimos dados guardados.
        </p>
      )}

      <div className="flex items-center gap-3">
        <span className="text-4xl" aria-hidden>
          {info.icon}
        </span>
        <div>
          <p className="text-3xl font-semibold text-slate-900 dark:text-white">
            {Math.round(current.temperature)}°C
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {info.label} · sensação {Math.round(current.apparentTemperature)}°C
          </p>
        </div>
      </div>

      {showForecast && daily.length > 0 && (
        <div className="mt-4 grid grid-cols-5 gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
          {daily.slice(0, 5).map((day) => {
            const dayInfo = getWeatherCodeInfo(day.weatherCode);
            const weekday = new Date(day.date).toLocaleDateString('pt-PT', { weekday: 'short' });
            return (
              <div key={day.date} className="flex flex-col items-center text-center">
                <span className="text-[11px] text-slate-400 capitalize">{weekday}</span>
                <span className="text-lg" aria-hidden>
                  {dayInfo.icon}
                </span>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {Math.round(day.tempMax)}°
                </span>
                <span className="text-[11px] text-slate-400">{Math.round(day.tempMin)}°</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
