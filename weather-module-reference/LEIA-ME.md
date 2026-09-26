# Módulo de meteorologia — versão de referência (não integrada)

Estes ficheiros foram feitos numa conversa antes de eu ver que a Erasmus Help **já tem**
um módulo de meteorologia completo e testado em `src/services/weather/`,
`src/services/geo/` e `src/hooks/useWeather.ts` (cache stale-while-revalidate, erros
`AppError`, integração com `profileStore`/`settingsStore`, revalidação ao reconectar, etc.
— bem mais avançado do que isto).

Por isso, a teu pedido, estes ficheiros estão aqui só como referência, numa pasta à parte
(`weather-module-reference/`), **fora de `src/`** — não são importados por nada na app e
não vão para o build (`tsc -b` / `vite build`) nem para os testes (`npm test`), porque não
usam o alias `@/` nem seguem a arquitetura do projeto (services com interface `Provider`,
`AppError`, i18n, zustand).

Não os copies para dentro de `src/` sem adaptar — vão colidir com `hooks/useWeather.ts` e
`hooks/useCitySearch.ts` que já existem e estão em uso.

## O que está aqui

- `src/features/weather/weatherApi.ts`, `geocoding.ts` — chamadas diretas à Open-Meteo
  (tempo atual + previsão) e à API de geocoding, sem passar pelo `AppError`/cache do projeto.
- `useWeather.ts`, `useCitySearch.ts` — hooks React equivalentes, mas standalone.
- `WeatherWidget.tsx`, `CitySearchInput.tsx` — componentes Tailwind genéricos (não usam o
  design system da Erasmus Help — `GlassCard`, `StateView`, `WeatherIcon`, tokens `eh-*`).
- `__tests__/` — testes Vitest + Testing Library para tudo acima; corridos e a passar
  (18/18) fora deste projeto, com React 18. Dentro da Erasmus Help (React 19) precisariam
  de ajuste.

## Se um dia quiseres aproveitar alguma coisa daqui

A única peça que falta mesmo no projeto é a UI: `DashboardPage.tsx` ainda é um placeholder
e não há um `WeatherCard` ligado a `hooks/useWeather.ts`. Se quiseres isso feito a sério,
o caminho certo é um componente novo em `src/components/weather/` que:
- recebe os dados de `useWeather(location)` (já existe, não mexer),
- usa `WeatherIcon` (já existe) para o ícone,
- usa `GlassCard` + `StateView`/`LoadingState`/`ErrorState`/`OfflineBanner` (já existem em
  `components/feedback`) para os estados loading/success/error/offline,
- usa `useI18n()` com o namespace `weather` (mensagens em `i18n/messages/*/weather.ts`) —
  nunca texto fixo.

Basta pedir e faço isso à parte, sem tocar no que já está feito.
