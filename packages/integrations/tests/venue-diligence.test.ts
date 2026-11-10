import { describe, expect, it } from 'vitest';
import { createVenueClient, priceLevelOf, venueFactsFrom, VenueError } from '../src/venue';
import { riskTier } from '../src/diligence';

describe('venue facts', () => {
  it('reads Google\'s price level only when it is a plain $ level', () => {
    expect(priceLevelOf('$$')).toBe(2);
    expect(priceLevelOf('$$$$')).toBe(4);
    expect(priceLevelOf('$30–50')).toBeNull();
    expect(priceLevelOf(undefined)).toBeNull();
  });
  it('tells a restaurant from a bar-first venue', () => {
    const r = venueFactsFrom('Alder & Vine, San Francisco', { title: 'Alder & Vine', categoryName: 'American restaurant', categories: ['American restaurant', 'Wine bar'], price: '$$$', url: 'https://maps.google.com/x' });
    expect(r).toMatchObject({ found: true, isRestaurant: true, isBarFirst: false, priceLevel: 3, source: 'https://maps.google.com/x' });
    const b = venueFactsFrom('Li Po', { title: 'Li Po Cocktail Lounge', categoryName: 'Cocktail bar', categories: ['Cocktail bar', 'Lounge'] });
    expect(b).toMatchObject({ isRestaurant: false, isBarFirst: true });
  });
  it('reports a venue it cannot find as not found', () => {
    expect(venueFactsFrom('Nowhere', undefined)).toMatchObject({ found: false, name: null, isBarFirst: false });
  });
  it('needs an Apify token and sends it as a bearer header', async () => {
    await expect(createVenueClient({ token: '' }).lookup('x')).rejects.toThrow(VenueError);
    let auth = '';
    const fetchFn = (async (_url: string, init: RequestInit) => {
      auth = new Headers(init.headers).get('authorization') ?? '';
      return new Response(JSON.stringify([{ title: 'Tosca Cafe', categoryName: 'Bar', price: '$$' }]));
    }) as unknown as typeof fetch;
    const v = await createVenueClient({ token: 'test-token', fetchFn }).lookup('Tosca Cafe, San Francisco');
    expect(auth).toBe('Bearer test-token');
    expect(v).toMatchObject({ name: 'Tosca Cafe', isBarFirst: true, priceLevel: 2 });
  });
});

describe('riskTier (risk first, no model involved)', () => {
  const h = (foodCents: number, foodPayments: number, payers: { name: string; cents: number; payments: number }[] = [], totalCents = foodCents) => ({ foodCents, foodPayments, payers, totalCents });
  it('is none with no payments, high over the annual meal limit', () => {
    expect(riskTier(h(0, 0)).tier).toBe('none');
    expect(riskTier(h(250_000, 40)).tier).toBe('high');
  });
  it('is medium past half the limit, or many meals mostly from one company', () => {
    expect(riskTier(h(120_000, 10)).tier).toBe('medium');
    expect(riskTier(h(30_000, 15, [{ name: 'Acme', cents: 25_000, payments: 13 }], 30_000)).tier).toBe('medium');
  });
  it('is low otherwise, and says why in dollars', () => {
    const r = riskTier(h(4_500, 3));
    expect(r).toEqual({ tier: 'low', why: '$45.00 in food and beverage across 3 meals' });
  });
});
