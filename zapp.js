#!/usr/bin/env node

"use strict";

const ascii = [
  '_____________  ______ ______',
  '\\___   /\\__  \\ \\____ \\\\____ \\',
  ' /    /  / __ \\|  |_> >  |_> >',
  '/_____ \\(____  /   __/|   __/',
  '      \\/     \\/|__|   |__| ',
  ''
].join('\n');

// node modules
const http     = require('http');
const fs       = require('fs');
const crypto   = require('crypto');
const path     = require('path');

// libs
const chokidar = require('chokidar');
const debounce = require('debounce');
const express  = require('express');
const mime     = require('mime');
const wsserver = require('ws').Server;

// templating and stuff
const jade     = require('jade');

// css
const less     = require('less');
const stylus   = require('stylus');

// javascript/coffeescript
const Snockets = require('snockets');
const snockets = new Snockets();

// misc
const markdown = require('markdown').markdown;

// arguments
const args = require('minimist')(process.argv.slice(2));

if (args.h) {
  console.log([
    'Usage: zapp [options] <dir>',
    '',
    'Arguments:',
    '  dir              The directory zapp serves. Defaults to CWD.',
    '',
    'Options:',
    '  -p <port>        Port zapp will serve on',
    '  -u               Ugly mode, uglifies JS and Jade.',
    '  -h               Show help'
  ].join('\n'));

  process.exit(0);
}

// config
const port = args.p || 8080;
const serv = args._[0] || process.cwd();
const ugly = args.u || false;

let ignores = [
  '**/*.swp',
  '**/*.swo'
];

const zappignore = serv + '/.zappignore';

if (fs.existsSync(zappignore)) {
  const contents = fs.readFileSync(zappignore, 'utf8');

  ignores = contents
    .split('\n')
    .map(function(line) { return line.trim() })
    .filter(function(line) { return line[0] != '#'})
    .filter(function(line) { return line != false});
}

// index files
const indexes = [
  'index.html',
  'index.htm',
  'index.jade',
  'index.md',
];

// extensions
const extensions = [
  '.html',
  '.htm',
  '.jade',
  '.md',
];

// serve a file or return false
function serveFile(filePath, req, res) {
  // get the extension
  const index = filePath.lastIndexOf('.')
  const ext   = (index < 0) ? '' : filePath.substr(index).toLowerCase();

  // unify common exts
  switch(ext) {
    case '.markdown':
      ext = '.md';
      break;
  }

  // do something based on the extension
  switch (ext) {
    // jade
    case '.jade':
      const data = jade.renderFile(filePath, {
        pretty: !ugly
      });

      sendData(data, 'text/html', res);
      break;

    // markdown
    case '.md':
      readFile(filePath, res, function(data, mimetype) {
        data = markdown.toHTML(data);
        data = jade.renderFile(__dirname + '/res/markdown.jade', {rendered: data});

        sendData(data, 'text/html', res);
      });
      break;

    // less
    case '.less':
      readFile(filePath, res, function(data, mimetype) {
        less.render(data, function(err, css) {
          if (err)
            res.send(500);
          else
            sendData(css, 'text/css', res);
        });
      });

      break;

    // stylus
    case '.styl':
      readFile(filePath, res, function(data, mimetype) {
        stylus.render(data, function(err, css) {
          if (err) {
            res.send(500);
          } else {
            sendData(css, 'text/css', res);
          }
        });
      });

      break;

    // javascript
    case '.js':
      snockets.getConcatenation(filePath, {
        minify: ugly
      }, function(err, js) {
        if (err) {
          res.send(500);
        } else {
          sendData(js, 'text/javascript', res);
        }
      });

      break;

    default:
      const mimetype = mime.lookup(filePath);

      if (mimetype == 'text/html') {
        readFile(filePath, res, function(data, mimetype) {
          sendData(data, mimetype, res);
        });
      } else {
        res.set('Content-Type', mimetype);
        res.sendFile(filePath);
      }
      break;
  }
}

// read a file, respond 500 on failure, otherwise execute a callback
function readFile(path, res, callback) {
  fs.readFile(path, { encoding: 'utf-8' }, function(err, data) {
    if (err || data === undefined) {
      res.send(500);
    } else {
      // get mimetype
      const mimetype = mime.lookup(path);

      // hand back read data
      callback(data, mimetype);
    }
  });
}

// respond with some data
function sendData(data, mimetype, res) {
  // set important header
  res.set('Content-Type', mimetype);

  // send response, inject sockjs if it's html
  res.send(
    (mimetype == 'text/html') ? inject(data) : data
  );
}

// inject zapp client into html just before body tag
function inject(data) {
  return data.replace(
    '<\/body>',
    '  <script src="/zapp/client"></script>\n  </body>'
  );
}

// serve a resource
function zappResource(file, res) {
  readFile(__dirname + '/res/' + file, res, function(data, mimetype) {
    sendData(data, mimetype, res);
  });
}

// serve files
function zapp(req, res, next) {
  // get path
  const filePath = path.resolve(serv + '/' + req.path);
  console.log(req.method + ' ' + req.path);

  switch(req.path) {
    case '/zapp/client':
      zappResource('client.js', res);
      break;

    default:
      fs.stat(filePath, function(err, stats) {
        if (err || !stats || stats === undefined) {
          let served = false;

          extensions.forEach(function(extension) {
            const newPath = filePath + extension;

            if (fs.existsSync(newPath) && !served) {
              serveFile(newPath, req, res);
              served = true;
            }
          });

          if (! served) {
            res.send(404);
          }
        } else {
          if (stats.isFile()) {
            serveFile(filePath, req, res);
          } else {
            let served = false;

            indexes.forEach(function(file) {
              const newPath = filePath + '/' + file;

              if (fs.existsSync(newPath) && !served) {
                serveFile(newPath, req, res);
                served = true;
              }
            });

            if (! served) {
              res.send(404);
            }
          }
        }
      });

      break;
  }
}

// setup server
const app    = express();
const server = http.createServer(app);

// middleware
app.use(zapp);

// start server
server.listen(port);

// web socket server
const wss = new wsserver({ server: server });

// connection stack
let connections = {};

wss.on('connection', function(ws) {
  const id = crypto.randomBytes(4).toString('hex');

  console.log('CLIENT CONNECTED - ' + id);

  connections[id] = ws;

  ws.on('close', function(ws) {
    console.log('CLIENT DISCONNECTED - ' + id);
    delete connections[id];
  });
});

// setup watcher
const watcher = chokidar.watch(serv, {ignored: ignores});
watcher.on('all', debounce(function(type, p) {
  const stats = fs.lstatSync(p);

  console.log('CHANGES DETECTED - notifying clients...');

  if (stats.isFile()) {
    for (const id in connections) {
      const ws = connections[id];

      if (ws.readyState == ws.OPEN) {
        ws.send('refresh');
      }
    }
  }
}, 500));

console.log(ascii);
console.log('[zapp] serving', path.resolve(serv), 'on port', port);
