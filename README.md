# zapp
Simple http server with websocket powered live reloading.

![](https://raw.githubusercontent.com/wridgers/zapp/master/example/img/zapp.png)

## Usage

Get zapp

    $ npm install -g zapp

Start a simple project

    $ mkdir www
    $ cd www
    $ vim index.html

Write a basic template, then serve it with

    $ zapp

Direct your browser at [http://localhost:8080/](http://localhost:8080/). Start
editing index.html.

## zappignore

Zapp will read a `.zappignore` file from the root of the served directory. Each
line can be a valid [anymatch](https://github.com/es128/anymatch) matcher.
Comments start with `#`.

### Note

zapp can only inject the web socket library required for live reloading into
HTML files with valid `<head>` and `<body>` tags.

## License
MIT
