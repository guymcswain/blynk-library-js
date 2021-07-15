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
//blynk.on('error', err => {console.log('Blynk Error: ',err)});
blynk.connect();

var terminal = new blynk.WidgetTerminal(0);
var msgid = new blynk.VirtualPin(1);

function runBlynkHardware()
{
   blynk.virtualWrite(0, 'clr');
   terminal.write("Blynk is ready!\n");
   
   blynk.on('error', e => {
      terminal.write(e);
      console.log('Blynk error: ',e);
   });

   let tick = 0;
   setInterval( ()=> {
      terminal.write("msg_id=" + blynk.msg_id + "\n");
      
      if ((tick++ % 100) === 0)
      {
         //terminal.flush();

         //terminal.clear();
         blynk.virtualWrite(0, 'clr');
      }
   }, 100).unref();

   terminal.on('write', msg => {
      console.log('Term: ' + msg[0]);
   });
   
   // App reads each 1 second
   msgid.on('read', msg => {
      blynk.virtualWrite(1, blynk.msg_id.toString(10));
   });
   

   clearInterval(blynk.timerHb);
   blynk.heartbeat = 1000;  // 1 second polling rate

   blynk.timerHb = setInterval(function() {
      let self = blynk, MsgType = {PING:6};
      if (self.pongId !== self.pingId) {
       console.log("Ping-Pong error", self.pingId, self.pongId);
       //self.emit('error', "Ping-Pong Timeout, disconnecting!");
       //return self.disconnect()
      }
      self.pingId = (self.msg_id === 0xFFFF) ? 1 : self.msg_id +1;
      self.sendMsg(MsgType.PING);
   }, blynk.heartbeat);
}

process.on('SIGINT', () => 
{
   console.log('\nSIGINT received ... exting!');
   terminal.write('exiting test, bye.\n');
   blynk.end();
   process.exit();
});