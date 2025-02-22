/* Copyright (c) 2015 Volodymyr Shymanskyy. See the file LICENSE for copying permission. */

'use strict';

var C = {
};

/*
 * Helpers
 */
function string_of_enum(e,value) 
{
  for (var k in e) if (e[k] == value) return k;
  return "Unknown(" + value + ")";
}

function isEspruino() {
  if (typeof process === 'undefined') return false;
  if (typeof process.env.BOARD === 'undefined') return false;
  return true;
}

function isNode() {
  return !isEspruino() && (typeof module !== 'undefined' && ('exports' in module));
}

function isBrowser() {
  return (typeof window !== 'undefined');
}

function needsEmitter() {
  return isNode();
}


function blynkHeader(msg_type, msg_id, msg_len) {
  return String.fromCharCode(
    msg_type,
    msg_id  >> 8, msg_id  & 0xFF,
    msg_len >> 8, msg_len & 0xFF
  );
}

var MsgType = {
  RSP           :  0,
  REGISTER      :  1, //not in BlynkProtocolDefs_h
  LOGIN         :  2,
  SAVE_PROF     :  3, //not in BlynkProtocolDefs_h
  LOAD_PROF     :  4, //not in BlynkProtocolDefs_h
  GET_TOKEN     :  5, //not in BlynkProtocolDefs_h
  PING          :  6,
  ACTIVATE      :  7, //not in BlynkProtocolDefs_h
  DEACTIVATE    :  8, //not in BlynkProtocolDefs_h
  REFRESH       :  9, //not in BlynkProtocolDefs_h
  TWEET         :  12,
  EMAIL         :  13,
  NOTIFY        :  14,
  BRIDGE        :  15,
  HW_SYNC       :  16,
  INTERNAL      :  17,
  SMS           :  18,
  PROPERTY      :  19,
  HW            :  20,
  HW_LOGIN      :  29,
  REDIRECT      :  41,
  DEBUG_PRINT   :  55,

  EVENT_LOG     :  64,
};

var MsgStatus = {
  OK                     : 200,
  QUOTA_LIMIT_EXCEPTION  : 1,
  ILLEGAL_COMMAND        : 2,
  NOT_REGISTERED         : 3,
  ALREADY_REGISTERED     : 4,
  NOT_AUTHENTICATED      : 5,
  NOT_ALLOWED            : 6,
  DEVICE_NOT_IN_NETWORK  : 7,
  NO_ACTIVE_DASHBOARD    : 8,
  INVALID_TOKEN          : 9,
  ILLEGAL_COMMAND_BODY   : 11,
  GET_GRAPH_DATA_EXCEPTION : 12,
  NO_DATA_EXCEPTION      : 17,
  DEVICE_WENT_OFFLINE    : 18,
  SERVER_EXCEPTION       : 19,

  NTF_INVALID_BODY       : 13,
  NTF_NOT_AUTHORIZED     : 14,
  NTF_ECXEPTION          : 15,

  TIMEOUT                : 16,

  NOT_SUPPORTED_VERSION  : 20,
  ENERGY_LIMIT           : 21
};

var BlynkState = {
  CONNECTING    :  1,
  CONNECTED     :  2,
  DISCONNECTED  :  3
};

if (isBrowser()) {
  var bl_browser = require('./blynk-browser.js');
  var events = require('events');
  var util = require('util');
} else if (isNode()) {
  var bl_node = require('./blynk-node.js');
  var events = require('events');
  var util = require('util');
}

/*
 * Serial
 */
