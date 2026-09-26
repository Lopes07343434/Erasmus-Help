import { useEffect, useRef, useState } from 'react';
import { searchCities } from './geocoding';
import type { CitySuggestion } from './types';

interface UseCitySearchResult {
  query: string;
  setQuery: (value: string) => void;
  suggestions: CitySuggestion[];
  loading: boolean;
  error: string | null;
}

/**
 * Pesquisa de cidades com debounce, pronta a ligar a um `<input>`.
 * A pesquisa só dispara com 2+ caracteres.
 */
export function useCitySearch(debounceMs = 300): UseCitySearchResult {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const timeout = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const results = await searchCities(trimmed, { signal: controller.signal });
        setSuggestions(results);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError('Não foi possível pesquisar cidades.');
        }
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(timeout);
  }, [query, debounceMs]);

  return { query, setQuery, suggestions, loading, error };
}
