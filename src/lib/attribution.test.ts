import { describe, expect, it } from 'vitest';
import {
  deviceNameFromUserAgent,
  firstPart,
  parseCount,
  repeatInfo,
  sourceLabel,
  sourceTypeLabel,
} from './attribution';

describe('repeated values joined by "|"', () => {
  it('always uses the first part', () => {
    expect(firstPart('typein|typein')).toBe('typein');
    expect(firstPart('6|6|6')).toBe('6');
    expect(firstPart('12|15')).toBe('12');
    expect(firstPart('google')).toBe('google');
  });

  it('treats blank and missing values as blank', () => {
    expect(firstPart('')).toBe('');
    expect(firstPart('   ')).toBe('');
    expect(firstPart(undefined)).toBe('');
    expect(firstPart(' |google')).toBe('');
  });

  it('detects repeats and whether the parts differ', () => {
    expect(repeatInfo('typein|typein')).toEqual({ repeated: true, differs: false });
    expect(repeatInfo('6|6|6')).toEqual({ repeated: true, differs: false });
    expect(repeatInfo('12|15')).toEqual({ repeated: true, differs: true });
    expect(repeatInfo('6|6|7')).toEqual({ repeated: true, differs: true });
    expect(repeatInfo('typein')).toEqual({ repeated: false, differs: false });
    expect(repeatInfo('')).toEqual({ repeated: false, differs: false });
  });

  it('reads counts from the first part only', () => {
    expect(parseCount('12|15')).toBe(12);
    expect(parseCount('6|6|6')).toBe(6);
    expect(parseCount('')).toBeNull();
    expect(parseCount('n/a')).toBeNull();
    expect(parseCount('2.5')).toBeNull();
  });
});

describe('source labels', () => {
  it('shows typein as Direct', () => {
    expect(sourceTypeLabel('typein')).toBe('Direct');
  });

  it('labels the other known source types and blanks', () => {
    expect(sourceTypeLabel('organic')).toBe('Organic search');
    expect(sourceTypeLabel('referral')).toBe('Referral');
    expect(sourceTypeLabel('utm')).toBe('Campaign link');
    expect(sourceTypeLabel('')).toBe('Not recorded');
  });

  it('shows unknown source types as written', () => {
    expect(sourceTypeLabel('newsletter-x')).toBe('newsletter-x');
  });

  it('keeps utm sources exactly as written', () => {
    expect(sourceLabel('(direct)')).toBe('(direct)');
    expect(sourceLabel('chatgpt.com')).toBe('chatgpt.com');
    expect(sourceLabel('ChatGPT.com')).toBe('ChatGPT.com');
    expect(sourceLabel('')).toBe('Not recorded');
  });
});

describe('device name from the user agent', () => {
  const ua = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15',
    ipad: 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
  };

  it('recognises each device', () => {
    expect(deviceNameFromUserAgent(ua.iphone)).toBe('iPhone');
    expect(deviceNameFromUserAgent(ua.ipad)).toBe('iPad');
    expect(deviceNameFromUserAgent(ua.android)).toBe('Android');
    expect(deviceNameFromUserAgent(ua.mac)).toBe('Mac');
    expect(deviceNameFromUserAgent(ua.windows)).toBe('Windows');
    expect(deviceNameFromUserAgent(ua.linux)).toBe('Other');
    expect(deviceNameFromUserAgent('')).toBe('Other');
  });

  it('checks in the order iPhone, iPad, Android, Macintosh, Windows', () => {
    expect(deviceNameFromUserAgent('iPhone iPad')).toBe('iPhone');
    expect(deviceNameFromUserAgent('iPad Macintosh')).toBe('iPad');
    expect(deviceNameFromUserAgent('Android Windows')).toBe('Android');
    expect(deviceNameFromUserAgent('Macintosh Windows')).toBe('Mac');
  });
});
