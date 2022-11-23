const back = require('androidjs').back;
const fetch = require('node-fetch');

const apiUrl = 'http://skywarspractice.ga:9090/v1/';

back.on('get-trains-from-stations', async (from, to) => {
	const response = await fetch(apiUrl + 'get-trains-from-stations/' + from + '/' + to);
	const html = await response.text();
	back.send("trains-from-station-html", html)
});