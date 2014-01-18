var zapp = {};

(function() {
  var sockjs = new SockJS("/socket");

  zapp.test = function(message) {
    sockjs.send(message);
  }

  sockjs.onmessage = function(e) {
    console.log('recv:' + e.data);
  };

  sockjs.onclose = function(e) {
    location.reload();
  }
})();

