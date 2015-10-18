(function() {
  var host = window.document.location.host;
  var sock = new WebSocket('ws://' + host);

  sock.onmessage = function(e) {
    location.reload();
  };
})();
