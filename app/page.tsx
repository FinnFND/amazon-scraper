"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import logger from '@/lib/logger';

// --- NEW: Define specific types to replace 'any' ---
interface JobStatus {
  status: string;
  createdAt?: number;
  updatedAt?: number;
  productCountLive?: number;
  productCount?: number;
  sellerCountLive?: number;
  sellerTotal?: number;
}

interface Job {
  id: string;
  status: string;
  productCount?: number;
  // Add any other properties your job object might have
}


const TERMINAL_STATES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'ERROR']);

export default function Page() {
  const [keywords, setKeywords] = useState('');
  const [marketCom, setMarketCom] = useState(true);
  const [marketUk, setMarketUk] = useState(false);
  const bothSelected = marketCom && marketUk;
  const [maxItems, setMaxItems] = useState<number | ''>('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  // simple ticking timer for duration display
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const start = async () => {
    setError(null);
    // validations: keywords and maxItems are required
    const keywordsArr = keywords.split(',').map(s => s.trim()).filter(Boolean);
    if (!keywordsArr.length) {
      setError('Please enter at least one keyword.');
      return;
    }
    if (typeof maxItems !== 'number' || maxItems <= 0) {
      setError('Please enter a valid Max items (> 0).');
      return;
    }
    logger.info('UI: start clicked');
    // Enforce only one marketplace at a time for Apify actor1
    const marketplaces = [marketUk ? 'co.uk' : (marketCom ? 'com' : 'com')];
    // no log: trivial

    const res = await fetch('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        keywords: keywordsArr,
        marketplaces,
        endPage: 7,
        maxItems,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    // no log: trivial
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || 'Failed to start job');
      return;
    }
    logger.info('UI: job created');

    setJobId(data.jobId);
    setStatus({ status: 'RUNNING_PRODUCT' }); // optimistic
    setStartedAt(Date.now());
  };

  const refresh = async (id: string) => {
    const r = await fetch(`/api/jobs/${id}`);
    const j = await r.json();
    setStatus(j);
    if (!startedAt && typeof j?.createdAt === 'number') setStartedAt(j.createdAt);
  };

  const loadJobs = async () => {
    const r = await fetch('/api/jobs');
    const j = await r.json();
    setJobs(j.jobs || []);
  };

  // --- NEW: poll every 2s while job is running ---
  useEffect(() => {
    if (!jobId) return;

    // don’t poll if we already reached a terminal state
    if (status?.status && TERMINAL_STATES.has(status.status)) return;

    const interval = setInterval(() => {
      refresh(jobId).catch(err => logger.warn('poll refresh failed', { err }));
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, status?.status]);

  useEffect(() => {
    loadJobs().catch(() => {});
    const i = setInterval(() => loadJobs().catch(() => {}), 3000);
    return () => clearInterval(i);
  }, []);

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Amazon Product + Seller Scraper</h1>
      <div className="space-y-3 border rounded p-4">
        <label className="block">
          <span className="text-sm">Keywords (comma separated) <span className="text-red-600">*</span></span>
          <input required className="mt-1 w-full border rounded p-2" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="iphone, android" />
        </label>
        <label className="block">
          <span className="text-sm">Max items <span className="text-red-600">*</span></span>
          <input required type="number" min={1} className="mt-1 w-full border rounded p-2" value={maxItems} onChange={e => setMaxItems(e.target.value ? Number(e.target.value) : '')} placeholder="e.g. 100" />
        </label>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={marketCom}
              onChange={(e) => {
                const v = e.target.checked;
                setMarketCom(v);
                if (v) setMarketUk(false);
              }}
            />
            <span>amazon.com</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={marketUk}
              onChange={(e) => {
                const v = e.target.checked;
                setMarketUk(v);
                if (v) setMarketCom(false);
              }}
            />
            <span>amazon.co.uk</span>
          </label>
        </div>
        {bothSelected && (
          <div className="text-xs text-amber-600">Please choose only one Amazon site at a time.</div>
        )}
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button onClick={start} className="px-4 py-2 rounded bg-black text-white">Run</button>
      </div>

      {jobId && (
        <div className="mt-6 border rounded p-4">
          <div className="text-sm text-gray-600">Job ID: {jobId}</div>
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <span>Status:</span>
              <b>{status?.status}</b>
              {(status?.status === 'RUNNING_PRODUCT' || status?.status === 'RUNNING_SELLER') && (
                <svg className="animate-spin h-4 w-4 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
              )}
            </div>

            {/* Timer */}
            {(() => {
              const startMs = typeof startedAt === 'number' ? startedAt : (typeof status?.createdAt === 'number' ? status.createdAt : null);
              const isTerminal = status?.status && TERMINAL_STATES.has(status.status);
              const endMs = isTerminal ? (typeof status?.updatedAt === 'number' ? status.updatedAt : now) : now;
              if (!startMs) return null;
              const seconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
              return (
                <div className="text-sm text-gray-600 mt-1">{isTerminal ? 'Total time' : 'Elapsed'}: {seconds}s</div>
              );
            })()}

            {/* Friendly guidance before first result */}
            {status?.status === 'RUNNING_PRODUCT' && (status?.productCountLive == null || status?.productCountLive === 0) && (
              <div className="mt-2 text-sm text-gray-600">It usually takes some time to see results. It might take up to 2-3 minutes.</div>
            )}

            {/* Progress while RUNNING_PRODUCT */}
            {status?.status === 'RUNNING_PRODUCT' && (
              <div className="mt-2 text-sm">
                <div className="font-medium">Fetching Amazon Products ...</div>
                <div>
                  {typeof status?.productCountLive === 'number' ? (
                    <span>Products retrieved so far: {status.productCountLive}</span>
                  ) : (
                    <span>Preparing run ...</span>
                  )}
                </div>
              </div>
            )}

            {/* Progress while RUNNING_SELLER */}
            {status?.status === 'RUNNING_SELLER' && (
              <div className="mt-2 text-sm">
                <div className="font-medium">Fetching Amazon Sellers ...</div>
                <div>
                  {typeof status?.sellerCountLive === 'number' ? (
                    <span>Sellers retrieved so far: {status.sellerCountLive}{typeof status?.sellerTotal === 'number' ? ` / ${status.sellerTotal}` : ''}</span>
                  ) : (
                    <span>Starting seller scraping ...</span>
                  )}
                </div>
              </div>
            )}

            {/* Final product count once actor1 finished */}
            {status?.productCount != null && (
              <div className="mt-2">Products found (final): {status.productCount}</div>
            )}
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

      <div className="mt-10">
        <h2 className="text-xl font-semibold mb-3">Jobs</h2>
        <div className="mb-2 text-sm text-gray-600">Existing jobs are loaded from Redis and auto-refreshed.</div>
        <div className="space-y-2">
          {jobs.map((j) => (
            <div key={j.id} className="border rounded p-3 flex items-center justify-between">
              <div className="text-sm">
                <div><b>{j.id}</b></div>
                <div>Status: {j.status}</div>
                {j.productCount != null && <div>Products: {j.productCount}</div>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => refresh(j.id)} className="px-3 py-1 rounded border">Refresh</button>
                {j.status === 'SUCCEEDED' && (
                  <a className="px-3 py-1 rounded bg-green-600 text-white" href={`/api/export/${j.id}`}>Download</a>
                )}
                <button onClick={async () => { await fetch(`/api/jobs/${j.id}`, { method: 'DELETE' }); await loadJobs(); }} className="px-3 py-1 rounded border text-red-600">Delete</button>
              </div>
            </div>
          ))}
          {jobs.length === 0 && (
            <div className="text-sm text-gray-600">No jobs yet.</div>
          )}
        </div>
      </div>
    </main>
  );
}
