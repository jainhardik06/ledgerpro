import Cookies from 'js-cookie';

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const UTM_COOKIE_KEY = 'money_os_utm';

export const captureUTMs = () => {
  if (typeof window === 'undefined') return;

  const urlParams = new URLSearchParams(window.location.search);
  const utms: Record<string, string> = {};
  
  let hasUtms = false;
  UTM_KEYS.forEach((key) => {
    const value = urlParams.get(key);
    if (value) {
      utms[key] = value;
      hasUtms = true;
    }
  });

  if (hasUtms) {
    // Persist for 90 days
    Cookies.set(UTM_COOKIE_KEY, JSON.stringify(utms), { expires: 90, path: '/' });
  }
};

export const getUTMs = (): Record<string, string> | null => {
  if (typeof window === 'undefined') return null;
  const stored = Cookies.get(UTM_COOKIE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return null;
    }
  }
  return null;
};
