const back = require('androidjs').back;

back.on('get-trains-from-stations', function (from, to) {
	let html = "From: " + from + " | To: " + to;
	back.send("trains-from-station-html", html)
});