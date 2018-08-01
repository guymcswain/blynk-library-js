# blynk-library-js
This is a fork of [vshymanskyy blynk-library-js](https://github.com/vshymanskyy/blynk-library-js) 
created to address issues affecting my projects (maybe yours too).

# ['SSL not authorized' when using Let's Encrypt #45](https://github.com/vshymanskyy/blynk-library-js/issues/45)

## Usage example for using blynk server with Let's Encrypt cerbot:
```js
var BlynkLib = require('blynk-library');

const options = { addr: 'your-domain-name',
                  certs_path: '/path/to/null/server.crt'
                };
// You must have a file named 'server.crt' in certs_path directory and it must be null.

var blynk = new BlynkLib.Blynk('715f8caae9bf4a91bae319d0376caa8d', options);

// you are now connected and your auth code is validated.
```

## Tested on:
* Node.js v8.11.3
 * Blynk server certificates: Let's Encrypt, Self-signed.

