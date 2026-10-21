import { Linking } from 'react-native';

import { openWebLink } from './openLink';

const openURL = jest.spyOn(Linking, 'openURL');
const canOpenURL = jest.spyOn(Linking, 'canOpenURL');

describe('openWebLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    openURL.mockReset();
    openURL.mockResolvedValue(true);
  });

  it.each(['http://example.com/a?b=1#c', 'https://example.com'])(
    'opens %s and returns true',
    async (url) => {
      await expect(openWebLink(url)).resolves.toBe(true);
      expect(openURL).toHaveBeenCalledTimes(1);
      expect(openURL).toHaveBeenCalledWith(url);
    },
  );

  it('passes the trimmed URL, not the raw input', async () => {
    await expect(openWebLink('  https://example.com/x  ')).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith('https://example.com/x');
  });

  it('never calls canOpenURL', async () => {
    await openWebLink('https://example.com');
    expect(canOpenURL).not.toHaveBeenCalled();
  });

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,x'],
    ['file:///etc/passwd'],
    ['intent://x'],
    ['mailto:a@b.c'],
    ['tel:123'],
    ['//evil.com'],
    ['https://a@b'],
    ['https://example.com/\njavascript:alert(1)'],
    ['https://exa\r\nmple.com'],
    [''],
    ['   '],
    ['https://example.com/' + 'a'.repeat(2049 - 'https://example.com/'.length)],
  ])('never opens %j and returns false', async (url) => {
    await expect(openWebLink(url)).resolves.toBe(false);
    expect(openURL).not.toHaveBeenCalled();
  });

  it('returns false when openURL rejects', async () => {
    openURL.mockRejectedValue(new Error('no handler'));
    await expect(openWebLink('https://example.com')).resolves.toBe(false);
  });

  it('returns false when openURL throws synchronously', async () => {
    openURL.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(openWebLink('https://example.com')).resolves.toBe(false);
  });

  it('validates concurrent calls independently', async () => {
    const results = await Promise.all([
      openWebLink('https://a.example'),
      openWebLink('javascript:alert(1)'),
      openWebLink('http://b.example'),
    ]);
    expect(results).toEqual([true, false, true]);
    expect(openURL).toHaveBeenCalledTimes(2);
    expect(openURL).toHaveBeenCalledWith('https://a.example');
    expect(openURL).toHaveBeenCalledWith('http://b.example');
  });
});
