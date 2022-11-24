const express = require("express");
const app = express();
const cors = require("cors");
const port = 3000;

const corsOptions = {
    origin: '*',
    optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}

app.use(cors(corsOptions));

const nre = require("./nre");
const utils = require("./utils");

// v1

app.get("/v1/get-location-from-id/:id", async (req, res) => {
    // Speed calculation
    const serviceID = decodeURI(req.params.id);
    let response = {};
    let lastTime = null;
    let lastPercentage = 0;
    let speed = null;
    let stationDeparted = null;
    let stationArriving = null;
    for (let timesToRun = 0; timesToRun < 2; timesToRun++) {
        // Get the real-time service details
        let serviceData = await nre.getServiceDetails(serviceID).catch((err) => {
            res.status(400).send({ error: err.message });
        });
        if (!serviceData) {
            res.status(400).send({ error: "No service with that ID" });
        }

        // Clean and populate the service details
        if (Array.isArray(serviceData.previousCallingPoints.callingPointList)) {
            let lastScanTime = 0;
            for (const callingPointList of serviceData.previousCallingPoints.callingPointList) {
                for (const callingPoint of callingPointList.callingPoint) {
                    let thisCallingPointTime = new Date();
                    thisCallingPointTime.setHours(callingPoint.st.split(":")[0]);
                    thisCallingPointTime.setMinutes(callingPoint.st.split(":")[1]);
                    thisCallingPointTime.setSeconds(0);
                    thisCallingPointTime.setMilliseconds(0);
                    if (thisCallingPointTime.getTime() > lastScanTime) {
                        lastScanTime = thisCallingPointTime.getTime();
                    }
                }
            }
            for (const callingPointList of serviceData.previousCallingPoints.callingPointList) {
                for (const callingPoint of callingPointList.callingPoint) {
                    let thisCallingPointTime = new Date();
                    thisCallingPointTime.setHours(callingPoint.st.split(":")[0]);
                    thisCallingPointTime.setMinutes(callingPoint.st.split(":")[1]);
                    thisCallingPointTime.setSeconds(0);
                    thisCallingPointTime.setMilliseconds(0);
                    if (thisCallingPointTime.getTime() == lastScanTime) {
                        serviceData.previousCallingPoints = {};
                        serviceData.previousCallingPoints.callingPointList = { callingPoint: callingPointList.callingPoint } 
                    }
                }
            }
        }

        let callingPoints;
        if (serviceData.previousCallingPoints) {
            callingPoints = serviceData.previousCallingPoints.callingPointList.callingPoint
            if (!Array.isArray(callingPoints)) {
                callingPoints = [callingPoints];
            }
            
            callingPoints.push({
                locationName: serviceData.locationName,
                crs: serviceData.crs,
                st: serviceData.sta,
                et: serviceData.eta,
            });
            if (serviceData.eta) {
                callingPoints[callingPoints.length - 1].et = serviceData.eta;
            } else {
                callingPoints[callingPoints.length - 1].at = serviceData.ata;
            }
        } else {
            if (serviceData.etd) {
                callingPoints = [{
                    locationName: serviceData.locationName,
                    crs: serviceData.crs,
                    st: serviceData.std,
                    et: serviceData.etd,
                }];
            } else {
                callingPoints = [{
                    locationName: serviceData.locationName,
                    crs: serviceData.crs,
                    st: serviceData.std,
                    at: serviceData.atd,
                }];
            }
        }
        if (!serviceData.subsequentCallingPoints){
            serviceData.subsequentCallingPoints = { callingPointList: { callingPoint: [] } };
        }
        const stations = utils.cleanServiceDetails(callingPoints.concat(serviceData.subsequentCallingPoints.callingPointList.callingPoint));

        // Prepare variables for the loop
        let lastStation = null;
        let lastStationChecked;
        let lastStationServiceID = null;
        // Loop through the stations to see where the train is
        for (let i = 0; i < stations.length; i++) {
            if (stations[i].at) {
                // The train is not at this station but may be between this station and the next
                lastStation = stations[i];
            } else {
                // The train is at or is coming to this station
                if (lastStation == null) {
                    // The train is at the first station/hasn't left yet
                    // console.log(`The train hasn't started it's journey yet and is currently at ${stations[i].locationName}.`);
                    break;
                }
                if (lastTime == null) {
                    lastTime = new Date();
                }
                if (stations[i].et == "On time" || stations[i].et == "No report") {
                    stations[i].et = stations[i].st;
                }
                // Get historical (45 minutes in the past) departure board for the last station
                lastStationChecked = await nre.getDepartureBoard(lastStation.crs, -119, 119);
                lastStationChecked.trainServices.service.concat((await nre.getDepartureBoard(lastStation.crs, 0, 119)).trainServices.service);
                // Loop through the departure board to find the service of this train
                for (let j = 0; j < lastStationChecked.trainServices.service.length; j++) {
                    let possibilities = [lastStationChecked.trainServices.service[j].std];

                    let minuteBefore = new Date();
                    minuteBefore.setHours(parseInt(lastStationChecked.trainServices.service[j].std.split(":")[0]));
                    minuteBefore.setMinutes(parseInt(lastStationChecked.trainServices.service[j].std.split(":")[1]) - 1);
                    possibilities.push(minuteBefore.getHours() + ":" + minuteBefore.getMinutes().toString().padStart(2, "0"));

                    let minuteAfter = new Date();
                    minuteAfter.setHours(parseInt(lastStationChecked.trainServices.service[j].std.split(":")[0]));
                    minuteAfter.setMinutes(parseInt(lastStationChecked.trainServices.service[j].std.split(":")[1]) + 1);
                    possibilities.push(minuteAfter.getHours() + ":" + minuteAfter.getMinutes().toString().padStart(2, "0"));

                    if (possibilities.includes(lastStation.st) && lastStationChecked.trainServices.service[j].operatorCode == serviceData.operatorCode) {
                        lastStationServiceID = lastStationChecked.trainServices.service[j].serviceID;
                        break;
                    }
                }

                // Get the departure time of this train from the last station
                let lastStationDepTime = new Date();
                if (lastStationServiceID != null) {
                    let lastStationServiceData = await nre.getServiceDetails(lastStationServiceID);
                    if (lastStationServiceData.etd == "On time" || lastStationServiceData.etd == "No report") {
                        lastStationServiceData.etd = lastStationServiceData.std;
                    }
                    if (lastStationServiceData.atd == "On time" || lastStationServiceData.atd == "No report") {
                        lastStationServiceData.atd = lastStationServiceData.std;
                    }

                    if (lastStationServiceData.etd) {
                        lastStationDepTime.setHours(parseInt(lastStationServiceData.etd.split(":")[0]));
                        lastStationDepTime.setMinutes(parseInt(lastStationServiceData.etd.split(":")[1]));
                    } else {
                        lastStationDepTime.setHours(parseInt(lastStationServiceData.atd.split(":")[0]));
                        lastStationDepTime.setMinutes(parseInt(lastStationServiceData.atd.split(":")[1]));
                    }
                    lastStationDepTime.setSeconds(0);
                } else {
                    // Get the departure time of this train from the last station
                    if (lastStation.et) {
                        lastStationDepTime.setHours(parseInt(lastStation.et.split(":")[0]));
                        lastStationDepTime.setMinutes(parseInt(lastStation.et.split(":")[1]));
                    } else {
                        lastStationDepTime.setHours(parseInt(lastStation.at.split(":")[0]));
                        lastStationDepTime.setMinutes(parseInt(lastStation.at.split(":")[1]));
                    }
                    lastStationDepTime.setSeconds(0);
                }

                // Get the estimated arrival time of this train at the next station
                const updatedNextStationServices = (await nre.getArrDepBoardWithDetails(stations[i].crs)).trainServices.service;
                let detailedService = null;
                for (const service of updatedNextStationServices) {
                    if ((service.sta == stations[i].st || service.std == stations[i].st) && service.operatorCode == serviceData.operatorCode) {
                        detailedService = service;
                        break;
                    }
                }
                if (detailedService == null) {
                    res.status(400).send({ error: "Something went wrong." });
                }
                detailedService = await nre.getServiceDetails(detailedService.serviceID);
                // Clean the time details
                if (detailedService.eta == "On time" || detailedService.eta == "No report" || detailedService.eta == "Cancelled" || detailedService.eta == "Delayed") {
                    detailedService.eta = detailedService.sta;
                }
                if (detailedService.etd == "On time" || detailedService.etd == "No report" || detailedService.etd == "Cancelled" || detailedService.etd == "Delayed") {
                    detailedService.etd = detailedService.std;
                }
                if (detailedService.ata == "On time" || detailedService.ata == "No report" || detailedService.ata == "Cancelled" || detailedService.ata == "Delayed") {
                    detailedService.ata = detailedService.sta;
                }
                if (detailedService.atd == "On time" || detailedService.atd == "No report" || detailedService.atd == "Cancelled" || detailedService.atd == "Delayed") {
                    detailedService.atd = detailedService.std;
                }

                // Check if last station in journey
                if (!detailedService.etd && !detailedService.atd) {
                    // console.log(`The train has arrived at ${stations[i].locationName} and is now at the end of it's journey.`);
                }

                // Calculate the estimated departure time of this train from the last station
                let estimatedTimeDep = new Date();
                if (detailedService.atd) {
                    estimatedTimeDep.setHours(parseInt(detailedService.atd.split(":")[0]));
                    estimatedTimeDep.setMinutes(parseInt(detailedService.atd.split(":")[1]));
                } else {
                    estimatedTimeDep.setHours(parseInt(detailedService.etd.split(":")[0]));
                    estimatedTimeDep.setMinutes(parseInt(detailedService.etd.split(":")[1]));
                }
                estimatedTimeDep.setSeconds(30);
                // Calculate the estimated arrival time of this train at the last station
                let estimatedTimeArr = new Date();
                if (detailedService.eta) {
                    estimatedTimeArr.setHours(parseInt(detailedService.eta.split(":")[0]));
                    estimatedTimeArr.setMinutes(parseInt(detailedService.eta.split(":")[1]));
                } else {
                    estimatedTimeArr.setHours(parseInt(detailedService.ata.split(":")[0]));
                    estimatedTimeArr.setMinutes(parseInt(detailedService.ata.split(":")[1]));
                }
                estimatedTimeArr.setSeconds(0);
            
                // Calculate where the train is
                let timeDifference = estimatedTimeArr.getTime() - lastStationDepTime.getTime();
                const percentage = (new Date().getTime() - lastStationDepTime.getTime()) / timeDifference * 100;
                
                // Speed calculation
                if (stationArriving != null && stationDeparted != null) {
                    const tmpSpeed = (percentage - lastPercentage) / (new Date().getTime() - lastTime) * 1000;
                    if (tmpSpeed >= 0) {
                        speed = tmpSpeed;
                    }
                    lastPercentage = percentage;
                    lastTime = new Date().getTime();
                }

                const percentDone = percentage.toFixed(2);
                const currentTime = new Date();
                // Inform the user of the train's location
                if ((estimatedTimeArr.getTime() < currentTime.getTime() && currentTime.getTime() < estimatedTimeDep.getTime()) || percentDone < 0 || detailedService.ata && !detailedService.atd) {
                    isTrainAtStation = true;
                    response.status = "atStation";
                    response.station = stations[i].locationName;
                    response.stationCode = stations[i].crs;
                } else {
                    isTrainAtStation = false;
                    stationDeparted = lastStation.locationName;
                    stationArriving = stations[i].locationName;
                    if (!(percentDone > 100)) {
                        response.status = "betweenStations";
                        response.percentDone = percentage;
                        response.stationDeparted = stationDeparted;
                        response.stationArriving = stationArriving;
                        response.speed = speed;
                    } else {
                        response.status = "almostAtStation";
                        response.stationDeparted = stationDeparted;
                        response.stationArriving = stationArriving;
                    }
                }
                break;
            }
        }
    }
    res.send(response);
});

