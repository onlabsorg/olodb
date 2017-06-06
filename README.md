# olodb
OT concurrent JSON database client and server over WebSockets.


## Server: getting started in 5 steps

### 1. Installation
```javascript
npm install olodb
```
Requirements:
- a `MongoDB` instance running on port 27017

### 2. Create the server
```javascript
const olodb = require("olodb/server");
const server = new olodb.Server();
```

### 3. Define the authentication function
```javascript
server.auth = async function (credentials) {
    // ...
}
```
Based on the credentials object, this method should return a user id or null. 
A `null` user id will be intended as the user with minimum permissions.  
    
By default it returns `null`.  


### 4. Define the users permissions
```javascript
server.getUserRole = async function (userId, collection, docName) {
    // ...
}
```
For each combination of parameters `userId`, `collection` and `docName`, it should return one of the following:
- `olojs.roles.OWNER` to grant write permissions to the user on the entire document
- `olojs.rights.WRITER` to grant write permissions to the user only on the `data` root key
- `olojs.rights.READER` to grant read-only permission to the user 
- `olojs.rights.NONE` to deny access 
  
By default it returns always `olojs.roles.OWNER`.  


### 5. Start listening to incoming connections
```javascript
server.listen(httpServer).then(/*...*/).catch(/*...*/);
```
**httpServer** is a [nodejs http.Server](https://nodejs.org/dist/latest-v6.x/docs/api/http.html#http_class_http_server)


## Client: getting started in 5 steps

### 1. Installation

In NodeJS:
```javascript
npm install olodb
```

In the browser:
```javascript
jspm install olodb=github:onlabsorg/olodb
```

### 2. Connect to the remote store
```javascript
const olodb = require("olodb/client");
const store = new olodb.Store("wss:/hostname");
await store.connect(credentials)
```
The `credentials` object is defined by the server-side `server.auth` function.


### 3. Fetch a document
```javascript
var doc = await store.getDocument(docId);
await doc.open();
```

### 4. Read/Edit the document content
```javascript

// retrieve and change the document root dictionary
var root = doc.get();
root.value = {a:1, b:2, c:['x','y','z'], d={u:10, v:20, w:30}, s:"abcdef"};

// retrieve and edit a primitive item
var item = root.get('a');
item.value              // -> 1
item.type === "numb"    // true

// retrieve and edit a Dict item
var dict = root.get('d');
dict.value              // -> {u:10, v:20, w:30}
dict.type === "dict";   // true
dict.set('v', 21);      // change value of item d/v
dict.remove('v');       // remove the key 'v' from the dictionary

// retrieve and edit a List item
var list = root.get('c');
list.value              // -> ['x','y','z']
list.type === "list";   // true
list.size === 3;        // true
list.set(1, 'yy');      // change the value of item c/1
list.insert(1, 'xy')    // c is now equal to ['x', 'xy', 'yy', z]
list.remove(2);         // c is now equal to ['x', 'xy', z]

// retrieve and edit a Text item
var text = root.get('s');
text.value              // -> "abcdef"
text.size === 6         // true
text.insert(1, "xxx");  // s is now equal to "axxxbcdef";
text.remove(1, 3);      // s is now equal to "abcdef"

// retrieve deep items
var u = doc.get().get('d').get('u');
var u = doc.get().get('d/u');
var u = doc.get('d/u');
```

### 5. Subscribe to changes
```javascript
var subscription = doc.get('d').subscribe( (change) => {...} );
// ...
subscription.cancel();
```

Every time the document item `d` changes, the callback gets called with
an [olojs][] `Change` object as parameter.  


### 6. Close
```javascript
await doc.close();
await store.disconnect();
```


## Dcumentation
`olodb` is an implementation of the [olojs][] Store.  
You can refer to the olojs documentation for detailed store API.



## Related projects

You may also be interested in the following projects:

* [olojs][]: A library defining the Store interface that `olodb` implements.
* [ShareDB][]: A database frontend for concurrent editing systems on which olodb is based
* [olowc][]: Collection of web-components acting as web interface to the remote data structures provided by olojs.
* [olopy][]: A Python implementation of olojs.
* [olowa][]: A web application leveraging olojs, [olowc][] and [olodb][] to create a
  concurrent data browser and editor for the web.


## License
MIT - Copyright (c) 2017 Marcello Del Buono <m.delbuono@onlabs.org>




[olowa]: https://github.com/onlabsorg/olowa
[olojs]: https://github.com/onlabsorg/olojs
[olowc]: https://github.com/onlabsorg/olowc
[olopy]: https://github.com/onlabsorg/olopy
[ShareDB]: https://github.com/share/sharedb

