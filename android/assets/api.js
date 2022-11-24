const apiUrl = 'http://wheresmytrain.skywarspractice.ga/v1/';

function getJourney(from, to) {
    return new Promise( async (resolve, reject) => {
        const response = await fetch(apiUrl + 'get-journey-html/' + from + '/' + to);
        const html = await response.text();
        resolve(html);
    });
}