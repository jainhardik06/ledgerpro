import { redirect } from 'next/navigation';

// Money OS doesn't have a separate pricing page — the free Beta covers
// everything. This used to be a client-side redirect (JS-dependent, no
// real HTTP status for crawlers); a server-side redirect sends a real
// 307/308 so search engines resolve it correctly instead of indexing a
// blank page.
export default function PricingPage() {
  redirect('/');
}
