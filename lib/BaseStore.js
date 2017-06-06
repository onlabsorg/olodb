/**
 *  # olojs.OlodbStore module.
 *  - **Version:** 0.2.x
 *  - **Author:** Marcello Del Buono <m.delbuono@onlabs.org>
 *  - **License:** MIT
 */

const co = require("co");
const olojs = require("olojs");
const Path = olojs.Path;
const isEqual = require("lodash/isEqual");


class Store extends olojs.Store {

    // this getter implementation should return a sharedb connection
    get connection () {}    
    
    getUserRole (collection, docName) {
        return Promise.resolve(olojs.roles.OWNER);
    }
}


Store.Document = class extends olojs.Store.Document {

    __init () {
        const self = this;
        return co(function* () {
            const parsedId = self.id.split(".");
            self._collection = parsedId[0];
            self._docName = parsedId[1];
        });
    }

    __fetch () {
        const self = this;
        return co(function* () {
            self._shareDoc = self.store.connection.get(self._collection, self._docName);

            yield new Promise ((resolve, reject) => {
                self._shareDoc.subscribe((err) => {
                    if (err) reject(err); else resolve();
                });
            });

            if (self._shareDoc.type === null) {
                self._shareDoc.destroy();
                return null;
            }

            self._lastOps = null;
            self._shareDoc.on('op', (ops, source) => {
                if (isEqual(ops, self._lastOps)) return;
                self._lastOps = ops;
                for (let op of ops) {
                    self._dispatchOperation(op);
                }
            });
            
            return self._shareDoc.data;
        });
    }
    
    __create (content) {
        const self = this;
        return co(function* () {
            self._shareDoc = self.store.connection.get(self._collection, self._docName);
            yield new Promise((resolve, reject) => {
                self._shareDoc.create(content, (err) => {
                    if (err) reject(err); else resolve();
                });
            });
        })
    }

    __getItemValue (path) {
        //if (this._shareDoc.type === null) return null;
        return path.lookup(this._shareDoc.data);
    }

    __setDictItem (dictPath, key, newValue) {
        const itemPath = new Path(dictPath, key);
        const oldValue = this.__getItemValue(itemPath);
        this._shareDoc.submitOp({
            p  : Array.from(itemPath),
            od : oldValue === null ? undefined : oldValue,
            oi : newValue
        });
    }

    __removeDictItem (dictPath, key) {
        const itemPath = new Path(dictPath, key);
        const oldValue = this.__getItemValue(itemPath);
        if (oldValue !== null) this._shareDoc.submitOp({
            p  : Array.from(itemPath),
            od : oldValue
        });
    }

    __setListItem (listPath, index, newItem) {
        var itemPath = new Path(listPath, index);
        this._shareDoc.submitOp({
            p  : Array.from(itemPath),
            ld : this.__getItemValue(itemPath),
            li : newItem
        });
    }

    __insertListItem (listPath, index, newItem) {
        var itemPath = new Path(listPath, index);
        this._shareDoc.submitOp({
            p  : Array.from(itemPath),
            li : newItem
        });
    }

    __removeListItem (listPath, index) {
        var itemPath = new Path(listPath, index);
        this._shareDoc.submitOp({
            p  : Array.from(itemPath),
            ld : this.__getItemValue(itemPath)
        });
    }

    __insertTextString (textPath, index, string) {
        this._shareDoc.submitOp({
            p  : textPath.concat(index),
            si : string
        });
    }

    __removeTextString (textPath, index, count) {
        const parent = this.__getItemValue(textPath.parent);
        const key = textPath.leaf;
        const text = parent[key];
        const string = text.slice(index, index+count);
        this._shareDoc.submitOp({
            p  : textPath.concat(index),
            sd : string
        });
    }

    __close () {
        return new Promise ((resolve, reject) => {
            this._shareDoc.destroy((err) => {
                if (err) reject(err); else resolve();
            });
        });
    }

    _dispatchOperation (op) {
        var path = Path.from(op.p);

        // setDictItem change
        if ('od' in op && 'oi' in op) {
            var removed = op.od;
            var inserted = op.oi;
        }

        // setDictItem change
        else if (!('od' in op) && 'oi' in op) {
            var removed = null;
            var inserted = op.oi;
        }

        // removeDictItem change
        else if ('od' in op && !('oi' in op)) {
            var removed = op.od;
            var inserted = null;
        }

        // setListItem change
        if ('ld' in op && 'li' in op) {
            var removed = op.ld;
            var inserted = op.li;
        }

        // insertListItem change
        if (!('ld' in op) && 'li' in op) {
            var removed = null;
            var inserted = op.li;
        }

        // removeListItem change
        if ('ld' in op && !('li' in op)) {
            var removed = op.ld;
            var inserted = null;
        }

        // insertText change
        if ('si' in op) {
            var removed = "";
            var inserted = op.si;
        }

        // removeText change
        if ('sd' in op) {
            var removed = op.sd;
            var inserted = "";
        }

        this._dispatch(path, removed, inserted);
    }
}


module.exports = Store;
