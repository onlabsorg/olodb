/**
 *  # olojs.OlodbStore module.
 *  - **Version:** 0.2.x
 *  - **Author:** Marcello Del Buono <m.delbuono@onlabs.org>
 *  - **License:** MIT
 */

const co = require("co");
const olojs = require("olojs");
const isEqual = require("lodash/isEqual");
const uuid = require("uuid");
const ShareDB = require("sharedb/lib/client/index");

const BaseStore = require("./Store");

// import websocket module in nodejs
var WebSocket = require("ws");


/**
 *  ## OlodbStore class
 *  Implements the [Store](./Store.md) interface for a [ShareDB](https://github.com/share/sharedb)
 *  backend.
 */
class Store extends BaseStore {

    /**
     *  ### new OlodbStore(url) - constructor
     *  ###### Parameters
     *  - `url` : the websocket url of the remote olodb server
     */
    constructor (url) {
        super();
        this.url = url;
    }

    __connect (credentials) {
        return new Promise((resolve, reject) => {
            this._socket = new WebSocket(this.url);

            this._socket.onopen = () => {
                this._sharedbConnection = new ShareDB.Connection(this._socket);
                this._pendingRequests = {};
                this._sharedbMessageHandler = this._socket.onmessage;
                this._socket.onmessage = (msg) => this._handleMessage(msg);
                
                this._call("getUserId", credentials)
                .then((userId) => {
                    const user = new BaseStore.User(userId);
                    resolve(user);
                })
                .catch(reject);
            }

            this._socket.onerror = reject;
        });
    }
    
    __getUserRole (collection, docName) {
        return this._call('getUserRole', collection, docName);
    }
    
    get connection () {
        return this._sharedbConnection;
    }

    __connected () {
        return this._socket && this._socket.readyState === 1;
    }

    __disconnect () {
        return new Promise((resolve, reject) => {
            this._socket.onclose = resolve;
            this._socket.onerror = reject;
            this._socket.close();
        });
    }

    _call (method, ...args) {
        return new Promise((resolve, reject) => {
            var rid = uuid.v4();
            var msg = JSON.stringify({rid:rid, method:method, args:args});
            this._pendingRequests[rid] = (res) => resolve(res);
            this._socket.send(msg);
        });
    }

    _handleMessage (msg) {
        var msgData = JSON.parse(msg.data);

        if (msgData.rid) {
            var callback = this._pendingRequests[msgData.rid];
            if (callback) {
                callback(msgData.res);
                delete this._pendingRequests[msgData.rid];
            }
        }
        else {
            this._sharedbMessageHandler(msg);
        }
    }
}

Store.Document = class extends BaseStore.Document {}


exports.Store = Store;