if (isEspruino()) {

  var EspruinoSerial = function(options) {
    var self = this;

    var options = options || {};
    self.ser  = options.serial || USB;
    self.conser = options.conser || Serial1;
    self.baud = options.baud || 9600;

    this.write = function(data) {
      self.ser.write(data);
    };

    this.connect = function(done) {
      self.ser.setup(self.baud);
      self.ser.removeAllListeners('data');
      self.ser.on('data', function(data) {
        self.emit('data', data);
      });
      if (self.conser) {
        self.conser.setConsole();
      }
      done();
    };

    this.disconnect = function() {
      //self.ser.setConsole();
    };
  };

  var EspruinoTCP = function(options) {
    var self = this;

    var options = options || {};
    self.addr = options.addr || "blynk-cloud.com";
    self.port = options.port || 80;

    var net = require('net');

    this.write = function(data) {
      if (self.sock) {
        self.sock.write(data, 'binary');
      }
    };

    this.connect = function(done) {
      if (self.sock) {
        self.disconnect();
      }
      console.log("Connecting to TCP:", self.addr, self.port);
      self.sock = net.connect({host : self.addr, port: self.port}, function() {
        console.log('Connected');
        self.sock.on('data', function(data) {
          self.emit('data', data);
        });
        self.sock.on('end', function() {
          self.emit('end', '');
        });
        done();
      });
    };

    this.disconnect = function() {
      if (self.sock) {
        self.sock = null;
      }
    };
  };

  var BoardEspruinoPico = function(values) {
    var self = this;
    this.init = function(blynk) {
      self.blynk = blynk;
    };
    this.process = function(values) {
      switch(values[0]) {
        case 'pm':
          // TODO
          break;
        case 'dw':
          var pin = Pin(values[1]);
          var val = parseInt(values[2]);
          pinMode(pin, 'output');
          digitalWrite(pin, val);
          break;
        case 'dr':
          var pin = Pin(values[1]);
          self.blynk.sendMsg(MsgType.HW, ['dw', values[1], digitalRead(pin)]);
          break;
        case 'aw':
          var pin = Pin(values[1]);
          var val = parseFloat(values[2]);
          pinMode(pin, 'output');
          analogWrite(pin, val / 255);
          break;
        case 'ar':
          var pin = Pin(values[1]);
          self.blynk.sendMsg(MsgType.HW, ['aw', values[1], 4095 * analogRead(pin)]);
          break;
        default:
          return null;
      }
      return true;
    };
  };

  var BoardEspruinoLinux = function(values) {
    var self = this;
    this.init = function(blynk) {
      self.blynk = blynk;
    };
    this.process = function(values) {
      switch(values[0]) {
        case 'pm':
          // TODO
          break;
        case 'dw':
          var pin = Pin('D' + values[1]);
          var val = parseInt(values[2]);
          pinMode(pin, 'output');
          digitalWrite(pin, val);
          break;
        case 'dr':
          var pin = Pin('D' + values[1]);
          self.blynk.sendMsg(MsgType.HW, ['dw', values[1], digitalRead(pin)]);
          break;
        case 'aw':
        case 'ar':
          break;
        default:
          return null;
      }
      return true;
    };
  };
}

/*
 * Boards
 */

var BoardDummy = function() {
  this.init = function(blynk) {};
  this.process = function(values) {
    switch (values[0]) {
    case 'pm':
      return true;
    case 'dw':
    case 'dr':
    case 'aw':
    case 'ar':
      console.log("No direct pin operations available.");
      console.log("Maybe you need to install mraa or onoff modules?");
      return true;
    }
  };
};

/*
 * Blynk
 */

