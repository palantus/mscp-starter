# Starter for MSCP

Used to manage a set of microservices and keeping them alive.

Use forever to make starter run "forever":

```
forever start -c "node --harmony-async-await" main.js
```

On Windows you can install it as a service with the following command. It depends on the package "winser", that needs to be installed globally.
```
npm run-script install-windows-service
```

And uninstall:
```
npm run-script uninstall-windows-service
```

## Usage

Add mscp services to setup.json like this:

```
{
  [...]
  "starter": {
    "services": [
      {
        "name": "passec",
        "path": "../mscp-passec",
        "main": "main.js",
        "args": ["-db", "../my.db"]
      }
    ]
  }
}
```

If you need to add a service that isn't created using MSCP, then you need to set ''isMSCP'' to false for the service. That tells Starter to not wait for startup confirmation.

## proxy

http-proxy-middleware has been built in to support proxying requests to multiple services from a single port (based on hostname). First you need to enable it in setup.json for the starter:

```
proxyEnable: true,
proxyPort: 3000,
proxyRewrite: {                     (optional)
    '^/api/getBucket' : '/b',       // rewrite path
    '^/api/remove/path' : '/path'   // remove base path
},
proxySSL: {}                        //object to be passed to https.createServer() (optional)
```

(rewrites are optional)

Then you need to add a domain to forward to a service setup in the same file:

```
{
  "name": "test1",
  "path": "../temp/test/test1",
  "main": "main.js",
  "enabled": true,
  "domain": "t1.localhost"
}
```

This will cause all request to t1.localhost:<proxyPort> to be forwarded to http://localhost:<port in service setup.json>.

It is also possible to add additional proxy addresses outside of the services:

```
proxyRoutes: {
  ".*/ws/remote" : "http://192.168.0.123:9000",
  "test.mydomain.com" : "http://192.168.0.123:9000"
}
```
