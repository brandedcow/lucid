import { Linking } from 'react-native';

import { safeWebUrl } from '../utils/safeUrl';

/**
 * Opens a web link from a Note's Body in the system browser. Only `http://` and `https://`
 * URLs that pass `safeWebUrl` are opened; anything else resolves to false without touching
 * `Linking`. Resolves to true once the OS accepted the URL, false if it was rejected or the
 * open failed. Never throws and never logs the URL.
 *
 * `Linking.canOpenURL` is deliberately not used: on iOS it needs the scheme listed in
 * Info.plist (`LSApplicationQueriesSchemes`), on Android 11+ it needs `<queries>` entries,
 * and it is unreliable for http/https. The allow-list is the gate, and `openURL` failing
 * is handled instead.
 */
export async function openWebLink(url: string): Promise<boolean> {
  const safe = safeWebUrl(url);
  if (safe === null) return false;
  try {
    await Linking.openURL(safe);
    return true;
  } catch {
    return false;
  }
}
