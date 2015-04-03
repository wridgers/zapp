(function() {
  var sockjs = new SockJS("/socket");

  sockjs.onmessage = function(e) {
    console.log('recv:' + e.data);
  };

  sockjs.onclose = function(e) {
    location.reload();
  }
})();
