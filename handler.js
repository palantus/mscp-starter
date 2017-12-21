"use strict"

const fs = require("fs")
const path = require("path")
const util = require('util');
const exec = util.promisify(require('child_process').exec);

class Handler{

  async init(){
    // Initialize handler if necessary
  }

  async services(){
    let res = []
    for(let s of this.global.services){
      let es = JSON.parse(JSON.stringify(s.setup))
      let setup = await this.getServiceSetup(es)

      if(setup.enableHTTP !== false)
        es.http_port = setup.http_port || 8080
      if(setup.enableHTTPS === true)
        es.https_port = setup.https_port || 443

      res.push(es)
    }

    return res
  }

  async kill(name){
    for(let s of this.global.services){
      if(s.setup.name == name){
        s.worker.kill();
        return "Service killed";
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
      return new Promise((r) => fs.readFile(path.join(path.join(__dirname, setup.path), "setup.json"), "utf-8", (err, file) => r(JSON.parse(file))))
    } catch(err){

      return {port: 8080}
    }
  }
}

module.exports = Handler
