const nre = require('./nre');
const utils = require('./utils');

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
                console.log("Invalid service ID");
                process.exit(1);
            });

            // Clean and populate the service details
            serviceData.previousCallingPoints.callingPointList.callingPoint.push({
                locationName: serviceData.locationName,
                crs: serviceData.crs,
                st: serviceData.sta,
            });
            if (serviceData.eta) {
                serviceData.previousCallingPoints.callingPointList.callingPoint[serviceData.previousCallingPoints.callingPointList.callingPoint.length - 1].et = serviceData.eta;
            } else {
                serviceData.previousCallingPoints.callingPointList.callingPoint[serviceData.previousCallingPoints.callingPointList.callingPoint.length - 1].at = serviceData.ata;
            }
            const stations = utils.cleanServiceDetails(serviceData.previousCallingPoints.callingPointList.callingPoint.concat(serviceData.subsequentCallingPoints.callingPointList.callingPoint));

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
                    lastStationChecked = await nre.getDepartureBoard(lastStation.crs, -60, 119);
                    lastStationChecked.trainServices.service.concat((await nre.getDepartureBoard(lastStation.crs, 61, 60)).trainServices.service);
                    // Loop through the departure board to find the service of this train
                    for (let j = 0; j < lastStationChecked.trainServices.service.length; j++) {
                        if (lastStationChecked.trainServices.service[j].std == lastStation.st) {
                            lastStationServiceID = lastStationChecked.trainServices.service[j].serviceID;
                            break;
                        }
                    }

                    let lastStationServiceData = await nre.getServiceDetails(lastStationServiceID);
                    if (lastStationServiceData.etd == "On time" || lastStationServiceData.etd == "No report") {
                        lastStationServiceData.etd = lastStationServiceData.std;
                    }
                    if (lastStationServiceData.atd == "On time" || lastStationServiceData.atd == "No report") {
                        lastStationServiceData.atd = lastStationServiceData.std;
                    }

                    // Get the departure time of this train from the last station
                    const lastStationDepTime = new Date();
                    if (lastStationServiceData.etd) {
                        lastStationDepTime.setHours(parseInt(lastStationServiceData.etd.split(":")[0]));
                        lastStationDepTime.setMinutes(parseInt(lastStationServiceData.etd.split(":")[1]));
                    } else {
                        lastStationDepTime.setHours(parseInt(lastStationServiceData.atd.split(":")[0]));
                        lastStationDepTime.setMinutes(parseInt(lastStationServiceData.atd.split(":")[1]));
                    }
                    lastStationDepTime.setSeconds(0);

                    // Get the estimated arrival time of this train at the next station
                    const updatedNextStationServices = (await nre.getArrDepBoardWithDetails(stations[i].crs)).trainServices.service;
                    let detailedService = null;
                    for (const service of updatedNextStationServices) {
                        if (service.sta == stations[i].st || service.std == stations[i].st) {
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
                    if (detailedService.eta == "On time" || detailedService.eta == "No report") {
                        detailedService.eta = detailedService.sta;
                    }
                    if (detailedService.etd == "On time" || detailedService.etd == "No report") {
                        detailedService.etd = detailedService.std;
                    }
                    if (detailedService.ata == "On time" || detailedService.ata == "No report") {
                        detailedService.ata = detailedService.sta;
                    }
                    if (detailedService.atd == "On time" || detailedService.atd == "No report") {
                        detailedService.atd = detailedService.std;
                    }

                    // Check if last station in journey
                    if (!detailedService.etd && !detailedService.atd) {
                        if (!isFirst) {
                            process.stdout.write("\033[1A\033[2K");
                        }
                        console.log(`The train has arrived at ${stations[i].locationName} and is now at the end of it's journey.`);
                        process.exit(0);
                    }

                    // Calculate the estimated departure time of this train from the next station
                    let estimatedTimeDep = new Date();
                    if (detailedService.atd) {
                        estimatedTimeDep.setHours(parseInt(detailedService.atd.split(":")[0]));
                        estimatedTimeDep.setMinutes(parseInt(detailedService.atd.split(":")[1]));
                        estimatedTimeDep.setSeconds(0);
                    } else {
                        estimatedTimeDep.setHours(parseInt(detailedService.etd.split(":")[0]));
                        estimatedTimeDep.setMinutes(parseInt(detailedService.etd.split(":")[1]));
                        estimatedTimeDep.setSeconds(30);
                    }
                    // Calculate the estimated arrival time of this train at the next station
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
                        speed = (percentage - lastPercentage) / (new Date().getTime() - lastTime) * 1000;
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