var Blynk = function(auth, options) {
  var self = this;
  if (needsEmitter()) {
    events.EventEmitter.call(this);
  }

  this.auth = auth;
  var options = options || {};
  this.heartbeat = options.heartbeat || (10*1000);

  console.log("\n\
    ___  __          __\n\
   / _ )/ /_ _____  / /__\n\
  / _  / / // / _ \\/  '_/\n\
 /____/_/\\_, /_//_/_/\\_\\\n\
        /___/\n\
\n\
  Give Blynk a Github star! => https://github.com/vshymanskyy/blynk-library-js\n\
");

  // Auto-detect board
  if (options.board) {
    this.board = options.board;
  } else if (isEspruino()) {
    this.board = new BoardEspruinoPico();
  } else if (isBrowser()) {
    this.board = new BoardDummy();
  } else {
    [
        bl_node.BoardMRAA,
        bl_node.BoardOnOff,
        BoardDummy
    ].some(function(b){
      try {
        self.board = new b();
        return true;
      }
      catch (e) {
        return false;
      }
    });
  }
  self.board.init(self);

  // Auto-detect connector
  if (options.connector) {
    this.conn = options.connector;
  } else if (isEspruino()) {
    this.conn = new EspruinoTCP(options);
  } else if (isBrowser()) {
    this.conn = new bl_browser.WsClient(options);
  } else {
    this.conn = new bl_node.SslClient(options);
  }

  this.buff_in = '';
  this.msg_id = 1;
  this.vpins = [];
  this.profile = options.profile;

  this.VirtualPin = function(vPin) {
    if (needsEmitter()) {
      events.EventEmitter.call(this);
    }
    this.pin = vPin;
    self.vpins[vPin] = this;

    this.write = function(value) {
      self.virtualWrite(this.pin, value);
    };
  };

  /** (Generic) Widget is subclass of VirtualPin with common property accessors */
  self.Widget = function(vpin, persist) {
    self.VirtualPin.call(this, vpin);
    this._label = undefined;
    this._color = undefined;
    this._min = undefined;
    this._max = undefined;
    this._value = undefined; // cached value
    this._syncValue = persist;

    // convenience method to set unique widget properties (ie 'labels')
    this.setProperty = function(prop, value) {
      self.setProperty(this.pin, prop, value);
    }
    // convenience method to get value from server to widget's 'write' listener.
    this.syncVirtual = function() {
      self.syncVirtual(this.pin);
    }
    // Constructor option to make _value persistent and coherent with server.
    if (persist) {

      // Update value property after user's listener has run.
      this.on('write', v => {
         setImmediate(v => this._value = v, v[0]);
      })
      this.syncVirtual();
    }
  };
  util.inherits(self.Widget, self.VirtualPin);
  assign_propertyAccessors(self.Widget.prototype,
    'label', 'color', 'min', 'max', 'value');

  /** Button is subclass of Widget with own property accessors */
  self.Button = function(...args) {
    this._onLabel = undefined;
    this._offLabel = undefined;
    self.Widget.call(this, ...args);
  };
  util.inherits(self.Button, self.Widget);
  assign_propertyAccessors(self.Button.prototype, 'onLabel', 'offLabel');

  /** StyledButton is subclass of Button with own property accessors */
  self.StyledButton = function(...args) {
    this._onColor = undefined;
    this._offColor = undefined;
    this._onBackColor = undefined;
    this._offBackColor = undefined;
    self.Button.call(this, ...args);
  };
  util.inherits(self.StyledButton, self.Button);
  assign_propertyAccessors(self.StyledButton.prototype,
    'onColor','offColor','onBackColor','offBackColor');

  function assign_propertyAccessors(obj, ...properties) {
    properties.forEach(property => {
      let myProperty = '_' + property;

      Object.defineProperty(obj, property, {
        get() {
          return this[myProperty];
        },
        set(v) {
          if (property === 'value') {
            this.write(v);
            if (this._syncValue) this.syncVirtual();
            else this[myProperty] = v;
          }
          else {
            this.setProperty(property, v);
            this[myProperty] = v;
          }
        },
        enumerable: true,
        configurable: true
      });

    });
  };


  this.WidgetBridge = function(vPin) {
    this.pin = vPin;

    this.setAuthToken = function(token) {
      self.sendMsg(MsgType.BRIDGE, [this.pin, 'i', token]);
    };
    this.digitalWrite = function(pin, val) {
      self.sendMsg(MsgType.BRIDGE, [this.pin, 'dw', pin, val]);
    };
    this.analogWrite = function(pin, val) {
      self.sendMsg(MsgType.BRIDGE, [this.pin, 'aw', pin, val]);
    };
    this.virtualWrite = function(pin, val) {
      self.sendMsg(MsgType.BRIDGE, [this.pin, 'vw', pin].concat(val));
    };
  };

  this.WidgetTerminal = function(vPin) {
    if (needsEmitter()) {
      events.EventEmitter.call(this);
    }
    this.pin = vPin;
    self.vpins[vPin] = this;

    this.write = function(data) {
      self.virtualWrite(this.pin, data);
    };
  };

  this.WidgetLCD = function(vPin) {
    this.pin = vPin;

    this.clear = function() {
      self.virtualWrite(this.pin, 'clr');
    };
    this.print = function(x, y, val) {
      self.sendMsg(MsgType.HW, ['vw', this.pin, 'p', x, y, val]);
    };
  };
  
  this.WidgetTable = function(vPin) {
    if (needsEmitter()) {
      events.EventEmitter.call(this);
    }
    this.pin = vPin;
    self.vpins[vPin] = this;

    this.clear = function() {
      self.virtualWrite(this.pin, 'clr');
    };
    
    this.add_row = function(id, name, value) {
      self.virtualWrite(this.pin, ['add', id, name, value]);
    };
    
    this.update_row = function(id, name, value) {
	  self.virtualWrite(this.pin, ['update', id, name, value]);
    };

    this.highlight_row = function(id) {
      self.virtualWrite(this.pin, ['pick', id]);
    };

    this.select_row = function(id) {
      self.virtualWrite(this.pin, ['select', id]);
    };

    this.deselect_row = function(id) {
      self.virtualWrite(this.pin, ['deselect', id]);
    };

    this.move_row = function(old_row, new_row) {
      self.virtualWrite(this.pin, ['order', old_row, new_row]);
    };
  };

  this.WidgetLED = function(vPin) {
    this.pin = vPin;

    this.setValue = function(val) {
      self.virtualWrite(this.pin, val);
    };
    this.turnOn = function() {
      self.virtualWrite(this.pin, 255);
    };
    this.turnOff = function() {
      self.virtualWrite(this.pin, 0);
    };
  };
  
  this.WidgetMAP = function(vPin) {
    this.pin = vPin;
    
    this.location = function(index, lat, lon, value) {
      var locationdata = [index, lat, lon, value]
      self.virtualWrite(this.pin, locationdata);
    }
  };

  if (needsEmitter()) {
    util.inherits(this.VirtualPin, events.EventEmitter);
    util.inherits(this.WidgetBridge, events.EventEmitter);
    util.inherits(this.WidgetTerminal, events.EventEmitter);
    util.inherits(this.WidgetTable, events.EventEmitter);
  }

  if (!options.skip_connect) {
    this.connect();
  }
};

