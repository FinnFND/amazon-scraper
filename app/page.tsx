"use client";

import { useState } from 'react';
import logger from '@/lib/logger';

export default function Page() {
  const [keywords, setKeywords] = useState('');
  const [marketCom, setMarketCom] = useState(true);
  const [marketUk, setMarketUk] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ status?: string; productCount?: number } | null>(null);

  const start = async () => {
    logger.debug('UI: start clicked', { keywords, marketCom, marketUk });
    const marketplaces = [
      ...(marketCom ? ['com'] : []),
      ...(marketUk ? ['co.uk'] : []),
    ];
    logger.debug('UI: marketplaces prepared', { marketplaces });
    const res = await fetch('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ keywords: keywords.split(',').map(s => s.trim()).filter(Boolean), marketplaces, endPage: 7 }),
      headers: { 'Content-Type': 'application/json' },
    });
    logger.debug('UI: /api/jobs response', { status: res.status, ok: res.ok });
    const data = await res.json();
    logger.debug('UI: job created', { jobId: data.jobId });
    setJobId(data.jobId);
    setStatus({ status: 'RUNNING_PRODUCT' });
  };

  const refresh = async (id: string) => {
    const r = await fetch(`/api/jobs/${id}`);
    const j = await r.json();
    setStatus(j);
  };

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Amazon Product + Seller Scraper</h1>
      <div className="space-y-3 border rounded p-4">
        <label className="block">
          <span className="text-sm">Keywords (comma separated)</span>
          <input className="mt-1 w-full border rounded p-2" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="iphone, android" />
        </label>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={marketCom} onChange={(e) => setMarketCom(e.target.checked)} />
            <span>amazon.com</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={marketUk} onChange={(e) => setMarketUk(e.target.checked)} />
            <span>amazon.co.uk</span>
          </label>
        </div>
        <button onClick={start} className="px-4 py-2 rounded bg-black text-white">Run (first 7 pages)</button>
      </div>

      {jobId && (
        <div className="mt-6 border rounded p-4">
          <div className="text-sm text-gray-600">Job ID: {jobId}</div>
          <div className="mt-2">
            <div>Status: <b>{status?.status}</b></div>
            {status?.productCount != null && <div>Products found: {status.productCount}</div>}
          </div>
          <div className="mt-2 text-sm text-gray-600">
            Waiting for webhooks at <code>/api/webhooks/actor1</code> and <code>/api/webhooks/actor2</code>.
          </div>
          <div className="mt-3">
            <button onClick={() => jobId && refresh(jobId)} className="px-3 py-1 rounded border">Refresh status</button>
          </div>
          {status?.status === 'SUCCEEDED' && (
            <a className="inline-block mt-4 px-4 py-2 rounded bg-green-600 text-white"
               href={`/api/export/${jobId}`}>Download Excel</a>
          )}
        </div>
      )}
    </main>
  );
}
