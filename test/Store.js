
const storeTest = require("olojs/test/Store");

const Store = require("../client").Store;
const store = new Store("ws://localhost:8010");

storeTest.describeStore("Store", store);
