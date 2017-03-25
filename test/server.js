const logger = require("../lib/logger");
logger.level = 'debug';

const Async = require("asyncawait/async");
const Await = require("asyncawait/await");


const port = 8080;
const http = require("http");
const server = http.createServer();


const OlodbServer = require("../lib/OlodbServer");
const olodb = new OlodbServer("memory");

const NONE  = OlodbServer.rights.NONE;
const READ  = OlodbServer.rights.READ;
const WRITE = OlodbServer.rights.WRITE;



olodb.auth = function (userId) {
    return userId;
}


olodb.getUserRights = Async(function (userName, collection, docId) {

    switch (userName) {

        case "TestUser":
            if (collection === "writable") return WRITE;
            if (collection === "readonly") return READ;
            if (collection === "private") return NONE;

        default:
            return NONE;
    }
});



olodb.listen(server).then(() => {
    console.log(`olodb server listening on port ${port}!`);
    olodb.createDocument("writable", "testDoc", {});
    olodb.createDocument("readonly", "testDoc", {
        dict: {a:10, b:11, c:12},
        list: [10, 11, 12],
        text: "abc",
        item: 10
    });
    olodb.createDocument("private", "testDoc", {});
});


server.listen(port, function () {
    console.log(`HTTP server listening on port ${port}!`);
});
