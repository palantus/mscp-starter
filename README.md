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
        "main": "main.js"
      }
    ]
  }
}
```
