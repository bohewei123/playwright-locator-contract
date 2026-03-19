/**
 * demo-app/server.js
 *
 * A zero-dependency Node.js HTTP server that serves the demo pages
 * used by the Playwright locator-contract test suite.
 *
 * Routes:
 *   GET /order/confirm       → order-confirm.html
 *   GET /order/*             → order-confirm.html  (satisfies toHaveURL(/\/order\//))
 *   GET /flights/search      → flights-search.html
 *   GET /payment/confirm     → payment-confirm.html
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

/** Map URL paths to HTML filenames in demo-app/public/ */
const EXACT_ROUTES = {
  '/order/confirm': 'order-confirm.html',
  '/flights/search': 'flights-search.html',
  '/payment/confirm': 'payment-confirm.html',
};

/**
 * Serve an HTML file from the public directory.
 * @param {http.ServerResponse} res
 * @param {string} filename
 */
function serveHtml(res, filename) {
  const filePath = path.join(PUBLIC_DIR, filename);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Internal Server Error: could not read ${filename}\n${err.message}`);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  // Strip query string
  const urlPath = (req.url || '/').split('?')[0];

  // 1. Exact route match
  const exactFile = EXACT_ROUTES[urlPath];
  if (exactFile) {
    serveHtml(res, exactFile);
    return;
  }

  // 2. Any /order/* path → serve the order confirm page
  //    (allows tests to assert toHaveURL(/\/order\//))
  if (urlPath.startsWith('/order/')) {
    serveHtml(res, 'order-confirm.html');
    return;
  }

  // 3. Root / → redirect to flights search as a convenience
  if (urlPath === '/') {
    res.writeHead(302, { Location: '/flights/search' });
    res.end();
    return;
  }

  // 4. 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end(`404 Not Found: ${urlPath}`);
});

server.listen(PORT, () => {
  console.log(`[demo-app] Server running at http://localhost:${PORT}`);
  console.log(`[demo-app] Pages:`);
  console.log(`           http://localhost:${PORT}/order/confirm`);
  console.log(`           http://localhost:${PORT}/flights/search`);
  console.log(`           http://localhost:${PORT}/payment/confirm`);
});

server.on('error', (err) => {
  console.error('[demo-app] Server error:', err.message);
  process.exit(1);
});
