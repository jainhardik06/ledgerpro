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

export const getAttribution = () => {
  const utms = getUTMs();
  
  if (!utms || Object.keys(utms).length === 0) {
    return { channel: 'Direct', utms: null };
  }

  const source = (utms.utm_source || '').toLowerCase();
  const medium = (utms.utm_medium || '').toLowerCase();

  let channel = 'Unknown';

  if (medium.includes('cpc') || medium.includes('ppc') || medium.includes('paidsearch')) {
    channel = 'Paid Search';
  } else if (medium.includes('paidsocial') || (['facebook', 'instagram', 'linkedin', 'twitter'].includes(source) && medium === 'cpc')) {
    channel = 'Paid Social';
  } else if (source.includes('google') || source.includes('bing') || source.includes('yahoo')) {
    channel = 'Organic Search';
  } else if (['linkedin', 'twitter', 'reddit', 'facebook', 'instagram'].includes(source)) {
    channel = 'Organic Social';
  } else if (medium.includes('email') || medium.includes('newsletter')) {
    channel = 'Email';
  } else if (medium === 'referral' || source.includes('producthunt') || source.includes('directory')) {
    channel = 'Referral';
  } else {
    channel = 'Other';
  }

  return { channel, utms };
};
