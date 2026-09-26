import { useCitySearch } from './useCitySearch';
import type { CitySuggestion } from './types';

interface CitySearchInputProps {
  placeholder?: string;
  onSelect: (city: CitySuggestion) => void;
}

/**
 * Campo de pesquisa de cidade com sugestões (geocoding Open-Meteo).
 * Usa-se para o estudante escolher a cidade de destino Erasmus.
 */
export function CitySearchInput({
  placeholder = 'Pesquisar cidade…',
  onSelect,
}: CitySearchInputProps) {
  const { query, setQuery, suggestions, loading, error } = useCitySearch();

  const handleSelect = (city: CitySuggestion) => {
    onSelect(city);
    setQuery('');
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label="Pesquisar cidade"
        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {loading && (
        <p className="mt-1 text-xs text-slate-400">A pesquisar…</p>
      )}

      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}

      {!loading && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg"
        >
          {suggestions.map((city) => (
            <li key={city.id}>
              <button
                type="button"
                role="option"
                onClick={() => handleSelect(city)}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {city.name}
                {city.admin1 ? `, ${city.admin1}` : ''}
                {city.country ? ` — ${city.country}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
