module.exports.cleanServiceDetails = (serviceDetails) => {
    let cleanedServiceDetails = [];
    for (let i = 0; i < serviceDetails.length; i++) {
        if (!serviceDetails[i]) {
            continue;
        }
        if (serviceDetails[i].at) {
            if (serviceDetails[i].at == "On time" || serviceDetails[i].at == "No report") {
                serviceDetails[i].at = serviceDetails[i].st;
            }
        }
        cleanedServiceDetails.push(serviceDetails[i]);
    }
    return cleanedServiceDetails;
};