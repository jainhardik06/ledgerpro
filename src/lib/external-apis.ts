import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { google } from 'googleapis';

// ---- PostHog Server-side API Queries ----
export async function fetchPostHogFunnels() {
  const phKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const phProject = process.env.POSTHOG_PROJECT_ID;
  if (!phKey || !phProject) return null;

  try {
    const res = await fetch(`https://us.i.posthog.com/api/projects/${phProject}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${phKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query: "SELECT event, count() FROM events WHERE event IN ('$pageview', 'USER_SIGNUP', 'WORKSPACE_CREATED', 'TRANSACTION_CREATED', 'BUDGET_CREATED', 'REPORT_VIEWED') AND timestamp >= now() - INTERVAL 30 DAY GROUP BY event ORDER BY count() DESC"
        }
      })
    });
    
    if (!res.ok) return null;
    
    const data = await res.json();
    if (data.results) {
      // Map event names to nicer labels for the funnel chart
      const labelMap: Record<string, string> = {
        '$pageview': 'Visitor',
        'USER_SIGNUP': 'Signup',
        'WORKSPACE_CREATED': 'Workspace',
        'TRANSACTION_CREATED': 'First Tx',
        'BUDGET_CREATED': 'First Budget',
        'REPORT_VIEWED': 'First Report'
      };
      
      // We'll format the output to match our Recharts component expectation
      return data.results.map((r: any) => ({
        step: labelMap[r[0]] || r[0],
        value: r[1]
      })).sort((a: any, b: any) => b.value - a.value); // simple sort descending for funnel
    }
    return [];
  } catch (error) {
    console.error('PostHog Funnel Error:', error);
    return null;
  }
}

export async function fetchPostHogRetention() {
  const phKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const phProject = process.env.POSTHOG_PROJECT_ID;
  if (!phKey || !phProject) return null;

  try {
    // For now we'll just check if we can fetch users as a proxy for retention data
    const res = await fetch(`https://us.i.posthog.com/api/projects/${phProject}/persons`, {
      headers: { 'Authorization': `Bearer ${phKey}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.results || [];
  } catch (error) {
    console.error('PostHog Retention Error:', error);
    return null;
  }
}

export async function fetchGA4Traffic() {
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const saJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const propertyId = process.env.GA4_PROPERTY_ID;
  if ((!saPath && !saJson) || !propertyId) return null;

  try {
    const analyticsDataClient = saJson 
      ? new BetaAnalyticsDataClient({ credentials: JSON.parse(saJson) })
      : new BetaAnalyticsDataClient({ keyFilename: saPath });
    
    const [response] = await analyticsDataClient.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'dayOfWeekName' }],
      metrics: [{ name: 'activeUsers' }],
    });
    
    // Sort logic to make sure days are ordered if needed, but GA4 returns string days.
    // For simplicity, we just map it out.
    return response.rows?.map(row => ({
      name: row.dimensionValues?.[0]?.value?.substring(0,3) || 'Unknown',
      visitors: parseInt(row.metricValues?.[0]?.value || '0', 10)
    })) || [];
  } catch (error) {
    console.error('GA4 Traffic Error:', error);
    return null;
  }
}

export async function fetchPostHogEvents() {
  const phKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const phProject = process.env.POSTHOG_PROJECT_ID;
  if (!phKey || !phProject) return null;

  try {
    const res = await fetch(`https://us.i.posthog.com/api/projects/${phProject}/events/?limit=100`, {
      headers: { 'Authorization': `Bearer ${phKey}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.results || [];
  } catch (error) {
    console.error('PostHog Events Error:', error);
    return null;
  }
}

export async function fetchGSCSearch() {
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const saJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!saPath && !saJson) return null;

  try {
    const authOptions: any = {
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    };
    if (saJson) {
      authOptions.credentials = JSON.parse(saJson);
    } else {
      authOptions.keyFile = saPath;
    }
    const auth = new google.auth.GoogleAuth(authOptions);
    const searchconsole = google.searchconsole({ version: 'v1', auth });
    
    let siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://moneyos.webasthetic.in/';
    // GSC requires siteUrl to be an exact match of the property. 
    // Usually 'sc-domain:example.com' or 'https://example.com/'
    if (!siteUrl.startsWith('sc-domain:') && !siteUrl.startsWith('http')) {
      siteUrl = 'https://' + siteUrl;
    }
    
    const res = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        dimensions: ['query'],
        rowLimit: 10,
      }
    });
    return res.data.rows || [];
  } catch (error) {
    console.error('GSC Search Error:', error);
    return null;
  }
}
