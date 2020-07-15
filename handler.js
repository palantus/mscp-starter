"use strict"

const fs = require("fs")
const path = require("path")
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const express = require('express');

const http = require("http")
const httpProxy = require('http-proxy');
const HttpProxyRules = require('http-proxy-rules');

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

    console.log("Starting proxy...")

    if(!this.mscp.setupHandler.setup.proxyPort){
      console.log("proxyPort not defined. Proxy not starting.")
      return;
    }
    
    // Basic settings

    this.global.proxySettings = {
        target: this.mscp.setupHandler.setup.proxyTargetDefault || 'http://NOTEXISTINGDOMAIN', // target host
        //changeOrigin: true,               // needed for virtual hosted sites
        ws: true,                         // proxy websockets
        pathRewrite: this.mscp.setupHandler.setup.proxyRewrite ? JSON.parse(JSON.stringify(this.mscp.setupHandler.setup.proxyRewrite)) : null,
        ssl: this.mscp.setupHandler.setup.proxySSL ? JSON.parse(JSON.stringify(this.mscp.setupHandler.setup.proxySSL)) : null,
        xfwd: true
    };

    if(this.global.proxySettings.ssl){
      if(this.global.proxySettings.ssl.ca)
        this.global.proxySettings.ssl.ca = fs.readFileSync(this.global.proxySettings.ssl.ca, "utf8");
      if(this.global.proxySettings.ssl.cert)
        this.global.proxySettings.ssl.cert = fs.readFileSync(this.global.proxySettings.ssl.cert, "utf8");
      if(this.global.proxySettings.ssl.key)
        this.global.proxySettings.ssl.key = fs.readFileSync(this.global.proxySettings.ssl.key, "utf8");
    }


    //Find all routes/rules

    let rules = this.mscp.setupHandler.setup.proxyRoutes || {}

    let services = []
    if(this.mscp.setupHandler.setup.starter && this.mscp.setupHandler.setup.starter.services)
      services = this.mscp.setupHandler.setup.starter.services;

    for(let s of services.filter(s => s.domain !== undefined)){
      let servicePort = s.http_port || (await this.getServiceSetup(s)).http_port
      if(servicePort){
        rules[s.domain] = `http://localhost:${servicePort}`;
      }
    }

    // Start the proxy

    var proxyRules = new HttpProxyRules({
      rules,
      default: this.mscp.setupHandler.setup.proxyTargetDefault // default target
    });

    var proxy = httpProxy.createProxy();
    proxy.on("error", (err) => {
      console.log(err)
    })

    let findTargetFromReq = (req) => {
      var target = rules[req.headers.host]
      if(!target)
        target = proxyRules.match(req);
      return target;
    }

    let proxyFunction = (req, res) => {
      var target = findTargetFromReq(req)

      if (target) {     
        return proxy.web(req, res, {
          target: target,
          ws: true,
          xfwd: true
        });      
      }
  
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('The request url and path did not match any of the listed rules!');
    }
    
    let proxyServer;
    if(this.global.proxySettings.ssl){
      proxyServer = require("https").createServer(this.global.proxySettings.ssl, proxyFunction).listen(this.mscp.setupHandler.setup.proxyPort);
    } else {
      proxyServer = require("http").createServer(proxyFunction).listen(this.mscp.setupHandler.setup.proxyPort);
    }

    proxyServer.on('upgrade', function (req, socket, head) {
        var target = findTargetFromReq(req)
        if (target) {
            return proxy.ws(req, socket, head, { target: target });      
        }
    });
  }

  async services(){
    let res = []
    for(let s of this.global.services){
      let es = JSON.parse(JSON.stringify(s.setup))
      let setup = await this.getServiceSetup(es)
      es.http_port = (setup && setup.enableHTTP !== false) ? setup.http_port || 8080 : es.http_port ? es.http_port : null
      es.https_port = (setup && setup.enableHTTPS === true) ? setup.https_port || 443 : es.https_port ? es.https_port : null
      es.enabled = es.enabled === false ? false : true
      es.restartCount = s.restartCount
      es.memUsage = s.memUsage || null
      es.mscpVersion = s.mscpVersion || "N/A"
      res.push(es)
    }

    return res
  }

  async kill(name){
    for(let s of this.global.services){
      if(s.setup.name == name){
        if(s.worker){
          s.worker.kill();
          console.log("Killed service " + name)
          return "Service stopped.";
        } else {
          console.log("Could not stop service");
          console.log(s)
          return "Could not stop service";
        }
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

  async npmupdate(name){
    let service = this.setup(name)
    if(!service) throw "Unknown service"
    const { stdout, stderr } = await exec('npm update', {cwd: service.path});
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

    let newService = {name: name, path: path, main: mainfile, enabled: false}
    this.mscp.setupHandler.setup.starter.services.push(newService)
    await this.mscp.setupHandler.writeSetup()

    this.global.services.push({setup: newService, log: []})

    return `Service ${name} has been added and disabled. Enable to start.`
  }

  async removeService(name){
    await this.disableService(name);
    await this.kill(name);

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
    let servIndex = this.global.services.findIndex(serv => serv.setup.name == name);
    this.global.services[servIndex] = await this.global.runService(name)
    return `Service ${name} has been enabled and started`
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
    await this.kill(name)
    return `Service ${name} has been disabled and stopped`
  }

  ensureServicesIsSet(){
    if(!this.mscp.setupHandler.setup.starter)
      return null
    if(!this.mscp.setupHandler.setup.starter.services)
      return null
  }
}

module.exports = Handler
