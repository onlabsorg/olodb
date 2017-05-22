/**
 *  # OlodbServer module
 *  - **Version:** 0.1.2
 *  - **Author:** Marcello Del Buono <m.delbuono@onlabs.org>
 *  - **License:** MIT
 *  - **Content:**
 *      - [class OlodbServer](#olodbserver-class)
 */



const logger = require("./logger");
//logger.level = "debug";

const url = require("url");

const ShareDB = require("sharedb");
const WebSocketJSONStream = require('websocket-json-stream');

const Async = require("asyncawait/async");
const Await = require("asyncawait/await");

const roles = require("./roles");



/**
 *  ## OlodbServer class
 *  Class representing a concurrent JSON database server over WebSockets.
 *  It uses [ShareDB][] under the hood.
 *  A client implementation is [olojs][].
 */
class OlodbServer {

    /**
     *  ### Constructor
     *  ```javascript
     *  var olodb = new OlodbStore();
     *  ```
     *  This will create a server bound to a [MongoDB][] database.
     *
     *  For testing purposes it is also possible to bind to an in-memory database:
     *  ```javascript
     *  var olodb = new OlodbStore("memory");
     *  ```
     */
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
        this.rootConnection = this.sharedb.connect();
        this.rootConnection.agent.custom.userName = "Root";

