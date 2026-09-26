import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WeatherWidget } from '../WeatherWidget';
import { mockFetchOnce, sampleOpenMeteoResponse } from './fixtures';

function stubGeolocation(coords = { latitude: 38.7167, longitude: -9.1333 }) {
  Object.defineProperty(global.navigator, 'geolocation', {
    value: {
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        success({ coords: { ...coords } } as GeolocationPosition);
      }),
    },
    configurable: true,
  });
}

describe('<WeatherWidget />', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    stubGeolocation();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mostra um estado de carregamento e depois a temperatura', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchOnce(sampleOpenMeteoResponse));

    render(<WeatherWidget />);

    expect(screen.getByTestId('weather-widget-loading')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('22°C')).toBeInTheDocument());
    expect(screen.getByText(/poucas nuvens/i)).toBeInTheDocument();
  });

  it('mostra o título passado por props', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchOnce(sampleOpenMeteoResponse));

    render(<WeatherWidget title="Lisboa" coordinates={{ latitude: 38.7167, longitude: -9.1333 }} />);

    await waitFor(() => expect(screen.getByText('Lisboa')).toBeInTheDocument());
  });

  it('mostra um alerta e permite tentar de novo quando o pedido falha', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'));

    render(<WeatherWidget />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
  });
});
