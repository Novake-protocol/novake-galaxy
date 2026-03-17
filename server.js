const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || 'https://api.novake.gg';
const GALAXY_ORIGIN = process.env.GALAXY_ORIGIN || 'galaxy';

app.use(compression());
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Galaxy origin header for proxied requests
app.use('/api', (req, res, next) => {
  req.headers['x-galaxy-origin'] = GALAXY_ORIGIN;
  next();
});

// No-cache for HTML
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

// ═══ API PROXY — Star Rush (Fastify API) ═══
// Forward /api/vote/email/* and /api/diamonds/* to Fastify
app.use('/api/vote/email', createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  pathRewrite: (path) => '/vote/email' + path,
  timeout: 15000,
  onError: (err, req, res) => {
    console.error('[proxy] vote/email error:', err.message);
    res.status(502).json({ error: 'proxy_error', message: 'API temporarily unavailable' });
  }
}));

app.use('/api/diamonds', createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  pathRewrite: (path) => '/diamonds' + path,
  timeout: 15000,
  onError: (err, req, res) => {
    console.error('[proxy] diamonds error:', err.message);
    res.status(502).json({ error: 'proxy_error', message: 'API temporarily unavailable' });
  }
}));

// ═══ NICKNAME CHECK (local) ═══
const RESERVED_NAMES = ['admin', 'moderator', 'owner', 'novake', 'nova', 'kortex', 'system', 'official', 'support', 'staff', 'mod', 'bot', 'api', 'null', 'undefined', 'root', 'sudo'];
app.get('/api/nickname/check', function(req, res) {
  var name = (req.query.name || '').trim();
  if (!name || name.length < 3) return res.json({ available: false, reason: 'too_short' });
  if (name.length > 16) return res.json({ available: false, reason: 'too_long' });
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return res.json({ available: false, reason: 'invalid_chars' });
  if (RESERVED_NAMES.includes(name.toLowerCase())) return res.json({ available: false, reason: 'reserved' });
  // All valid — names are uniqueness-checked at vote submit time
  res.json({ available: true });
});

app.use('/api/vote/stats', createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  pathRewrite: (path) => '/vote/stats',
  timeout: 10000,
  onError: (err, req, res) => {
    res.status(502).json({ error: 'proxy_error' });
  }
}));

app.use('/api/stars', createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  pathRewrite: (path) => '/api/stars' + path,
  timeout: 15000,
  onError: (err, req, res) => {
    console.error('[proxy] stars error:', err.message);
    res.status(502).json({ error: 'proxy_error', message: 'API temporarily unavailable' });
  }
}));

// ═══ REFERRAL REDIRECT ═══
app.get('/r/:refcode', (req, res) => {
  res.redirect('/?' + new URLSearchParams({ ref: req.params.refcode }).toString());
});

// ═══ STATIC FILES ═══
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true,
}));

// ═══ CATCH-ALL → vote.html ═══
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'vote.html'));
});

app.listen(PORT, () => {
  console.log(`Galaxy server running on port ${PORT}`);
});
