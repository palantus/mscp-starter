"use strict"

const fs = require("fs")
const path = require("path")
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const express = require('express');
const proxy = require('http-proxy-middleware');

class Handler{

  async init(){
    // Initialize handler if necessary
  }

  async initFirst(){
    if(this.mscp.setupHandler.setup.proxyEnable === true){
      this.startProxy();
    }
  }

  async startProxy(){

    if(!this.mscp.setupHandler.setup.proxyPort){
      console.log("proxyPort not defined. Proxy not starting.")
      return;
    }

    this.global.proxySettings = {
            target: 'http://NOTEXISTINGDOMAIN', // target host
            //changeOrigin: true,               // needed for virtual hosted sites
            ws: true,                         // proxy websockets
            pathRewrite: this.mscp.setupHandler.setup.proxyRewrite,
            router: this.mscp.setupHandler.setup.proxyRoutes || {},
            ssl: this.mscp.setupHandler.setup.proxySSL
        };

    if(this.global.proxySettings.ssl){
      if(this.global.proxySettings.ssl.ca)
        this.global.proxySettings.ssl.ca = fs.readFileSync(this.global.proxySettings.ssl.ca, "utf8");
      if(this.global.proxySettings.ssl.cert)
        this.global.proxySettings.ssl.cert = fs.readFileSync(this.global.proxySettings.ssl.cert, "utf8");
      if(this.global.proxySettings.ssl.key)
        this.global.proxySettings.ssl.key = fs.readFileSync(this.global.proxySettings.ssl.key, "utf8");
    }

    for(let r in (this.global.proxySettings.router || {})){
      this.global.proxySettings.router[`${r}:${this.mscp.setupHandler.setup.proxyPort}`] = this.global.proxySettings.router[r]
      delete this.global.proxySettings.router[r]
    }

    let services = []
    if(this.mscp.setupHandler.setup.starter && this.mscp.setupHandler.setup.starter.services)
      services = this.mscp.setupHandler.setup.starter.services;

    for(let s of services){
      if(s.domain !== undefined){
        let servicePort = (await this.getServiceSetup(s)).http_port
        if(servicePort){
          this.global.proxySettings.router[`${s.domain}:${this.mscp.setupHandler.setup.proxyPort}`] = `http://localhost:${servicePort}`;
        }
      }
    }

    this.global.proxy = proxy(this.global.proxySettings)

    let app = express();
    app.use('/', this.global.proxy);

    if(this.global.proxySettings.ssl)
      require("https").createServer(this.global.proxySettings.ssl, app).listen(this.mscp.setupHandler.setup.proxyPort);
    else
      app.listen(this.mscp.setupHandler.setup.proxyPort);
  }

  async services(){
    let res = []
    for(let s of this.global.services){
      let es = JSON.parse(JSON.stringify(s.setup))
      let setup = await this.getServiceSetup(es)
      es.http_port = (setup && setup.enableHTTP !== false) ? setup.http_port || 8080 : null
      es.https_port = (setup && setup.enableHTTPS === true) ? setup.https_port || 443 : null
      es.enabled = es.enabled === false ? false : true
      es.restartCount = s.restartCount
      res.push(es)
    }

    return res
  }

  async kill(name){
    for(let s of this.global.services){
      if(s.setup.name == name){
        s.worker.kill();
        return "Service stopped.";
      }
    }
    throw "Service not found"
  }

  async reload(name){
    for(let s of this.global.services){
      if(s.setup.name == name){
        s.worker.send("reload");
        return `Reload signal sent to process ${s.setup.name}`;
      }
    }
    throw "Service not found"
  }

  async gitpull(name){
    let service = this.setup(name)
    if(!service) throw "Unknown service"
    const { stdout, stderr } = await exec('git pull', {cwd: service.path});
    return stderr&&stdout?`errors: ${stderr}, info: ${stdout}`:stderr?stderr:stdout;
  }

  async npminstall(name){
    let service = this.setup(name)
    if(!service) throw "Unknown service"
    const { stdout, stderr } = await exec('npm install', {cwd: service.path});
    return stderr&&stdout?`errors: ${stderr}, info: ${stdout}`:stderr?stderr:stdout;
  }

  async log(name){
    let service = this.global.services.find((s) => s.setup.name == name)
    if(service)
      return JSON.parse(JSON.stringify(service.log)).reverse()
  }

  async setup(name){
    let service = this.global.services.find((s) => s.setup.name == name)
    return service ? service.setup : null
  }

  async getServiceSetup(setup){
    try{
      return new Promise((r) => fs.readFile(path.join(path.join(__dirname, setup.path), "setup.json"), "utf-8", (err, file) => r(err?null:JSON.parse(file))))
    } catch(err){

      return {"http_port": 8080}
    }
  }

  async addService(name, path, mainfile){
    this.ensureServicesIsSet();

    let newService = {name: name, path: path, main: mainfile, enabled: true}
    this.mscp.setupHandler.setup.starter.services.push(newService)
    await this.mscp.setupHandler.writeSetup()

    this.global.services.push({setup: newService, log: []})

    return `Service ${name} has been added`
  }

  async removeService(name){
    this.ensureServicesIsSet();

    for(let i = 0; i < this.mscp.setupHandler.setup.starter.services.length; i++){
      if(this.mscp.setupHandler.setup.starter.services[i].name == name){
        this.mscp.setupHandler.setup.starter.services.splice(i, 1)
        break;
      }
    }

    for(let i = 0; i < this.global.services.length; i++){
      if(this.global.services[i].setup.name == name){
        this.global.services.splice(i, 1)
      }
    }
    await this.mscp.setupHandler.writeSetup()
    return `Service ${name} has been removed`
  }

  async enableService(name){
    this.ensureServicesIsSet();
    for(let i = 0; i < this.mscp.setupHandler.setup.starter.services.length; i++){
      if(this.mscp.setupHandler.setup.starter.services[i].name == name){
        this.mscp.setupHandler.setup.starter.services[i].enabled = true;
        break;
      }
    }
    await this.mscp.setupHandler.writeSetup()
    return `Service ${name} has been enabled`
  }

  async disableService(name){
    this.ensureServicesIsSet();
    for(let i = 0; i < this.mscp.setupHandler.setup.starter.services.length; i++){
      if(this.mscp.setupHandler.setup.starter.services[i].name == name){
        this.mscp.setupHandler.setup.starter.services[i].enabled = false;
        break;
      }
    }
    await this.mscp.setupHandler.writeSetup()
    return `Service ${name} has been disabled`
  }

  ensureServicesIsSet(){
    if(!this.mscp.setupHandler.setup.starter)
      return null
    if(!this.mscp.setupHandler.setup.starter.services)
      return null
  }
}

module.exports = Handler
