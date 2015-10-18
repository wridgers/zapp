#!/usr/bin/env node

"use strict";

var ascii = [
  '_____________  ______ ______',
  '\\___   /\\__  \\ \\____ \\\\____ \\',
  ' /    /  / __ \\|  |_> >  |_> >',
  '/_____ \\(____  /   __/|   __/',
  '      \\/     \\/|__|   |__| ',
  ''
].join('\n');

// node modules
var http     = require('http');
var fs       = require('fs');
var crypto   = require('crypto');
var path     = require('path');

// libs
var chokidar = require('chokidar');
var debounce = require('debounce');
var express  = require('express');
var mime     = require('mime');
var wsserver = require('ws').Server;

// templating and stuff
var jade     = require('jade');

// css
var less     = require('less');
var stylus   = require('stylus');

// javascript/coffeescript
var Snockets = require('snockets');
var snockets = new Snockets();

// misc
var markdown = require('markdown').markdown;

// arguments
var args = require('minimist')(process.argv.slice(2));

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
var port = args.p || 8080;
var serv = args._[0] || process.cwd();
var ugly = args.u || false;

var ignores = [
  '**/*.swp',
  '**/*.swo'
];

var zappignore = serv + '/.zappignore';

if (fs.existsSync(zappignore)) {
  var contents = fs.readFileSync(zappignore, 'utf8');

  ignores = contents
    .split('\n')
    .map(function(line) { return line.trim() })
    .filter(function(line) { return line[0] != '#'})
    .filter(function(line) { return line != false});
}

// index files
var index = [
  'index.html',
  'index.htm',
  'index.jade',
  'index.md',
];

// extensions
var extensions = [
  '.html',
  '.htm',
  '.jade',
  '.md',
];

// serve a file or return false
function serveFile(path, req, res) {
  // get the extension
  var index = path.lastIndexOf('.')
  var ext   = (index < 0) ? '' : path.substr(index).toLowerCase();

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
      var data = jade.renderFile(path, {
        pretty: !ugly
      });

      sendData(data, 'text/html', res);
      break;

    // markdown
    case '.md':
      readFile(path, res, function(data, mimetype) {
        data = markdown.toHTML(data);
        data = jade.renderFile(__dirname + '/res/markdown.jade', {rendered: data});

        sendData(data, 'text/html', res);
      });
      break;

    // less
    case '.less':
      readFile(path, res, function(data, mimetype) {
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
      readFile(path, res, function(data, mimetype) {
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
      snockets.getConcatenation(path, {
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
      var mimetype = mime.lookup(path);

      if (mimetype == 'text/html') {
        readFile(path, res, function(data, mimetype) {
          sendData(data, mimetype, res);
        });
      } else {
        res.set('Content-Type', mimetype);
        res.sendfile(path);
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
      var mimetype = mime.lookup(path);

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
  var path = serv + '/' + req.path;
  console.log(req.method + ' ' + req.path);

  switch(req.path) {
    case '/zapp/client':
      zappResource('client.js', res);
      break;

    default:
      fs.stat(path, function(err, stats) {
        if (err || !stats || stats === undefined) {
          var served = false;

          extensions.forEach(function(extension) {
            var newPath = path + extension;

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
            serveFile(path, req, res);
          } else {
            var served = false;

            index.forEach(function(file) {
              var newPath = path + '/' + file;

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
var app    = express();
var server = http.createServer(app);

// middleware
app.use(zapp);

// start server
server.listen(port);

// web socket server
var wss = new wsserver({ server: server });

// connection stack
var connections = {};

wss.on('connection', function(ws) {
  var id = crypto.randomBytes(4).toString('hex');

  console.log('CLIENT CONNECTED - ' + id);

  connections[id] = ws;

  ws.on('close', function(ws) {
    console.log('CLIENT DISCONNECTED - ' + id);
    delete connections[id];
  });
});

// setup watcher
var watcher = chokidar.watch(serv, {ignored: ignores});
watcher.on('all', debounce(function(type, path) {
  var stats = fs.lstatSync(path);

  console.log('CHANGES DETECTED - notifying clients...');

  if (stats.isFile()) {
    for (var id in connections) {
      var ws = connections[id];

      if (ws.readyState == ws.OPEN) {
        ws.send('refresh');
      }
    }
  }
}, 500));

console.log(ascii);
console.log('[zapp] serving', path.resolve(serv), 'on port', port);
