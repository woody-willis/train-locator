const back = require('androidjs').back;
const fetch = require('node-fetch');

const apiUrl = 'http://skywarspractice.ga:9090/v1/';

back.on('get-trains-from-stations', async (from, to) => {
	const response = await fetch(apiUrl + 'get-journey-html/' + from + '/' + to).catch(err => {
		console.log(err);
	});
	const html = await response.text();
	back.send("trains-from-station-html", html)
});