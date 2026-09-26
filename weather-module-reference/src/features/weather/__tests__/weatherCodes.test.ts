import { describe, expect, it } from 'vitest';
import { getWeatherCodeInfo } from '../weatherCodes';

describe('getWeatherCodeInfo', () => {
  it('devolve a informação correta para um código conhecido', () => {
    expect(getWeatherCodeInfo(0)).toEqual({
      label: 'Céu limpo',
      icon: '☀️',
      outdoorFriendly: true,
    });
  });

  it('marca códigos de chuva/trovoada como não recomendados para exterior', () => {
    expect(getWeatherCodeInfo(63).outdoorFriendly).toBe(false);
    expect(getWeatherCodeInfo(95).outdoorFriendly).toBe(false);
  });

  it('marca céu limpo/nublado como recomendado para exterior', () => {
    expect(getWeatherCodeInfo(1).outdoorFriendly).toBe(true);
    expect(getWeatherCodeInfo(3).outdoorFriendly).toBe(true);
  });

  it('devolve um valor de recurso para um código desconhecido', () => {
    expect(getWeatherCodeInfo(-1)).toEqual({
      label: 'Desconhecido',
      icon: '❓',
      outdoorFriendly: true,
    });
  });
});
