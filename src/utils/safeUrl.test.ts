import { imageUrlStatus, safeImageUrl, safeWebUrl } from './safeUrl';

const long = 'https://a.com/' + 'x'.repeat(2049 - 14);

describe('safeWebUrl', () => {
  const ok: [string, string][] = [
    ['https://a.com', 'https://a.com'],
    ['http://a.com/x?y=1#z', 'http://a.com/x?y=1#z'],
    ['HTTP://X.COM', 'HTTP://X.COM'],
    ['HtTpS://x.com', 'HtTpS://x.com'],
    [' https://a.com ', 'https://a.com'],
    ['https://a.com:8080/p', 'https://a.com:8080/p'],
    ['https://a.com?q=a@b', 'https://a.com?q=a@b'],
    ['https://a.com/p@q', 'https://a.com/p@q'],
  ];
  it.each(ok)('accepts %j', (input, out) => expect(safeWebUrl(input)).toBe(out));

  const bad: string[] = [
    'JaVaScRiPt:alert(1)',
    'javascript:alert(1)',
    'https://a@b',
    'https://user:pw@host',
    'https://a.com\nfoo',
    'https://a.com\r\nfoo',
    'https://a.com/\u0000x',
    'https://a.com/ x',
    'https://a.com/ x',
    'https://a.com/ x',
    'https://a.com/　x',
    'https://a .com',
    'https://a.com/\tx',
    'https://a.com/​x',
    'https://',
    'https:///x',
    'https://:80/x',
    'https://?x',
    'https://a.com\\@b',
    '',
    '   ',
    long,
    '//evil.com',
    '/relative/path',
    'relative.png',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'content://x/y',
    'intent://x#Intent;end',
    'mailto:a@b.com',
    'tel:123',
    'vbscript:msgbox(1)',
    'ftp://a.com',
    'httpx://a.com',
    'http:/a.com',
  ];
  it.each(bad)('rejects %j', (input) => expect(safeWebUrl(input)).toBeNull());

  it('accepts a URL of exactly 2048 characters', () => {
    const u = 'https://a.com/' + 'x'.repeat(2048 - 14);
    expect(u).toHaveLength(2048);
    expect(safeWebUrl(u)).toBe(u);
  });
  it('rejects non-strings', () => {
    expect(safeWebUrl(undefined as unknown as string)).toBeNull();
  });
});

describe('safeImageUrl and imageUrlStatus', () => {
  it('accepts https only', () => {
    expect(safeImageUrl('https://a.com/i.png')).toBe('https://a.com/i.png');
    expect(safeImageUrl(' HTTPS://A.COM/i.png ')).toBe('HTTPS://A.COM/i.png');
    expect(safeImageUrl('http://a.com/i.png')).toBeNull();
  });
  it.each([
    ['https://a.com/i.png', 'ok'],
    ['HTTPS://a.com/i.png', 'ok'],
    ['http://a.com/i.png', 'needs-https'],
    [' HTTP://A.COM ', 'needs-https'],
    ['http://a@b/i.png', 'invalid'],
    ['http://', 'invalid'],
    ['http://a.com/\nx', 'invalid'],
    ['javascript:alert(1)', 'invalid'],
    ['data:image/png;base64,AAAA', 'invalid'],
    ['//evil.com/i.png', 'invalid'],
    ['', 'invalid'],
    [long, 'invalid'],
    ['http://a.com/' + 'x'.repeat(2100), 'invalid'],
  ])('status of %j is %s', (input, status) => {
    expect(imageUrlStatus(input)).toBe(status);
  });
  it('rejects hostile inputs as web does', () => {
    for (const u of ['https://a@b', 'https://user:pw@host', 'https:///x', 'https://a.com\nfoo']) {
      expect(safeImageUrl(u)).toBeNull();
    }
  });
});
