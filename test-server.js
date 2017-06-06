
const port = 8010;
const basePath = __dirname;

const co = require("co");


const express = require('express');
const router = express();
router.use(express.static(basePath, {etag:false}));

const http = require("http");
const server = http.createServer(router);

const TestServer = require("./server").Server;
const olodb = new TestServer("memory");

const olojs = require("olojs");
const test = require("olojs/test/Store");



olodb.auth = function (userId) {    
    return Promise.resolve(userId);
}

olodb.getUserRole = function (userId, collection, docName) {
    const docId = `${collection}.${docName}`;
    return test.getUserRole(docId)
}


olodb.listen(server).then(() => {
    console.log(`Test olodb server listening on port ${port}!`);

    co(function* () {
        for (let docId in test.data) {
            doc = yield olodb.store.getDocument(docId);
            yield doc.open();
            doc.get("/").value = test.data[docId];
            yield doc.close();
        }        
    })
    .then(() => {
        console.log();
        console.log("To run a NodeJS client test: mocha test/Store");
        console.log("To run a browser client test: http://localhost:8010/test/index.html#Store");
        console.log();        
    })
    .catch((err) => {
        throw err;
    });

});


server.listen(port, function () {
    console.log(`Test HTTP server listening on port ${port}!`);
});