if (needsEmitter()) {
  util.inherits(Blynk, events.EventEmitter);
}

Blynk.prototype.onReceive = function(data) {
  var self = this;
  self.buff_in += data;
  while (self.buff_in.length >= 5) {
    var msg_type = self.buff_in.charCodeAt(0);
    var msg_id   = self.buff_in.charCodeAt(1) << 8 | self.buff_in.charCodeAt(2);
    var msg_len  = self.buff_in.charCodeAt(3) << 8 | self.buff_in.charCodeAt(4);

    if (process.env.BLYNK_DEBUG && msg_type !== MsgType.RSP) {
      let body = self.buff_in.substr(5, msg_len).split('\0');
      console.log(`P: ${string_of_enum(MsgType, msg_type)}, ID: ${msg_id}, Body: ${body}`);
    }

    if (msg_id === 0)  {
      self.emit('error', 'Error Blynk Protocol: msg_id === 0, disconnecting');
      return self.disconnect();
    }

    if (msg_type === MsgType.RSP) {

      let responseCode = string_of_enum(MsgStatus, msg_len);
      if (process.env.BLYNK_DEBUG)
        console.log(`P: ${string_of_enum(MsgType, msg_type)}, ID: ${msg_id}, Rsp: ${responseCode}`);
      if (responseCode !== 'OK')
        self.emit('error', `Bad response code: ${responseCode}, id: ${msg_id}`);

      // Is this a PONG response?
      else if (msg_id === self.pingId) self.pongId = msg_id;



      if (!self.profile) {
        if (self.timerConn && msg_id === 1) {
          if (msg_len === MsgStatus.OK || msg_len === MsgStatus.ALREADY_REGISTERED) {
            clearInterval(self.timerConn);
            self.timerConn = null;

            self.timerHb = setInterval(function() {
              if (self.pongId !== self.pingId) {
                console.warn(`Ping-Pong timeout: ping=${self.pingId}, pong=${self.pongId}`);

                // limit continuous ping timeout warnings
                self.pingRetries += 1;
                if (self.pingRetries > 10) {
                   clearInterval(self.timerHb);
                   return;
                }
              }
              // ping
              self.pingId = (self.msg_id === 0xFFFF) ? 1 : self.msg_id +1;
              self.sendMsg(MsgType.PING);
              self.pingRetries = 0;

            }, self.heartbeat);

            self.pingRetries = 0;
            // ping
            self.pingId = (self.msg_id === 0xFFFF) ? 1 : self.msg_id +1;
            self.sendMsg(MsgType.PING);

            console.log('Authorized');
            self.sendMsg(MsgType.INTERNAL, ['ver', '0.5.3', 'buff-in', 4096, 'dev', 'js']);
            self.emit('connect');
          } else {
            console.log('Could not login:', string_of_enum(MsgStatus, msg_len));
            //if invalid token, no point in trying to reconnect
            if (msg_len === MsgStatus.INVALID_TOKEN) {
              //letting main app know why we failed
              self.emit('error', string_of_enum(MsgStatus, msg_len));
              //console.log('Disconnecting because of invalid token');
              self.disconnect();
              if(self.timerConn) {
                //clear connecting timer
                console.log('clear conn timer');
                clearInterval(self.timerConn);
                self.timerConn = null;
              }
            }
          }
        }
      }
      self.buff_in = self.buff_in.substr(5);
      continue;
    } // MsgType.RSP handling completed


    if (msg_len > 4096)  {
      self.emit('error', 'Error Blynk Protocol: msg_len > 4096, disconnecting');
      return self.disconnect();
    }
    if (self.buff_in.length < msg_len+5) {
      return self.sendRsp(MsgType.RSP, msg_id, MsgStatus.ILLEGAL_COMMAND_BODY);
    }
    var values = self.buff_in.substr(5, msg_len).split('\0');
    self.buff_in = self.buff_in.substr(msg_len+5);

    if (msg_type === MsgType.LOGIN ||
        msg_type === MsgType.PING)
    {
      self.sendRsp(MsgType.RSP, msg_id, MsgStatus.OK);
    } else if (msg_type === MsgType.GET_TOKEN) {
      self.sendRsp(MsgType.GET_TOKEN, msg_id, self.auth.length, self.auth);
    } else if (msg_type === MsgType.LOAD_PROF) {
      self.sendRsp(MsgType.LOAD_PROF, msg_id, self.profile.length, self.profile);
    } else if (msg_type === MsgType.HW ||
               msg_type === MsgType.BRIDGE)
    {
      if (values[0] === 'vw') {
        var pin = parseInt(values[1]);
        if (self.vpins[pin]) {
          self.vpins[pin].emit('write', values.slice(2));
        }
      } else if (values[0] === 'vr') {
        var pin = parseInt(values[1]);
        if (self.vpins[pin]) {
          self.vpins[pin].emit('read');
        }
      } else if (self.board.process(values)) {

      } else {
        console.log('Invalid cmd: ', values[0]);
        //self.sendRsp(MsgType.RSP, msg_id, MsgStatus.ILLEGAL_COMMAND);
      }
    } else if (msg_type === MsgType.REDIRECT) {
      self.conn.addr = values[0];
      if (values[1]) {
        self.conn.port = parseInt(values[1]);
      }
      console.log('Redirecting to ', self.conn.addr, ':', self.conn.port);
      self.disconnect();
    } else if (msg_type === MsgType.DEBUG_PRINT) {
      console.log('Server: ', values[0]);
    } else if (msg_type === MsgType.INTERNAL) {
      //console.log('Internal: ', values[0]);
      if (values[0] === 'acon') self.emit('app-connected');
      if (values[0] === 'adis') self.emit('app-disconnected');
      if (values[0] === 'rtc\0') {}; // not supported
      if (values[0] === 'ota\0') {}; // not supported
    } else if (msg_type === MsgType.REGISTER ||
               msg_type === MsgType.SAVE_PROF ||
               msg_type === MsgType.ACTIVATE ||
               msg_type === MsgType.DEACTIVATE ||
               msg_type === MsgType.REFRESH)
    {
      // these make no sense...
    } else {
      console.log('Invalid msg type: ', msg_type);
      self.sendRsp(MsgType.RSP, msg_id, MsgStatus.ILLEGAL_COMMAND);
     // FIX? Per article "Implementing a blynk client library", should disconnect!
    }
  } // end while
};

