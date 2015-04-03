(function() {
  var host = window.document.location.host;
  var sock = new WebSocket('ws://' + host);

  sock.onmessage = function(e) {
    console.log('recv:' + e.data);
  };

  sock.onclose = function(e) {
    location.reload();
  }
})();
