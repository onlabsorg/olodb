
const co = require("co");
const SharedbServer = require("./SharedbServer");
const olojs = require("olojs");


class Server extends SharedbServer {
    
    _rpc_auth (agent, credentials) {
        const self = this;
        return co(function* () {
            agent.custom.userId = yield self.auth(credentials)
            return agent.custom.userId;
        });
    }
    
    _rpc_getUserRole (agent, collection, docName) {
        return this.getUserRole(agent.custom.userId, collection, docName);
    }
    
    __onDoc (req, done) {
        const userId = req.agent.custom.userId || "guest";
        this.assertRole(userId, olojs.roles.READER, req.collection, req.id).then(done).catch(done);
    }


    __onApply (req, done) {
        if (!(req.op.create || req.op.del)) return done();
        const userId = req.agent.custom.userId || "guest";
        this.assertRole(userId, olojs.roles.OWNER, req.collection, req.id).then(done).catch(done);
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
        const userId = req.agent.custom.userId || "guest";
        this.assertRole(userId, role, req.collection, req.id).then(done).catch(done);
    }
    
    auth (credentials) {
        return Promise.resolve(null);
    }
    
    getUserRole (userId, collection, docName) {
        return Promise.resolve(olojs.roles.OWNER);
    }

    assertRole (userId, requiredRole, collection, docName) {
        return new Promise((resolve, reject) => {
            if (userId === "admin") resolve();
            else this.getUserRole(userId, collection, docName)
            .then((role) => {
                if (role >= requiredRole) resolve();
                else reject(`Access permission denied to user '${userId}' on document '${collection}.${docName}'`)
            })
            .catch(reject);
        });
    }    
}


module.exports = Server;
