import type { NamespaceShape } from '../../types'

const weather: NamespaceShape<'weather'> = {
  title: 'Pogoda',
  conditions: {
    clear: 'Bezchmurnie',
    mainlyClear: 'Małe zachmurzenie',
    partlyCloudy: 'Częściowe zachmurzenie',
    overcast: 'Pochmurno',
    fog: 'Mgła',
    drizzle: 'Mżawka',
    rain: 'Deszcz',
    freezingRain: 'Marznący deszcz',
    snow: 'Śnieg',
    rainShowers: 'Przelotne opady deszczu',
    snowShowers: 'Przelotne opady śniegu',
    thunderstorm: 'Burza',
  },
  feel: {
    cold: 'Zimno',
    cool: 'Chłodno',
    comfortable: 'Przyjemnie',
    hot: 'Gorąco',
  },
  fields: {
    temperature: 'Temperatura',
    min: 'Min.',
    max: 'Maks.',
    rainChance: 'Prawdopodobieństwo opadów',
    rainChanceShort: 'Opady',
    feelsLike: 'Odczuwalna',
    condition: 'Warunki pogodowe',
  },
  values: {
    degrees: '{value}°',
    percent: '{value}%',
  },
  a11y: {
    current: 'Pogoda w {city}: {condition}, {temperature} stopni',
    currentNoCondition: 'Pogoda w {city}: {temperature} stopni',
  },
  states: {
    loading: 'Ładowanie pogody…',
    emptyTitle: 'Nie ustawiono lokalizacji',
    emptyBody: 'Podaj kraj i miasto, aby zobaczyć lokalną pogodę.',
    emptyAction: 'Ustaw lokalizację',
    stale: 'Ostatnia aktualizacja: {ago}',
    unavailableTitle: 'Pogoda niedostępna',
    unavailableBody: 'Nie udało się teraz pobrać pogody. Spróbuj za chwilę.',
    offlineTitle: 'Brak połączenia',
    offlineBody: 'Pogoda zaktualizuje się, gdy znów będziesz online.',
    cityNotFoundTitle: 'Nie znaleziono miasta',
    cityNotFoundBody: 'Nie udało się znaleźć Twojego miasta. Sprawdź lokalizację w Profilu.',
    notConfigured: 'Pogoda nie jest dostępna w tej wersji.',
  },
  attribution: 'Dane pogodowe: Open-Meteo.com',
}
export default weather
