const back = require('androidjs').back;

back.on('get-trains-from-stations', async (from, to) => {
	const html = from + " to " + to;
	back.send("trains-from-station-html", html);
});