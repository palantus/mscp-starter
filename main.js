const child = require('child_process');
const MSCP = require("mscp");
const path = require("path");
const fs = require("fs");
const Handler = require("./handler.js");


var services = [];
let setup = {}
let mscp = new MSCP(Handler);
mscp.server.handlerGlobal = {services: services}
mscp.server.static(path.join(__dirname, 'www'));

(async () => {
  await mscp.start();
  setup = mscp.server.setupHandler.setup.starter
  if(setup === undefined || setup.services === undefined)
    return;

  for(let s of setup.services){
    let serv = await runService(s)
    services.push(serv)
    await serviceReady(serv)
  }
})()

async function serviceReady(serv){
  return new Promise((resolve, reject) => {
    serv.worker.on("message", (m) => {
      if(m == "mscp-is-ready")
      resolve()
    })
  })
}

async function runService(serviceSetup){
  let cwd = serviceSetup.path
  let mainFile = path.join(path.join(__dirname, cwd), serviceSetup.main)
  let mainFileExists = await new Promise(r => fs.stat(mainFile, (err) => r(err == null)))
  if(mainFileExists){
    let worker = child.fork(mainFile, {cwd: cwd})
    worker.on('close', (code) => onServiceDeath(worker, serviceSetup, code));
    console.log(`Started service ${serviceSetup.name}`)
    return {setup: serviceSetup, worker: worker}
  } else {
    console.log("ERROR: Missing file: " + mainFile)
    process.exit(-1)
  }
}

async function onServiceDeath(worker, serviceSetup, code){
  console.log(`Service ${serviceSetup.name} died with code ${code}`);
  await new Promise((r) => setTimeout(r, 1000));
  console.log("Attempting to restart...")
  for(let i = 0; i < services.length; i++){
    if(services[i].setup.name == serviceSetup.name){
      services[i].worker = runService(serviceSetup)
      console.log(`Service ${serviceSetup.name} has been restarted`)
    }
  }
}

process.on('exit', function () {
    for(let s of services){
      s.worker.kill()
    }
});
