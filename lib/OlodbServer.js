
const logger = require("./logger");
const url = require("url");

const ShareDB = require("sharedb");
const WebSocketJSONStream = require('websocket-json-stream');

const Async = require("asyncawait/async");
const Await = require("asyncawait/await");

const minimatch = require("minimatch");
const matchPattern = function (path, pattern, env) {
    pattern = pattern.replace(/\$\{username\}/g, env.username);
    return minimatch(path, pattern);
}



class OlodbServer {

    constructor (type) {

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

        this.sharedb = new ShareDB({db: this.backend});

        this.rootConnection = this.sharedb.connect();
        this.rootConnection.agent.custom.userName = "Root";

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


    // A new client connected to the server.
    _onConnect (req, done) {

        try {
            let reqURL = url.parse(req.agent.stream.ws.upgradeReq.url, true);
            var userName = this.auth(reqURL.query.auth) || "guest";
        }
        catch (err) {
            var userName = "guest";
        }

        req.agent.custom.userName = userName;
        logger.info(`[ShareDB] ${userName}: connected to the server with clientId ${req.agent.clientId}.`);

        return done();
    }

    // An operation was loaded from the database.
    _onOp (req, done) {
        var userName = req.agent.custom.userName;
        logger.debug(`[ShareDB] ${userName}: an operation was loaded from the database.`);
        done();
    }

    // A snapshot was loaded from the database.
    _onDoc (req, done) {
        var userName = req.agent.custom.userName;
        logger.debug(`[ShareDB] ${userName}: a snapshot was loaded from the database.`);

        var path = req.collection + "/" + req.id;

        this._getUserRights(req.agent, req.collection, req.id)
        .then((rights) => {
            if (rights >= READ) {
                logger.debug(`[ShareDB] ${userName}: read permission granted for ${path}.`);
                return done();
            }
            else {
                logger.debug(`[ShareDB] ${userName}: read permission denied for ${path}`);
                return done(`Read permission denied for ${path}`);
            }
        })
        .catch(done);
    }

    // A query is about to be sent to the database
    _onQuery (req, done) {
        var userName = req.agent.custom.userName;
        logger.debug(`[ShareDB] ${userName}: a query is about to be sent to the database.`);
        done();
    }

    // An operation is about to be submited to the database
    _beforeSubmit (req, done) {
        var userName = req.agent.custom.userName;
        logger.debug(`[ShareDB] ${userName}: an operation is about to be submited to the database.`);
        done();
    }

    // An operation is about to be applied to a snapshot before being committed to the database
    _onApply (req, done) {
        var userName = req.agent.custom.userName;
        logger.debug(`[ShareDB] ${userName}: an operation is about to be applied to a snapshot before being committed to the database.`);

        if (req.op.create || req.op.del) {
            var path = req.collection + "/" + req.id;

            this._getUserRights(req.agent, req.collection, req.id)
            .then((rights) => {
                if (rights >= WRITE) {
                    logger.debug(`[ShareDB] ${userName}: write permission granted for ${path}.`);
                    return done();
                } else {
                    logger.debug(`[ShareDB] ${userName}: write permission denied for ${path}.`);
                    return done("Write permission denied for ${path}")
                }
            })
            .catch(done);
        }

        else done();
    }

    // An operation was applied to a snapshot; The operation and new snapshot are about to be written to the database.
    _onCommit (req, done) {
        var userName = req.agent.custom.userName;
        logger.debug(`[ShareDB] ${userName}: an operation was applied to a snapshot; operation and new snapshot are about to be written to the database.`);

        if (req.op.create || req.op.del) return done();

        var op = req.op.op[0];
        var path = req.collection + "/" + req.id + "/" + op.p.join("/");

        this._getUserRights(req.agent, req.collection, req.id)
        .then((rights) => {
            if (rights >= WRITE) {
                logger.debug(`[ShareDB] ${userName}: write permission granted for ${path}.`);
                return done();
            }
            else {
                logger.debug(`[ShareDB] ${userName}: write permission denied for ${path}`);
                return done(`Write permission denied for ${path}`);
            }

        })
        .catch(done);
    }

    // An operation was successfully submitted to the database.
    _afterSubmit (req, done) {
        var userName = req.agent.custom.userName;
        logger.debug(`[ShareDB] ${userName}: an operation was successfully submitted to the database.`);
        done();
    }

    // Received a message from a client
    _onMessage (req, done) {
        var userName = req.agent.custom.userName;
        var msgData = req.data;
        if (msgData.rid) {
            logger.debug(`[OloDB] ${userName}: ${msgData.method} RPC received.`);

            var methodName = `_rpc_${msgData.method}`;
            var res = null;
            if (typeof(this[methodName]) === "function") {
                this[methodName](req.agent, ...msgData.args)
                .then((res) => {
                    req.agent.stream.ws.send(JSON.stringify({rid:msgData.rid, res:res}));
                    done("This was an RPC, not a ShareDB message.");
                })
                .catch(done)
            }

        }
        else {
            logger.debug(`[ShareDB] ${userName}: message received.`);
            done();
        }
    }

    _rpc_getUserName (agent) {
        return new Promise((resolve, reject) => {
            resolve(agent.custom.userName);
        });
    }

    _rpc_getUserRights (agent, collection, docId) {
        var userName = agent.custom.userName;
        return this.getUserRights(userName, collection, docId);
    }

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

    auth (credentials) {
        // based on the credentials object, this method should return a user name or null
        // null will be intended as the user with minimum permissions
        return null;
    }

    _getUserRights (agent, collection, docId) {
        return Async(function (self) {
            if (agent === self.rootConnection.agent) {
                return self.constructor.rights.WRITE;
            } else {
                return Await(self.getUserRights(agent.custom.userName, collection, docId));
            }
        })(this);
    }

    getUserRights (userName, collection, docId) {
        return new Promise((resolve, reject) => {
            resolve(this.constructor.rights.WRITE);
        });
    }
}


OlodbServer.rights = {};
const NONE  = OlodbServer.rights.NONE  = 0;
const READ  = OlodbServer.rights.READ  = 1;
const WRITE = OlodbServer.rights.WRITE = 3;


module.exports = OlodbServer;
