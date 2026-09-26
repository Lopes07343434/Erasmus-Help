/** Resposta de exemplo da Open-Meteo, usada em vários testes. */
export const sampleOpenMeteoResponse = {
  latitude: 38.7167,
  longitude: -9.1333,
  timezone: 'Europe/Lisbon',
  current: {
    time: '2026-09-25T12:00',
    temperature_2m: 22.4,
    relative_humidity_2m: 55,
    apparent_temperature: 21.8,
    is_day: 1,
    precipitation: 0,
    weather_code: 1,
    cloud_cover: 20,
    wind_speed_10m: 14.2,
    wind_gusts_10m: 25.1,
  },
  daily: {
    time: ['2026-09-25', '2026-09-26', '2026-09-27'],
    weather_code: [1, 61, 0],
    temperature_2m_max: [24, 19, 23],
    temperature_2m_min: [16, 14, 15],
    precipitation_probability_max: [5, 80, 0],
    uv_index_max: [6, 3, 7],
    sunrise: ['2026-09-25T07:10', '2026-09-26T07:11', '2026-09-27T07:12'],
    sunset: ['2026-09-25T19:40', '2026-09-26T19:38', '2026-09-27T19:36'],
  },
};

export const sampleGeocodingResponse = {
  results: [
    {
      id: 2267057,
      name: 'Lisboa',
      latitude: 38.71667,
      longitude: -9.13333,
      timezone: 'Europe/Lisbon',
      country: 'Portugal',
      country_code: 'PT',
      admin1: 'Lisboa',
    },
    {
      id: 2988507,
      name: 'Paris',
      latitude: 48.85341,
      longitude: 2.3488,
      timezone: 'Europe/Paris',
      country: 'França',
      country_code: 'FR',
      admin1: 'Île-de-France',
    },
  ],
};

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.ok === false ? 'Error' : 'OK',
    json: async () => body,
  } as Response;
}

export function mockFetchOnce(body: unknown, init?: { ok?: boolean; status?: number }) {
  return jsonResponse(body, init);
}
