(function() {
  var sockjs = new SockJS("/socket");

  sockjs.onmessage = function(e) {
    location.reload();
  };
})();
