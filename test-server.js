
const port = 8010;
const basePath = __dirname;

const co = require("co");


const express = require('express');
const router = express();
router.use(express.static(basePath, {etag:false}));

const http = require("http");
const server = http.createServer(router);

const OlodbServer = require("./lib/server").OlodbServer;
const olodb = new OlodbServer("memory");

const olojs = require("olojs");
const test = require("olojs/test/Store");



olodb.getUserId = function (userId) {
    return Promise.resolve(userId);
}

olodb.getUserRole = function (userId, collection, docName) {
    return co(function* () {
        if (collection === "owned") return olojs.roles.OWNER;
        if (collection === "writable") return olojs.roles.WRITER;
        if (collection === "readonly") return olojs.roles.READER;
        if (collection === "private") return olojs.roles.NONE;
        return olojs.roles.NONE;        
    })
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
        console.log("To run a complete test in the browser: http://localhost:8010/test/index.html");
        console.log();
        console.log("To test a specific component in the browser:");
        console.log("- Store with memory backend: http://localhost:8010/test/index.html#MemoryStore");
        console.log("- Store with local backend:  http://localhost:8010/test/index.html#LocalStore");
        console.log("- Store with olodb backend:  http://localhost:8010/test/index.html#OlodbStore");
        console.log();        
    })
    .catch((err) => {
        throw err;
    });

});


server.listen(port, function () {
    console.log(`Test HTTP server listening on port ${port}!`);
});
