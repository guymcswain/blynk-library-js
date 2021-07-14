#!/usr/bin/env node

/*
   In Blynk app, under MiCasa2 project:
   -  Add a device named "test" and place its token value below.
   -  Add a terminal widget assigned to Virtual Pin 0.
*/
const Auth_Token = require('./auth-token').Auth_Token;

const blynkConnectOptions = {
   addr: 'blynk.legemtech.com',
   port: 443,
   certs_path: './bin/',
   servername: null,
   skip_connect: true
};

const Blynk = require("../blynk"); // blynk-library
const blynk = new Blynk.Blynk(Auth_Token, blynkConnectOptions);

blynk.once('connect', () => { runBlynkHardware() });
blynk.on('error', err => {console.log('Blynk Error: ',err)});
blynk.connect();

var terminal = new blynk.WidgetTerminal(0);

function runBlynkHardware()
{
   terminal.write("Blynk is ready!\n");

   let tick = 0;
   setInterval( ()=> {
      terminal.write("msg_id=" + blynk.msg_id + "\n");
      
      if ((tick % 10) === 0)
      {
         //terminal.flush();
         //terminal.clear();
         blynk.virtualWrite(0, 'clr');
      }
   }, 100).unref();
   
   terminal.on('write', msg => {
      console.log('Term: ' + msg[0]);
   });
   
}

process.on('SIGINT', () => 
{
   terminal.write('exiting test, bye.\n');
   blynk.end();
   process.exit();
});