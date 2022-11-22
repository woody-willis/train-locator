const nre = require('./nre');
const utils = require('./utils');
const NREError = require('./NREError');

// Prepare service id
let serviceID;
if (!process.argv[2]) {
    console.log("Please provide a service ID as an argument.");
    process.exit(1);
} else {
    if (process.argv[2].includes("%")) {
        serviceID = decodeURIComponent(process.argv[2]).replace(/#/g, "/");
        console.log("Decoded service ID: " + serviceID);
    } else {
        serviceID = process.argv[2];
    }
}

(async () => {
    // Don't want to clear on first time!
    let isFirst = true;
    // Update buffer
    let detailsUpdateBuffer = 50;

    // Speed calculation
    let lastTime = Date.now();
    let lastPercentage = 0;
    let speed = null;
    let isTrainAtStation = false;
    let stationDeparted = null;
    let stationArriving = null;
    while (true) {
        if (detailsUpdateBuffer == 50) {
            // Get the real-time service details
            let serviceData = await nre.getServiceDetails(serviceID).catch((err) => {
                console.log("Invalid service ID: " + err.message);
                process.exit(1);
            });

            // Clean and populate the service details
            let callingPoints;
            if (serviceData.previousCallingPoints) {
                callingPoints = serviceData.previousCallingPoints.callingPointList.callingPoint
                
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
                        if (!isFirst) {
                            process.stdout.write("\033[1A\033[2K");
                        } else {
                            isFirst = false;
                        }
                        console.log(`The train hasn't started it's journey yet and is currently at ${stations[i].locationName}.`);
                        await new Promise((resolve, reject) => {
                            setTimeout(() => {
                                resolve();
                            }, 5000);
                        });
                        break;
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
                        console.log(`Something went wrong with the calculations.`);
                        process.exit(1);
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
                        if (!isFirst) {
                            process.stdout.write("\033[1A\033[2K");
                        }
                        console.log(detailedService)
                        console.log(`The train has arrived at ${stations[i].locationName} and is now at the end of it's journey.`);
                        process.exit(0);
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
                    if (!isFirst) {
                        process.stdout.write("\033[1A\033[2K");
                    } else {
                        isFirst = false;
                    }
                    const currentTime = new Date();
                    // Inform the user of the train's location
                    if ((estimatedTimeArr.getTime() < currentTime.getTime() && currentTime.getTime() < estimatedTimeDep.getTime()) || percentDone < 0 || detailedService.ata && !detailedService.atd) {
                        isTrainAtStation = true;
                        console.log(`The train is currently at ${percentDone < 0 ? lastStation.locationName : stations[i].locationName}.`);
                    } else {
                        isTrainAtStation = false;
                        stationDeparted = lastStation.locationName;
                        stationArriving = stations[i].locationName;
                        console.log(`The train is currently ${percentDone}% between ${lastStation.locationName} and ${stations[i].locationName}.`);
                    }
                    break;
                }
            }

            detailsUpdateBuffer = 0;
        } else {
            if (!isTrainAtStation && !(speed <= 0)) {
                const estimatedPercentage = (lastPercentage + detailsUpdateBuffer * speed / 10).toFixed(2);
                if (!(estimatedPercentage > 100)) {
                    process.stdout.write("\033[1A\033[2K");
                    console.log(`The train is currently ${estimatedPercentage}% between ${stationDeparted} and ${stationArriving}.`);
                } else {
                    process.stdout.write("\033[1A\033[2K");
                    console.log(`The train is almost at ${stationArriving}.`);
                }
            }

            detailsUpdateBuffer++;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
})();
