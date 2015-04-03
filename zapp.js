#!/usr/bin/env node

"use strict";

var ascii = [
  '_____________  ______ ______',
  '\\___   /\\__  \\ \\____ \\\\____ \\',
  ' /    /  / __ \\|  |_> >  |_> >',
  '/_____ \\(____  /   __/|   __/',
  '      \\/     \\/|__|   |__| '
].join('\n');

console.log(ascii);

// node modules
var http     = require('http');
var fs       = require('fs');

// libs
var chokidar = require('chokidar');
var express  = require('express');
var mime     = require('mime');
var sockjs   = require('sockjs');

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

console.log(args);

// payloads
var sockLibPayload = '<script src="/sockjs/lib"></script>';
var sockSrcPayload = '<script src="/sockjs/src"></script>';

// config
var port = args.p || 8080;
var serv = args._[0] || process.cwd();
var ugly = false;

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
  'index.md'
];

var connections = [];

// setup socket
var socket = sockjs.createServer();
socket.on('connection', function(con) {
  connections.push(con);
});

// setup watcher
var watcher = chokidar.watch(serv, {ignored: ignores});
watcher.on('all', function(type, path, stats) {
  console.log(type, path);

  if (! stats.isDirectory()) {
    connections.forEach(function(connection) {
      connection.write('refresh');
      connection.close();
    });
  }
});

// setup server
var app    = express();
var server = http.createServer(app);

// bind sockjs
socket.installHandlers(server, { prefix: '/socket' });

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

// injection sockjs into html
function inject(data) {
  data = data.replace('<\/head>', '  ' + sockLibPayload + '\n  </head>');
  data = data.replace('<\/body>', '  ' + sockSrcPayload + '\n  </body>');

  return data;
}

// serve a resource
function zappResource(file, res) {
  readFile(__dirname + '/res/' + file, res, function(data, mimetype) {
    sendData(data, mimetype, res);
  });
}

// serve files
function middleware(req, res, next) {
  // get path
  var path = serv + '/' + req.path;
  console.log(req.method + ' ' + req.path);

  switch(req.path) {
    case '/sockjs/lib':
      zappResource('socklib.js', res);
      break;
    case '/sockjs/src':
      zappResource('socksrc.js', res);
      break;

    default:
      fs.stat(path, function(err, stats) {
        if (err || !stats || stats === undefined) {
          res.send(404);
        } else {app.use(express.static(__dirname + '/public'));
          if (stats.isFile()) {
            serveFile(path, req, res);
          } else {
            var served = false;

            // a bit messy?
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

// middleware
app.use(middleware);

// start server
server.listen(port);
console.log('[zapp] listening on port ' + port);
