# olodb
OT concurrent JSON database server over WebSockets.


## Getting started in 5 steps

### 1. Installation
```javascript
npm install olodb
```
Requirements:
- a `MongoDB` instance running on port 27017

### 2. Create the server
```javascript
const olodb = require("olodb");
const olodbServer = new olodb.Server();
```

### 3. Define the authentication function
```javascript
olodbServer.auth = function (credentials) {
    // ...
}
```
Based on the credentials object, this method should return a user name or null. 
A `null` username will be intended as the user with minimum permissions.  
    
By default it returns `null`.  


### 4. Define the users permissions
```javascript
olodbServer.getUserRights = function (userName, collection, docId) {
    // ...
}
```
For each combination of parameters `userName`, `collection` and `docId`, it should return one of the following:
- `olodb.rights.WRITE` to grant write permissions to the user
- `olodb.rights.READ` to grant read-only permission to the user 
- `olodb.rights.NONE` to deny access 
  
By default it returns `olodb.rights.WRITE`.  


### 5. Start listening to incoming connections
```javascript
olodbServer.listen(httpServer).then(/*...*/).catch(/*...*/);
```
**httpServer** is a [nodejs http.Server](https://nodejs.org/dist/latest-v6.x/docs/api/http.html#http_class_http_server)


## Documentation

* API's
    * [OlodbServer][]: the server class


## Related projects

You may also be interested in the following projects:

* [olojs][]: A JS olodb client.
* [ShareDB][]: A database frontend for concurrent editing systems on which olodb is based
* [olowc][]: Collection of web-components acting as web interface to the remote data structures provided by olojs.
* [olopy][]: A Python implementation of olojs.
* [olo][]: A web application leveraging olojs, [olowc][] and [olodb][] to create a
  concurrent data browser and editor.


## License
MIT - Copyright (c) 2017 Marcello Del Buono (m.delbuono@onlabs.org)




[OlodbServer]: ./doc/OlodbServer.md
[olo]: https://github.com/onlabsorg/olo
[olojs]: https://github.com/onlabsorg/olojs
[ShareDB]: https://github.com/share/sharedb
[olowc]: https://github.com/onlabsorg/olowc
[olopy]: https://github.com/onlabsorg/olopy
[olo]: https://github.com/onlabsorg/olo

