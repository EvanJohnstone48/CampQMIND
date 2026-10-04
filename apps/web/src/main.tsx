import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { connectLive, DEFAULT_SERVER_URL } from './net/live';
import './style.css';

// Live by default: connect to the world server (pnpm dev:server). Add ?demo to the URL for Lane 4's
// self-contained demo. ?server=ws://host:port (or VITE_SERVER_URL at build time) picks the server.
const params = new URLSearchParams(location.search);
const demoOnly = params.has('demo');
const live = demoOnly ? undefined : connectLive(params.get('server') ?? import.meta.env.VITE_SERVER_URL ?? DEFAULT_SERVER_URL);

createRoot(document.getElementById('root')!).render(<StrictMode><App live={live} /></StrictMode>);
