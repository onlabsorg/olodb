
const storeTest = require("olojs/test/Store");

const OlodbStore = require("../lib/client").Store;
OlodbStore.Document.prototype.__getUserRole = storeTest.getUserRole;

const store = new OlodbStore("ws://localhost:8010");

storeTest.describeStore("OlodbStore", store);