app.get("/v1/get-journey-html/:from/:to", async (req, res) => {
    const from = req.params.from;
    const to = req.params.to == "null" ? null : req.params.to;
    let html = "";

    const fromDepartures = (await nre.getArrDepBoardWithDetails(from)).trainServices.service;
    if (to != null) {
        for (const serviceData of fromDepartures) {
            let callingPoints;
            if (serviceData.previousCallingPoints) {
                callingPoints = serviceData.previousCallingPoints.callingPointList.callingPoint
                if (!Array.isArray(callingPoints)) {
                    callingPoints = [callingPoints];
                }
                
                callingPoints.push({
                    locationName: serviceData.locationName,
                    crs: serviceData.crs,
                    st: serviceData.sta,
                    et: serviceData.eta,
                });
                if (serviceData.eta) {
                    callingPoints[callingPoints.length - 1].et = serviceData.eta;
                } else {
                    callingPoints[callingPoints.length - 1].at = serviceData.ata;
                }
            } else {
                if (serviceData.etd) {
                    callingPoints = [{
                        locationName: serviceData.locationName,
                        crs: serviceData.crs,
                        st: serviceData.std,
                        et: serviceData.etd,
                    }];
                } else {
                    callingPoints = [{
                        locationName: serviceData.locationName,
                        crs: serviceData.crs,
                        st: serviceData.std,
                        at: serviceData.atd,
                    }];
                }
            }
            if (!serviceData.subsequentCallingPoints){
                serviceData.subsequentCallingPoints = { callingPointList: { callingPoint: [] } };
            }
            const stations = utils.cleanServiceDetails(callingPoints.concat(serviceData.subsequentCallingPoints.callingPointList.callingPoint));

            for (const station of stations) {
                if (station.crs == to) {
                    html += `<div class="journey-card">
                                <div class="journey-card-content">
                                    <div class="journey-card-content-row">
                                        <div class="journey-card-content-row-left">
                                            <h4>${serviceData.eta}</h4>
                                            <h2>${serviceData.sta}</h2>
                                        </div>
                                        <div class="journey-card-content-row-middle">
                                            <h4>29 minutes</h4>
                                            <h2>1 Change</h2>
                                        </div>
                                        <div class="journey-card-content-row-right">
                                            <h4>${callingPoints[callingPoints.length - 1].et}</h4>
                                            <h2>${callingPoints[callingPoints.length - 1].st}</h2>
                                        </div>
                                    </div>
                                </div>
                                <div class="divider"></div>
                                <button class="journey-card-track-train-btn" onclick="trackTrain(${serviceData.serviceID});">Track This Train</button>
                            </div>`;
                    break;
                }
            }
        }
    } else {
        for (const service of fromDepartures) {
            html += `<div class="journey-card">
                        <div class="journey-card-content">
                            <div class="journey-card-content-row">
                                <div class="journey-card-content-row-left">
                                    <h4>${service.eta}</h4>
                                    <h2>${service.sta}</h2>
                                </div>
                                <div class="journey-card-content-row-middle">
                                    <h4>29 minutes</h4>
                                    <h2>1 Change</h2>
                                </div>
                                <div class="journey-card-content-row-right">
                                    <h4>${service.subsequentCallingPoints.callingPointList.callingPoint[service.subsequentCallingPoints.callingPointList.callingPoint.length - 1].et}</h4>
                                    <h2>${service.subsequentCallingPoints.callingPointList.callingPoint[service.subsequentCallingPoints.callingPointList.callingPoint.length - 1].st}</h2>
                                </div>
                            </div>
                        </div>
                        <div class="divider"></div>
                        <button class="journey-card-track-train-btn" onclick="trackTrain(${service.serviceID});">Track This Train</button>
                    </div>`;
        }
    }

    if (html == "") {
        html = "<div class='journey-card'>Sorry, something went wrong. Please try again later!</div>";
    }

    res.send({ html: html });
});

app.listen(port, () => console.log(`API listening on port ${port}!`));