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

// css
var less     = require('less');
var stylus   = require('stylus');

// javascript/coffeescript
var Snockets = require('snockets');
var snockets = new Snockets();

// misc
var markdown = require('markdown').markdown;

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
var ugly = false;

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
  // on add/change/unlink
  watcher.on('all', function(path) {
    conn.write('refresh');
  });
});

// setup server
var app    = express();
var server = http.createServer(app);

// bind sockjs
socket.installHandlers(server, { prefix: '/socket' });

// serve a file or return false
function serveFile(path, req, res) {
  // get the extension
  var index = path.lastIndexOf('.');
  var ext   = (index < 0) ? '' : path.substr(index);          

  // do something based on the extension
  switch (ext) {
    // eJS
    case '.ejs':
      readFile(path, res, function(data, mimetype) {
        var data = ejs.render(data);

        sendData(data, 'text/html', res);
      });
      break;

    // handlebars
    case '.hbs':
      readFile(path, res, function(data, mimetype) {
        var template = hbs.compile(data);
        var html = template();

        sendData(html, 'text/html', res);
      });
      break;

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
        data = jade.renderFile(__dirname + '/markdown.jade', {rendered: data});

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
          if (err) 
            res.send(500);
          else 
            sendData(css, 'text/css', res);
        });
      });

      break;

    // javascript
    case '.js':
      snockets.getConcatenation(path, {
        minify: ugly
      }, function(err, js) {
        if (err || !js)
          res.send(500);
        else
          sendData(js, 'text/javascript', res);
      });

      break;

    // coffeescript
    case '.coffee':
      snockets.getConcatenation(path, {
        minify: ugly
      }, function(err, js) {
        if (err || !js)
          res.send(500);
        else
          sendData(js, 'text/javascript', res);
      });

      break;

    default:
      // send whatever we can read
      readFile(path, res, function(data, mimetype) {
        sendData(data, mimetype, res);
      });
      break;
  }
}

// read a file, respond 500 on failure, otherwise execute a callback
function readFile(path, res, callback) {
  fs.readFile(path, { encoding: 'utf-8' }, function(err, data) {
    if (err || data == undefined) {
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
  data = data.replace('<\/head>', headerPayload + '\n</head>');
  data = data.replace('<\/body>', footerPayload + '\n</body>');

  return data;
}

// serve files
function middleware(req, res, next) {
  // get path
  var path = serv + '/' + req.path;
  console.log(req.method + ' ' + req.path);

  fs.stat(path, function(err, stats) {
    if (err || !stats || stats == undefined) {
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
