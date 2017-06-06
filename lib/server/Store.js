
const co = require("co");
const BaseStore = require("../BaseStore");


class Store extends BaseStore {
    
    constructor (sharedb) {
        super();
        this.sharedb = sharedb;
    }
    
    __connect () {
        this._sharedbConnection = this.sharedb.connect();
        return Promise.resolve();
    }
    
    get connection () {
        return this._sharedbConnection;
    }    
}

Store.Document = class extends BaseStore.Document {}

module.exports = Store;