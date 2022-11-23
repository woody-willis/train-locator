const express = require("express");
const app = express();
const port = 3000;

// v1

app.get("/v1/get-location-from-id/:id", (req, res) => {
    res.send("ID: " + req.params.id);
});

app.listen(port, () => console.log(`API listening on port ${port}!`));