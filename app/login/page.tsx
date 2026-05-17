// Modified by Gigabox Research (2026)
// Login page — magic link + API key tabs

'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const [tab, setTab] = useState<'email' | 'apikey'>('email');
  const [email, setEmail] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const searchParams = useSearchParams();

  const urlError = searchParams.get('error');

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('Check your email for a sign-in link.');
      } else {
        setError(data.error || 'Failed to send magic link');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  async function handleApiKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/api-key-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = '/';
      } else {
        setError(data.error || 'Invalid API key');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="w-full max-w-sm rounded-xl bg-white/5 p-8 shadow-2xl backdrop-blur-sm border border-white/10">
        <h1 className="mb-6 text-center text-2xl font-bold text-white">OpenMAIC</h1>

        {(urlError || error) && (
          <div className="mb-4 rounded-md bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300">
            {error || urlError?.replace(/_/g, ' ')}
          </div>
        )}

        {message && (
          <div className="mb-4 rounded-md bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-300">
            {message}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex rounded-lg bg-white/5 p-1">
          <button
            onClick={() => setTab('email')}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              tab === 'email' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/70'
            }`}
          >
            Email
          </button>
          <button
            onClick={() => setTab('apikey')}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              tab === 'apikey' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/70'
            }`}
          >
            API Key
          </button>
        </div>

        {tab === 'email' ? (
          <form onSubmit={handleEmailSubmit}>
            <label className="mb-2 block text-sm text-white/70">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="mb-4 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder:text-white/30 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send magic link'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleApiKeySubmit}>
            <label className="mb-2 block text-sm text-white/70">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="gbox_pk_..."
              required
              className="mb-4 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white font-mono text-sm placeholder:text-white/30 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