Blynk.prototype.sendRsp = function(msg_type, msg_id, msg_len, data) {
  var self = this;
  data = data || "";

  if (!msg_id) {
    if (self.msg_id === 0xFFFF)
      self.msg_id = 1;
    else
      self.msg_id++;

    msg_id = self.msg_id;
  }

  if (msg_type == MsgType.RSP) {
    if (process.env.BLYNK_DEBUG)
      console.log('S: ', string_of_enum(MsgType, msg_type), msg_id, string_of_enum(MsgStatus, msg_len));
    data = blynkHeader(msg_type, msg_id, msg_len)
  } else {
    /*if (msg_len) {
      console.log('< ', string_of_enum(MsgType, msg_type), msg_id, msg_len, data.split('\0').join('|'));
    } else {
      console.log('< ', string_of_enum(MsgType, msg_type), msg_id, msg_len);
    }*/
    if (process.env.BLYNK_DEBUG) // && string_of_enum(MsgType, msg_type) !== 'PING')
      console.log(`S: ${string_of_enum(MsgType, msg_type)}, ID: ${msg_id}, Len: ${msg_len}, Body: ${data.split('\0')}`);
    data = blynkHeader(msg_type, msg_id, msg_len) + data;
  }

  self.conn.write(data);
};

Blynk.prototype.sendMsg = function(msg_type, values, msg_id) {
  if (this.timerHb) {
    var values = values || [''];
    var data = values.join('\0');
    this.sendRsp(msg_type, msg_id, data.length, data);
  }
};

