const soap = require('soap');
const url = 'https://lite.realtime.nationalrail.co.uk/OpenLDBWS/wsdl.aspx?ver=2021-11-01';

require('dotenv').config();

const token = process.env.TOKEN;

hasClientBeenCreated = false;
let client;
(async () => {
    client = await soap.createClientAsync(url);
    client.addSoapHeader({
        AccessToken: {
            TokenValue: token
        }
    });
    hasClientBeenCreated = true;
})();

module.exports.waitForClient = () => {
    return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            if (hasClientBeenCreated) {
                clearInterval(interval);
                resolve();
            }
        }, 100);
    });
}

module.exports.getDepartureBoard = async (crs, timeOffset = 0, timeWindow = 0) => {
    return new Promise(async (resolve, reject) => {
        await module.exports.waitForClient();
        client.GetDepartureBoard({ numRows: 30, crs: crs, timeOffset, timeWindow }, (err, result) => {
            if (err) {
                reject(err);
            }
            resolve(result.GetStationBoardResult);
        });
    });
}

module.exports.getServiceDetails = async (serviceID) => {
    return new Promise(async (resolve, reject) => {
        await module.exports.waitForClient();
        client.GetServiceDetails({ serviceID: serviceID }, (err, result) => {
            if (err) {
                reject(err);
            }
            resolve(result.GetServiceDetailsResult);
        });
    });
}

module.exports.getArrDepBoardWithDetails = async (crs) => {
    return new Promise(async (resolve, reject) => {
        await module.exports.waitForClient();
        client.GetArrDepBoardWithDetails({ numRows: 30, crs: crs }, (err, result) => {
            if (err) {
                reject(err);
            }
            resolve(result.GetStationBoardResult);
        });
    });
}