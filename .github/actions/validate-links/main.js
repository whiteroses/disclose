const core = require('@actions/core');
const fsPromises = require('fs').promises;
const http = require('http');
const https = require('https');
const zlib = require('zlib');


// TODO: Can we use util.promisify?
const BEFORE_SOCKET_CONNECTED_TIMEOUT = 5000;


const streamToString = (stream, encoding) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString(encoding)));
  });
};


const decompressResponseBody = async (incomingMessage) => {
  return new Promise(async (resolve, reject) => {
    let encoding;
    try {
      encoding = incomingMessage.headers['content-type'].split('=')[1].trim()
        .toLowerCase() === 'iso-8859-1'? 'latin1': 'utf8';
    } catch (exception) {
      encoding = 'utf8';
    }

    const contentEncodingHeader = incomingMessage.headers['content-encoding'];
    let responseBodyStream;
    switch (
      contentEncodingHeader? contentEncodingHeader.toLowerCase(): 'identity'
    ) {
      case 'br':
        responseBodyStream = incomingMessage.pipe(
          zlib.createBrotliDecompress()
        );
        break;
      case 'gzip':
        responseBodyStream = incomingMessage.pipe(zlib.createGunzip());
        break;
      case 'deflate':
        responseBodyStream = incomingMessage.pipe(zlib.createInflate());
        break;
      default:
        responseBodyStream = incomingMessage;
    }
    responseBodyStream.on('error', (error) => {
      resolve(`Error decompressing response body: ${error.toString()}`);
    });
    resolve(
      await streamToString(responseBodyStream, encoding).catch(
        (error) => {
          resolve(error.toString());
        }
      )
    );
  });
};


const checkPolicyURL = async (program) => (
  new Promise((resolve, reject) => {
    let protocol;
    let url;
    try {
      url = new URL(program.policy_url);
    } catch (error) {
      resolve('Not a URL.');
    }

    if (url.protocol === 'https:') {
      protocol = https;
    } else if (url.protocol === 'http:') {
      protocol = http;
    } else {
      resolve('URL protocol not HTTPS or HTTP.');
    }

    const request = protocol.get(url, {
      'headers': {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,' +
          'image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;' +
          'q=0.9',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en-GB;q=0.9,en;q=0.8',
        'connection': 'close',
        'cache-control': 'max-age=0',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/81.0.4044.129 Safari/537.36',
      },
      'options': {
        'timeout': BEFORE_SOCKET_CONNECTED_TIMEOUT,
      },
    }, async (incomingMessage) => {
      incomingMessage.on('aborted', () => {
        // "...if the response closes prematurely, the response object does not
        // emit an 'error' event but instead emits the 'aborted' event."
        resolve('The response closed prematurely.');
      });

      const statusCode = incomingMessage.statusCode;
      if (statusCode === 200) {
        resolve(true);
      } else {
        let message = '';
        if (statusCode === 404) {
          message = '';
        } else if ([301, 302, 303, 307, 308].includes(statusCode)) {
          message = `(Location: ${incomingMessage.headers['location']})`;
        } else {
          const incomingMessageBody = await decompressResponseBody(
            incomingMessage
          ).catch((error) => {
            resolve(error);
          });
          message = `\nHeaders: ${JSON.stringify(incomingMessage.headers)}` +
            `\nBody: ${incomingMessageBody}`;
        }
        // http.ClientRequest: "...the data from the response object must be
        // consumed..."
        incomingMessage.resume();
        resolve(`Responded with ${incomingMessage.statusCode} ` +
          `${incomingMessage.statusMessage}. ${message}`);
      };
    }).on('timeout', () => {
      request.destroy();
      resolve(
        'Socket did not connect within timeout of ' +
        `${BEFORE_SOCKET_CONNECTED_TIMEOUT / 1000} seconds.`
      );
    }).on('error', (error) => {
      request.destroy();
      resolve(error.toString());
    });
  })
);


(() => {
  let done = false;

  (async function() {
    const file = await fsPromises.readFile(
      'program-list/program-list.json', 'utf8',
    ).catch((error) => {
      core.setFailed(error);
    });

    let programsList;
    try {
      programsList = JSON.parse(file);
    } catch (error) {
      core.setFailed(error);
    }

    console.log(
      `Checking policy URLs for ${programsList.length} programs...\n`
    );

    Promise.allSettled(programsList.map(checkPolicyURL)).then((results) => {
      let invalidURLsCount = 0;
      for (const [programId, result] of results.entries()) {
        const program = programsList[programId];
        const messageProgramPart = `${programId + 1}. ` +
          `${program.program_name} (${program.policy_url}): `;
        if (result.status === 'fulfilled') {
          if (result.value !== true) {
            ++invalidURLsCount;
            console.log(messageProgramPart + `${result.value}\n`);
          }
        } else {
          console.log(messageProgramPart + `${result.reason}\n`);
        }
      }
      if (invalidURLsCount) {
        core.setFailed(
          `${invalidURLsCount} policy URL` +
          `${invalidURLsCount === 1? '': 's'} require attention.`
        );
      } else {
        console.log('\nAll policy URLs appear to be valid.');
      }
      done = true;
    });
  })();

  // Wait for promise to complete
  const timeout = setInterval(() => {
    if (done) {
      clearInterval(timeout);
    }
  }, 1000);
})();