/*
  * API
  */

Blynk.prototype.connect = function() {
  var self = this;

  var doConnect = function() {
    if(self.conn) {
      //cleanup events
      self.conn.removeAllListeners();
    }
    self.conn.connect(function() {
      self.conn.on('data', function(data) { self.onReceive(data);     });
      self.conn.on('end',  function()     { self.end();               });

      self.sendRsp(MsgType.LOGIN, 1, self.auth.length, self.auth);
    });
    self.conn.on('error', function(err) { self.error(err);            });
  };

  if (self.profile) {
    doConnect();
  } else {
    self.timerConn = setInterval(doConnect, 10000);
    doConnect();
  }
};

Blynk.prototype.disconnect = function(reconnect) {
  console.log('Disconnect blynk');
  if(typeof reconnect === 'undefined' ) {
    reconnect = true;
  }

  var self = this;
  this.conn.disconnect();
  if (this.timerHb) {
    clearInterval(this.timerHb);
    this.timerHb = null;
  }
  this.emit('disconnect');
  //cleanup to avoid multiplying listeners
  this.conn.removeAllListeners();

  if (self.timerHb) clearInterval(self.timerHb);

  //starting reconnect procedure if not already in connecting loop and reconnect is true
  if(reconnect && !self.timerConn && !self.timerConnStarted) {
    console.log("REARMING DISCONNECT");
    self.timerConnStarted = setTimeout(function () {
      self.connect();
      self.timerConnStarted = null;
    }, 5000);
  }
};

Blynk.prototype.error = function(err) {
  var self = this;
  //if we throw error and user doesn't handle it, app crashes. is it worth it?
  this.emit('error', err.code?err.code:'ERROR');
  console.error('Error', err.code);

  if (self.timerHb) clearInterval(self.timerHb);

  //starting reconnect procedure if not already in connecting loop
  if(!self.timerConn && !self.timerConnStarted) {
    self.timerConnStarted = setTimeout(function () {
      self.connect();
      self.timerConnStarted = null;
    }, 5000);
  }
};

Blynk.prototype.end = function() {
  var self = this;
  self.disconnect();
};


Blynk.prototype.virtualWrite = function(pin, val) {
  this.sendMsg(MsgType.HW, ['vw', pin].concat(val));
};

Blynk.prototype.setProperty = function(pin, prop, val) {
  this.sendMsg(MsgType.PROPERTY, [pin, prop].concat(val));
};

Blynk.prototype.eventLog = function(name, descr) {
  this.sendMsg(MsgType.EVENT_LOG, [name].concat(descr));
};

Blynk.prototype.syncAll = function() {
  this.sendMsg(MsgType.HW_SYNC);
};

Blynk.prototype.syncVirtual = function(pin) {
  this.sendMsg(MsgType.HW_SYNC, ['vr', pin]);
};


Blynk.prototype.email = function(to, topic, message) {
  this.sendMsg(MsgType.EMAIL, [to, topic, message]);
};

Blynk.prototype.notify = function(message) {
  // message can be a string or array of strings
  this.sendMsg(MsgType.NOTIFY, [].concat(message));
};

Blynk.prototype.tweet = function(message) {
  this.sendMsg(MsgType.TWEET, [message]);
};

Blynk.prototype.sms = function(message) {
  this.sendMsg(MsgType.SMS, [message]);
};

if (typeof module !== 'undefined' && ('exports' in module)) {
  exports.Blynk = Blynk;

  if (isEspruino()) {
    exports.EspruinoSerial = EspruinoSerial;
    exports.EspruinoTCP = EspruinoTCP;
    exports.BoardLinux = BoardEspruinoLinux;
    exports.BoardPico  = BoardEspruinoPico;
  } else if (isBrowser()) {
    exports.WsClient = bl_browser.WsClient;
  } else if (isNode()) {
    exports.TcpClient = bl_node.TcpClient;
    exports.TcpServer = bl_node.TcpServer;
    exports.SslClient = bl_node.SslClient;
    exports.SslServer = bl_node.SslServer;
    exports.BoardOnOff = bl_node.BoardOnOff;
    exports.BoardMRAA = bl_node.BoardMRAA;
  }
}
