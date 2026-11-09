'use strict';
/*
 * Regression test for SslClient connection-attempt leaks (zwave outage Oct 2026).
 *
 * Usage:  node test/ssl-reconnect.js [path/to/blynk-node.js]
 *   Default library is ../blynk-node.js. To see the old behaviour:
 *     git show 8d9e0cb:blynk-node.js > /tmp/blynk-node-old.js
 *     node test/ssl-reconnect.js /tmp/blynk-node-old.js
 *
 * Requires `openssl` on PATH (generates a throwaway self-signed cert).
 * Node 12 compatible.
 */
var path = require('path');
var fs = require('fs');
var os = require('os');
var net = require('net');
var tls = require('tls');
var execFileSync = require('child_process').execFileSync;

var libPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'blynk-node.js'));
var SslClient = require(libPath).SslClient;
console.log('Testing', libPath);

var failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' (' + detail + ')' : ''));
  if (!ok) failures++;
}

process.on('uncaughtException', function(e) {
  check('no uncaught exception', false, e.message);
  finish();
});

// Silence the library's console.log chatter.
var realLog = console.log;
function quiet(fn) {
  console.log = function() {};
  try { return fn(); } finally { console.log = realLog; }
}

function connectingSockets() {
  return process._getActiveHandles().filter(function(h) {
    return h instanceof net.Socket && h.connecting;
  }).length;
}

// --- Test 1: attempts that hang (outage) must not pile up, and must time out.
function testHangingAttempts(next) {
  // 10.255.255.1 is non-routable: TCP connect hangs like it did during the outage.
  var client = new SslClient({ addr: '10.255.255.1', port: 9443, ca: [], connectTimeout: 500 });
  client.ca = null;
  quiet(function() {
    for (var i = 0; i < 20; i++) client.connect(function() {});
  });
  var n = connectingSockets();
  check('only one pending attempt after 20 connect() calls', n <= 1, n + ' pending');
  setTimeout(function() {
    var m = connectingSockets();
    check('hung attempt times out', m === 0, m + ' still pending');
    quiet(function() { client.disconnect(); });
    next();
  }, 1500);
}

// --- Test 2: when the network comes back, piled-up attempts must not race.
function testRecoveryStorm(next) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blynk-test-'));
  var keyFile = path.join(dir, 'k'), crtFile = path.join(dir, 'c');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost',
    '-keyout', keyFile, '-out', crtFile], { stdio: 'ignore' });

  var accepted = 0;
  var server = tls.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(crtFile) },
    function(s) { accepted++; s.on('error', function() {}); });
  server.listen(0, '127.0.0.1', function() {
    var client = new SslClient({ addr: '127.0.0.1', port: server.address().port,
      servername: 'localhost', ca: [crtFile] });
    var done = 0;
    quiet(function() {
      for (var i = 0; i < 50; i++) {
        client.connect(function() {
          done++;
          // Like the app: a later disconnect while other handshakes are in flight.
          client.disconnect();
        });
      }
    });
    setTimeout(function() {
      check('exactly one connection completes', done === 1, done + ' completed');
      check('server saw at most one TLS connection', accepted <= 1, accepted + ' accepted');
      quiet(function() { client.disconnect(); });
      server.close();
      fs.rmSync ? fs.rmSync(dir, { recursive: true, force: true }) : null;
      next();
    }, 2000);
  });
}

var finished = false;
function finish() {
  if (finished) return;
  finished = true;
  console.log(failures ? failures + ' failure(s)' : 'All tests passed');
  process.exit(failures ? 1 : 0);
}

testHangingAttempts(function() { testRecoveryStorm(finish); });
