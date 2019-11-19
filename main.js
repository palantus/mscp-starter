const child = require('child_process');
const MSCP = require("mscp");
const path = require("path");
const fs = require("fs");
const Handler = require("./handler.js");
var moment = require("moment");


var services = [];
let setup = {}
let mscp = new MSCP(Handler);
mscp.server.handlerGlobal = {services: services}
mscp.server.static(path.join(__dirname, 'www'));

(async () => {
  mscp.server.handlerGlobal.runService = name => runService(services.find(serv => serv.setup.name == name).setup);

  await mscp.start();
  setup = mscp.server.setupHandler.setup.starter
  if(setup === undefined || setup.services === undefined)
    return;

  for(let s of setup.services){
    let serv = await runService(s)

    services.push(serv)

    if(s.enabled !== false && s.isMSCP !== false)
      await serviceReady(serv)
  }
})()

async function serviceReady(serv){
  return new Promise((resolve, reject) => {
    serv.worker.on("message", (m) => {
      if(m == "mscp-is-ready"){
        resolve()
      } else if(typeof m === "string" && m.startsWith("mscp-mem:")){
        serv.memUsage = Math.round(parseFloat(m.substr(9)) * 100) / 100;
      }
    })
  })
}

async function runService(serviceSetup){
  let cwd = serviceSetup.path
  let mainFile = path.join(path.join(__dirname, cwd), serviceSetup.main)
  let mainFileExists = await new Promise(r => fs.stat(mainFile, (err) => r(err == null)))
  let service = {setup: serviceSetup, log: [], restartCount: 0}
  let logText = moment().format("YYYY-MM-DD_HH:mm:ss") + ": ";
  if(mainFileExists && serviceSetup.enabled !== false){
    let worker = child.fork(mainFile, {cwd: cwd, silent: true})
    service.worker = worker
    worker.on('close', (code) => onServiceDeath(worker, serviceSetup, code));
    worker.stdout.on('data', (data) => service.log.push(`${moment().format("YYYY-MM-DD_HH:mm:ss")}: ${data}`))
    worker.stderr.on('data', (data) => service.log.push(`${moment().format("YYYY-MM-DD_HH:mm:ss")}: ${data}`))
    setInterval(() => {
      if(service.log.length > 200){
        service.log = service.log.slice(service.log.length - 150, service.log.length)
        service.log.push(`${moment().format("YYYY-MM-DD_HH:mm:ss")}: Log is too large. Removing all but the last 150 entries.`)
      }
    }, 5000)
    setInterval(() => service.restartCount = 0, 86400000 /* 24 hr */)
    logText += `Started service ${serviceSetup.name}`
  } else if(serviceSetup.enabled === false){
    logText += `Skipping service ${serviceSetup.name} because it is disabled`
  } else {
    logText += `Missing file '${mainFile}' for service ${serviceSetup.name}. Disabling!`
    serviceSetup.enabled = false;
    //process.exit(-1)
  }
  console.log(logText)
  service.log.push(logText)

  return service
}

async function onServiceDeath(worker, serviceSetup, code){
  console.log(`Service ${serviceSetup.name} died with code ${code}`);
  await new Promise((r) => setTimeout(r, 1000));
  let i = services.findIndex(serv => serv.setup.name == serviceSetup.name)
  let oldServ = services[i]
  if(!oldServ || oldServ.setup.enabled === false)
    return;

  if(oldServ.restartCount > 100){
    services[i].log.push(moment().format("YYYY-MM-DD_HH:mm:ss") + ": Service has been restarted more than 100 times in 24 hours and is now disabled.")
    serviceSetup.enabled = false
    return;
  }

  console.log("Attempting to restart...")
  services[i] = await runService(serviceSetup)
  services[i].log = oldServ.log
  services[i].log.push(moment().format("YYYY-MM-DD_HH:mm:ss") + ": ---- Service restarted ----")
  services[i].restartCount = oldServ.restartCount + 1
  console.log(`Service ${serviceSetup.name} has been restarted`)
  oldServ = null
}

process.on('exit', function () {
    for(let s of services){
      s.worker.kill()
    }
});
