const child = require('child_process');
const MSCP = require("mscp");
const path = require("path");
const Handler = require("./handler.js");



var services = [];
let setup = {}
let mscp = new MSCP(new Handler(services));
mscp.server.static(path.join(__dirname, 'www'));

(async () => {
  await mscp.start();
  setup = mscp.server.setupHandler.setup.cluster
  if(setup === undefined || setup.services === undefined)
    return;

  for(let s of setup.services){
    services.push(runService(s))
  }
})()

function runService(serviceSetup){
  let cwd = serviceSetup.path
  let worker = child.fork(path.join(path.join(__dirname, cwd), serviceSetup.main), {cwd: cwd})
  worker.on('close', (code) => onServiceDeath(worker, serviceSetup, code));
  console.log(`Started service ${serviceSetup.name}`)
  return {setup: serviceSetup, worker: worker}
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
