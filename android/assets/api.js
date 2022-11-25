const apiUrl = 'http://wheresmytrain.skywarspractice.ga/v1/';

function getJourney(from, to) {
    return new Promise( async (resolve, reject) => {
        const response = await fetch(apiUrl + 'get-journey-html/' + from + '/' + to);
        const html = JSON.parse(await response.text()).html;
        resolve(html);
    });
}

function getDataOfTrain(serviceID) {
    const url = apiUrl + "get-location-from-id/" + encodeURIComponent(serviceID.replace(/\//g, "#"));
    return new Promise( async (resolve, reject) => {
        let response = await fetch(url);
        let data = await response.json();
        resolve(data);
    });
}