const back = require('androidjs').back;
const app = require('androidjs').app;
const fs = require('fs');

const apiUrl = 'http://wheresmytrain.skywarspractice.ga/v1/';

back.on('login', async (email, password) => {
	const result = await fetch(apiUrl + "/login", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			email: email,
			password: password
		})
	});

	if (result.status !== 200) {
		back.emit('login-failed', 'Incorrect email or password');
	} else {
		const data = await result.json();
		const token = data.token;
		fs.writeFileSync(app.getPath("cache") + "/token.txt", token);
		back.emit('login-success', data.public);
	}
});