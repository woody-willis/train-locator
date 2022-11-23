const back = require('androidjs').back;
const axios = require('axios');

const apiUrl = 'http://skywarspractice.ga:9090/v1/';

back.on('get-trains-from-stations', async (from, to) => {
	const response = await axios.get(apiUrl + 'get-trains-from-stations/' + from + '/' + to);
	const html = JSON.parse(response.data).html;
	back.send("trains-from-station-html", html)
});