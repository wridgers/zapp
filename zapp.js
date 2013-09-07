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

// templating and stuff
var ejs      = require('ejs');
var hbs      = require('handlebars');
var jade     = require('jade');
var less     = require('less');
var markdown = require('markdown').markdown;
var stylus   = require('stylus');

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

// index files
var index = [
  'index.html',
  'index.htm',
  'index.jade',
  'index.ejs',
  'index.hbs',
  'index.md'
];

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

// injection function
function inject(data) {
  data = data.replace('<\/head>', headerPayload + '\n</head>');
  data = data.replace('<\/body>', footerPayload + '\n</body>');

  return data;
}

// serve a file or return false
function serveFile(path, req, res) {
  // get info on path
  fs.readFile(path, { encoding: 'utf-8' }, function(err, data) {
    if (err || data == undefined) {
      res.send(500);
    } else {
      // get the extension
      var index = path.lastIndexOf('.');
      var ext   = (index < 0) ? '' : path.substr(index);          

      // get mimetype
      var mimetype = mime.lookup(path);

      switch(ext) {
        case '.ejs':
          mimetype = 'text/html';
          data = ejs.render(data);

          sendFile(data, mimetype, res);
          break;
  
        case '.hbs':
          mimetype = 'text/html';
          var template = hbs.compile(data);
          var html = template();

          sendFile(html, mimetype, res);
          break;

        case '.jade':
          mimetype = 'text/html';
          data = jade.render(data);

          sendFile(data, mimetype, res);
          break;

        case '.md':
          mimetype = 'text/html';
          data = markdown.toHTML(data);
          data = jade.renderFile(__dirname + '/markdown.jade', {rendered: data});

          sendFile(data, mimetype, res);
          break;

        case '.less':
          mimetype = 'text/css';
          less.render(data, function(err, css) {
            if (err) 
              res.send(500);
            else 
              sendFile(css, mimetype, res);
          });

          break;

        case '.styl':
          mimetype = 'text/css';
          stylus.render(data, function(err, css) {
            if (err) 
              res.send(500);
            else 
              sendFile(css, mimetype, res);
          });

          break;

        default:
          sendFile(data, mimetype, res);
          break;
      }
    }
  });
}

function sendFile(data, mimetype, res) {
  res.set('Content-Type', mimetype);
  res.send(
    (mimetype == 'text/html') ? inject(data) : data
  );
}

// serve files
function middleware(req, res, next) {
  // get path
  var path = serv + '/' + req.path;
  console.log(req.method + ' ' + req.path);

  fs.stat(path, function(err, stats) {
    if (err || !stats || stats == undefined) {
      console.log('error');
      res.send(404);
    } else {
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

        if (!served)
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
