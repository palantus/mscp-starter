"use strict"

const fs = require("fs")
const path = require("path")

class Handler{

  constructor(services){
    this.runningServices = services
  }

  init(){
    // Initialize handler if necessary
  }

  async services(){
    let res = []
    for(let s of this.runningServices){
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

  async getServiceSetup(setup){
    try{
      return new Promise((r) => fs.readFile(path.join(path.join(__dirname, setup.path), "setup.json"), "utf-8", (err, file) => r(JSON.parse(file))))
    } catch(err){

      return {port: 8080}
    }
  }
}

module.exports = Handler
