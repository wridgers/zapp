#!/usr/bin/env node

"use strict";

// node modules
var http     = require('http');
var fs       = require('fs');

// libs
var chokidar = require('chokidar');
var express  = require('express');
var mime     = require('mime');
var sockjs   = require('sockjs');

// arguments
var argv     = require('optimist')
                .usage('Usage: $0 -p [port]')
                .default('p', 8080)
                .argv;


// payloads
var headerPayload = '<script src="http://cdn.sockjs.org/sockjs-0.3.min.js"></script>';
var footerPayload = '<script>var sockjs=new SockJS("/socket");sockjs.onmessage=function(e){location.reload();};</script>';

// config
var port = argv.p;
var serv = process.cwd();

// setup watcher
var watcher = chokidar.watch(serv);

// setup socket
var socket = sockjs.createServer();
socket.on('connection', function(conn) {
  // on add
  watcher.on('add', function(path) {
    console.log('[*] add detected: ' + path);
    conn.write('refresh');
  });

  // on change
  watcher.on('change', function(path) {
    console.log('[*] changed detected: ' + path);
    conn.write('refresh');
  });

  // on delete
  watcher.on('unlink', function(path) {
    console.log('[*] unlink detected: ' + path);
    conn.write('refresh');
  });
});

// setup server
var app    = express();
var server = http.createServer(app);

// bind sockjs
socket.installHandlers(server, { prefix: '/socket' });

// serve files
function middleware(req, res, next) {
  // get path
  var path = serv + '/' + req.path;

  console.log('GET ' + req.path);

  // get info on path
  fs.stat(path, function(err, stats) {
    if (err || stats == undefined) {
      res.send(404);
    } else {
      // stats
      var isFile      = stats.isFile();
      var isDirectory = stats.isDirectory();

      if (isFile || isDirectory) {
        // TODO: try index.htm, index.jade, index.ejs, etc
        if (isDirectory)
          path += '/index.html';

        fs.readFile(path, { encoding: 'utf-8' }, function(err, data) {
          if (err || data == undefined) {
            res.send(404);
          } else {
            // get the extension
            var index = path.lastIndexOf('.');
            var ext   = (index < 0) ? '' : path.substr(index);          

            // it'd be nice if we could compile ejs/jade/stylus/sass/markdown here

            // inject our scripts
            if (ext == '.html') {
              data = data.replace('<\/head>', headerPayload + '\n</head>');
              data = data.replace('<\/body>', footerPayload + '\n</body>');
            }

            // serve the file with correct mime type
            res.set('Content-Type', mime.lookup(path));
            res.send(data);
          }
        });
      } else {
        res.send(404);
      }
    }
  });
}

// middleware
app.use(middleware);

// start server
server.listen(port);
console.log('listening on port ' + port)