        // Listen to the ShareDB events
        this.sharedb.use('connect'      , (req, done) => this._onConnect(req, done));
        this.sharedb.use('op'           , (req, done) => this._onOp(req, done));
        this.sharedb.use('doc'          , (req, done) => this._onDoc(req, done));
        this.sharedb.use('query'        , (req, done) => this._onQuery(req, done));
        this.sharedb.use('submit'       , (req, done) => this._beforeSubmit(req, done));
        this.sharedb.use('apply'        , (req, done) => this._onApply(req, done));
        this.sharedb.use('commit'       , (req, done) => this._onCommit(req, done));
        this.sharedb.use('after submit' , (req, done) => this._afterSubmit(req, done));
        this.sharedb.use('receive'      , (req, done) => this._onMessage(req, done));
    }



    /**
     *  ### OlodbServer.prototype.listen(httpServer) - async method
     *  Starts listening to incoming client connections.
     *  - **httpServer** is a [nodejs http.Server](https://nodejs.org/dist/latest-v6.x/docs/api/http.html#http_class_http_server)
     */
    listen (httpServer) {
        return new Promise((resolve, reject) => {
            this.httpServer = httpServer;

            const WebSocket = require('ws');
            this.wss = new WebSocket.Server({server:httpServer});

            this.wss.on('connection', (ws) => {
                logger.debug(`New WebSocket connection.`);
                var stream = new WebSocketJSONStream(ws);
                this.sharedb.listen(stream);
            });

            this.wss.on('listening', () => {
                resolve();
            });
        });
    }



    //
    //  ShareDB event handlers
    //

    // A new client connected to the server.
    _onConnect (req, done) {

        // retrieve the username from the query string parameter 'auth'
        try {
            let reqURL = url.parse(req.agent.stream.ws.upgradeReq.url, true);
            var userName = this.auth(reqURL.query.auth) || "guest";
        }
        catch (err) {
            var userName = "guest";
        }

        // save the userName in the session data
        req.agent.custom.userName = userName;

        logger.info(`[olodb]: ${userName} connected to the server with clientId ${req.agent.clientId}.`);
        return done();
    }

    // An operation was loaded from the database.
    _onOp (req, done) {
        var userName = req.agent.custom.userName;
        logger.debug(`[olodb]: an operation was loaded from the database by ${userName}.`);
        done();
    }

    // A snapshot was loaded from the database.
    _onDoc (req, done) {
        var userName = req.agent.custom.userName;
        logger.debug(`[olodb]: a snapshot was loaded from the database by ${userName}.`);
        this.allowRead(req.agent, req.collection, req.id, []).then(done).catch(done);
    }

    // A query is about to be sent to the database
    _onQuery (req, done) {
        var userName = req.agent.custom.userName;
        logger.debug(`[olodb]: a query is about to be sent to the database by ${userName}.`);
        done();
    }

    // An operation is about to be submited to the database
    _beforeSubmit (req, done) {
        var userName = req.agent.custom.userName;
        logger.debug(`[olodb]: an operation is about to be submited to the database by ${userName}.`);
        done();
    }

    // An operation is about to be applied to a snapshot before being committed to the database
    _onApply (req, done) {
        var userName = req.agent.custom.userName;
        logger.debug(`[olodb]: an operation is about to be applied to a snapshot before being committed to the database by ${userName}.`);

        if (req.op.create || req.op.del) {
            this.allowWrite(req.agent, req.collection, req.id, []).then(done).catch(done);
        }
        else done();
    }

    // An operation was applied to a snapshot; The operation and new snapshot are about to be written to the database.
    _onCommit (req, done) {
        var userName = req.agent.custom.userName;
        logger.debug(`[olodb]: an applied operation and a new snapshot are about to be written to the database by ${userName}.`);

        if (req.op.create || req.op.del) return done();

        const self = this;
        const allowWriteAll = Async(function () {
            for (let op of req.op.op) {
                Await(self.allowWrite(req.agent, req.collection, req.id, op.p));
            }
        });
        allowWriteAll().then(done).catch(done);
    }

    // An operation was successfully submitted to the database.
    _afterSubmit (req, done) {
        var userName = req.agent.custom.userName;
        logger.debug(`[olodb]: an operation was successfully submitted to the database by ${userName}.`);
        done();
    }

    // Received a message from a client
    _onMessage (req, done) {
        var userName = req.agent.custom.userName;
        var msgData = req.data;
        if (msgData.rid) {
            logger.debug(`[olodb]: ${msgData.method} RPC received from ${userName}.`);

            var methodName = `_rpc_${msgData.method}`;
            var res = null;
            if (typeof(this[methodName]) === "function") {
                this[methodName](req.agent, ...msgData.args)
                .then((res) => {
                    req.agent.stream.ws.send(JSON.stringify({rid:msgData.rid, res:res}));
                    done("This was an RPC, not a ShareDB message.");
                })
                .catch(done);
            }
        }
        else {
            logger.debug(`[olodb]: ShareDB message received from ${userName}.`);
            done();
        }
    }



    //
    //  Remote Procedure Call handlers
    //

    // User name request
    _rpc_getUserName (agent) {
        return new Promise((resolve, reject) => {
            resolve(agent.custom.userName);
        });
    }

    // User roles request
    _rpc_getUserRole (agent, collection, docId) {
        var userName = agent.custom.userName;
        return this.getUserRole(userName, collection, docId);
    }




    /**
     *  ### OlodbServer.prototype.fetchDocument(collection, docId) - async method
     *  Resolves the document content as plain javascript object.
     */
    fetchDocument (collection, id) {
        return new Promise((resolve, reject) => {
            var doc = this.rootConnection.get(collection, id);
            doc.fetch((err) => {
                if (err) {
                    reject(err);
                }
                else if (doc.type === null) {
                    doc.destroy();
                    resolve(null);
                }
                else {
                    resolve(doc);
                }
            });
        });
    }



    /**
     *  ### OlodbServer.prototype.createDocument(collection, docId, value) - async method
     *  Creates a new document with given value.
     */
    createDocument (collection, id, value) {
        return new Promise((resolve, reject) => {
            var doc = this.rootConnection.get(collection, id);
            doc.subscribe((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    doc.create(value, (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(doc);
                        }
                    });
                }
            });
        });
    }



    /**
     *  ### OlodbServer.prototype.auth(credentials)
     *  This method should be defined by the class user after instantiating a new OlodbServer.
     *  Based on the credentials object, this method should return a user name or null.
     *  A `null` username will be intended as the user with minimum permissions.
     *
     *  By default it returns `null`.
     */
    auth (credentials) {
        return null;
    }



    /**
     *  ### OlodbServer.prototype.getUserRole(userName, collection, docId)
     *  This method should be defined by the class user after instantiating a new OlodbServer.
     *  For each combination of parameters `userName`, `collection` and `docId`, it should return one of the following:
     *
     *  | Role         | meta data  |    body    |
     *  |--------------|:----------:|:----------:|
     *  | roles.OWNER  |     rw     |     rw     |
     *  | roles.WRITER |     ro     |     rw     |
     *  | roles.READER |     ro     |     ro     |
     *  | roles.NONE   |     -      |     -      |
     *
     *  By default it returns `olodb.roles.OWNER`.
     */
    getUserRole (userName, collection, docId) {
        return new Promise((resolve, reject) => {
            resolve(roles.OWNER);
        });
    }



    //
    //  Rejects if the `agent` doesn't have `action` permissions on the given document.
    //
    allow (action, agent, collection, docId, path) {
        return new Promise((resolve, reject) => {
            var userName = agent.custom.userName;
            var fullPath = collection + "." + docId + "/" + path.join("/");

            if (agent === this.rootConnection.agent) {
                logger.debug(`[olodb]: ${action} permission GRANTED to Root on ${path}.`);
                resolve();
            }
            else {
                this.getUserRole(agent.custom.userName, collection, docId)
                .then((userRole) => {
                    const isMeta = this._isMeta(path);
                    const allowed = (action === "READ" && userRole >= roles.READER) ||
                                    (action === "WRITE" && !isMeta && userRole >= roles.WRITER) ||
                                    (action === "WRITE" && isMeta && userRole >= roles.OWNER);
                    if (allowed) {
                        logger.debug(`[olodb]: ${action} permission GRANTED to ${userName} on ${fullPath}.`);
                        resolve();
                    }
                    else {
                        logger.debug(`[olodb]: ${action} permission DENIED to ${userName} on ${fullPath}.`);
                        reject("Permission denied.");
                    }
                })
                .catch((error) => {
                    logger.debug(`[olodb]: ${action} permission DENIED to ${userName} on ${fullPath}.`);
                    reject(error);
                });
            }
        });
    }
    
    _isMeta (path) {
        return (path[0] === "__meta__" || path.length === 0);
    }

    allowRead (agent, collection, docId, path) {
        return this.allow('READ', agent, collection, docId, path);
    }

    allowWrite (agent, collection, docId, path) {
        return this.allow('WRITE', agent, collection, docId, path);
    }
}



module.exports = OlodbServer;



// Markdown links used for documentation

/**
 *  [ShareDB]: https://github.com/share/sharedb
 *  [olojs]: https://github.com/onlabsorg/olojs
 *  [MongoDB]: https://www.mongodb.com/
 */
