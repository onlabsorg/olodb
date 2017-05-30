/**
 *  # OlodbServer module
 *  - **Version:** 0.1.2
 *  - **Author:** Marcello Del Buono <m.delbuono@onlabs.org>
 *  - **License:** MIT
 *  - **Content:**
 *      - [class OlodbServer](#olodbserver-class)
 */


const co = require("co");

const logger = require("./utils").logger;
//logger.level = "debug";

const url = require("url");

const WebSocket = require('ws');
const WebSocketJSONStream = require('websocket-json-stream');
const ShareDB = require("sharedb");

const BaseStore = require("./Store");
const olojs = require("olojs");


class ServerStore extends BaseStore {
    
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

ServerStore.Document = class extends BaseStore.Document {}





class SharedbServer {
    
    constructor (type="mongo") {

        // Create ShareDB backend
        switch (type) {

            case "memory":
                const ShareDBMingo = require("sharedb-mingo-memory");
                this.backend = new ShareDBMingo();
                break;

            case "mongo":
            default:
                const ShareDBMongo = require('sharedb-mongo');
                this.backend = ShareDBMongo('mongodb://localhost:27017/olodb');
                break;
        }

        // Create ShareDB root connection to the backend
        this.sharedb = new ShareDB({db: this.backend});
        this.store = new ServerStore(this.sharedb);

        // Listen to the ShareDB events
        this.sharedb.use('connect'      , (req, done) => this.__onConnect(req, done));
        this.sharedb.use('op'           , (req, done) => this.__onOp(req, done));
        this.sharedb.use('doc'          , (req, done) => this.__onDoc(req, done));
        this.sharedb.use('query'        , (req, done) => this.__onQuery(req, done));
        this.sharedb.use('submit'       , (req, done) => this.__beforeSubmit(req, done));
        this.sharedb.use('apply'        , (req, done) => this.__onApply(req, done));
        this.sharedb.use('commit'       , (req, done) => this.__onCommit(req, done));
        this.sharedb.use('after submit' , (req, done) => this.__afterSubmit(req, done));
        this.sharedb.use('receive'      , (req, done) => this._handleWebSocketMessage(req, done));
    }    


    listen (httpServer) {
        const self = this;
        return co(function* () {
            
            self.httpServer = httpServer;
            self.wss = new WebSocket.Server({server:httpServer});

            self.wss.on('connection', (ws) => {
                logger.debug(`New WebSocket connection.`);
                var stream = new WebSocketJSONStream(ws);
                self.sharedb.listen(stream);
            });

            yield new Promise((resolve,reject) => {
                self.wss.on('listening', () => resolve());                            
            });
            
            yield self.store.connect();
        });
    }
    
    
    // intercepts RPC calls
    _handleWebSocketMessage (req, done) {
        if (req.data.rid) {
            let methodName = `_rpc_${req.data.method}`;
            let res = null;
            if (typeof(this[methodName]) === "function") {
                this[methodName](req.agent, ...req.data.args)
                .then((res) => {
                    req.agent.stream.ws.send(JSON.stringify({rid:req.data.rid, res:res}));
                    done("This was an RPC, not a ShareDB message.");
                })
                .catch(done);
            }
        }
        else {
            this.__onMessage(req, done);
        }        
    }
    
    
    // A new client connected to the server.
    __onConnect (req, done) {done()}

    // An operation was loaded from the database.
    __onOp (req, done) {done()}

    // A snapshot was loaded from the database.
    __onDoc (req, done) {done()}

    // A query is about to be sent to the database
    __onQuery (req, done) {done()}

    // An operation is about to be submited to the database
    __beforeSubmit (req, done) {done()}

    // An operation is about to be applied to a snapshot before being committed to the database
    __onApply (req, done) {done()}

    // An operation was applied to a snapshot; The operation and new snapshot are about to be written to the database.
    __onCommit (req, done) {done()}

    // An operation was successfully submitted to the database.
    __afterSubmit (req, done) {done()}

    // Received a message from a client
    __onMessage (req, done) {done()}
}



class OlodbServer extends SharedbServer {
    
    _rpc_getUserId (agent, credentials) {
        const self = this;
        return co(function* () {
            agent.custom.userId = yield self.getUserId(credentials)
            return agent.custom.userId;
        });
    }
    
    _rpc_getUserRole (agent, collection, docName) {
        return this.getUserRole(agent.custom.userId, collection, docName);
    }
    
    
    __onDoc (req, done) {
        this.assertRole(olojs.roles.READER, req.agent, req.collection, req.id).then(done).catch(done);
    }


    __onApply (req, done) {
        if (!(req.op.create || req.op.del)) return done();
        this.assertRole(olojs.roles.OWNER, req.agent, req.collection, req.id).then(done).catch(done);
    }


    __onCommit (req, done) {
        if (req.op.create || req.op.del) return done();
        var role = olojs.roles.WRITER;
        for (let op of req.op.op) {
            if (op.p[0] !== "data") {
                role = olojs.roles.OWNER;
                break;
            }
        }      
        this.assertRole(role, req.agent, req.collection, req.id).then(done).catch(done);
    }

    
    assertRole (requiredRole, agent, collection, docName) {
        return new Promise((resolve, reject) => {
            const userId = agent.custom.userId;
            if (agent === this.store.connection.agent) resolve();
            else this.getUserRole(userId, collection, docName)
            .then((role) => {
                if (role >= requiredRole) resolve();
                else reject(`Access permission denied to user '${userId}' on document '${collection}.${docName}'`)
            })
            .catch(reject);
        });        
    }
    
    getUserId (credentials) {}

    
    getUserRole (userId, collection, docName) {
        return Promise.resolve(olojs.roles.OWNER);
    }
}


exports.ServerStore = ServerStore;
exports.SharedbServer = SharedbServer;
exports.OlodbServer = OlodbServer;



// Markdown links used for documentation

/**
 *  [ShareDB]: https://github.com/share/sharedb
 *  [olojs]: https://github.com/onlabsorg/olojs
 *  [MongoDB]: https://www.mongodb.com/
 */
