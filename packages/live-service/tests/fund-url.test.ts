// "View in Ramp" links: built from the API host unless RAMP_FUND_URL overrides them. No database needed.
import { describe, expect, it } from 'vitest';
import { rampFundUrl } from '../src/from-env';

describe('rampFundUrl', () => {
  it('points sandbox funds at the sandbox web app', () => {
    expect(rampFundUrl({ RAMP_BASE_URL: 'https://demo-api.ramp.com' })('abc')).toBe('https://demo.ramp.com/funds/abc');
    expect(rampFundUrl({})('abc')).toBe('https://demo.ramp.com/funds/abc');
  });

  it('points production funds at app.ramp.com', () => {
    expect(rampFundUrl({ RAMP_BASE_URL: 'https://api.ramp.com' })('abc')).toBe('https://app.ramp.com/funds/abc');
  });

  it('uses RAMP_FUND_URL as a template when set', () => {
    expect(rampFundUrl({ RAMP_FUND_URL: 'https://demo.ramp.com/spend/funds/{fundId}/overview' })('a b'))
      .toBe('https://demo.ramp.com/spend/funds/a%20b/overview');
  });
});
