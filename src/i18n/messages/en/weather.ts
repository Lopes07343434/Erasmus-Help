import type { NamespaceShape } from '../../types'

const weather: NamespaceShape<'weather'> = {
  title: 'Weather',
  conditions: {
    clear: 'Clear sky',
    mainlyClear: 'Mainly clear',
    partlyCloudy: 'Partly cloudy',
    overcast: 'Overcast',
    fog: 'Fog',
    drizzle: 'Drizzle',
    rain: 'Rain',
    freezingRain: 'Freezing rain',
    snow: 'Snow',
    rainShowers: 'Rain showers',
    snowShowers: 'Snow showers',
    thunderstorm: 'Thunderstorm',
  },
  feel: {
    cold: 'Cold',
    cool: 'Cool',
    comfortable: 'Comfortable',
    hot: 'Hot',
  },
  fields: {
    temperature: 'Temperature',
    min: 'Min',
    max: 'Max',
    rainChance: 'Chance of rain',
    rainChanceShort: 'Rain',
    feelsLike: 'Feels like',
    condition: 'Conditions',
  },
  values: {
    degrees: '{value}°',
    percent: '{value}%',
  },
  a11y: {
    current: 'Weather in {city}: {condition}, {temperature} degrees',
    currentNoCondition: 'Weather in {city}: {temperature} degrees',
  },
  states: {
    loading: 'Loading the weather…',
    emptyTitle: 'No location set',
    emptyBody: 'Add your country and city to see the local weather.',
    emptyAction: 'Set location',
    stale: 'Weather data from {ago}',
    unavailableTitle: 'Weather unavailable',
    unavailableBody: "We couldn't get the weather right now. Try again in a moment.",
    offlineTitle: 'Offline',
    offlineBody: 'The weather will update when you are back online.',
    cityNotFoundTitle: 'City not found',
    cityNotFoundBody: "We couldn't find your city. Check your location in Profile.",
    notConfigured: 'Weather is not enabled in this version.',
  },
  attribution: 'Weather data: Open-Meteo.com',
}
export default weather
