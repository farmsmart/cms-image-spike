const admin = require('firebase-admin');
const functions = require('firebase-functions');

const cheerio = require('cheerio');
const spawn = require('child-process-promise').spawn;

const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');
const crypto = require('crypto');
const https = require('https');

const request = require('request');
const rp = require('request-promise');



try {
  admin.initializeApp();
} catch (err) {
  // firebase already initialised
}

exports = module.exports = functions.firestore
  .document('things/{id}')
  .onWrite(handle);

async function handle(change, context) {
  // Ignore deletes
  if (change.after.exists) {
    const data = change.after.data();

    let images = findImageSources(data.html);
    
    for(const img of images) {

        identifyImage(img);
    }

   
}

return Promise.resolve(true);
}

async function identifyImage(img) {
    console.log(`Identifying ${img}`);

    const tempLocalFile = createFile(img);

    try {
        await downloadImage(img, tempLocalFile);

        const result = await spawn('identify', ['-verbose', tempLocalFile], {capture: ['stdout', 'stderr']});

        console.log(imageMagickOutputToObject(result.stdout));
    
    } finally {
        // Cleanup temp directory after metadata is extracted
        // Remove the file from temp directory
        console.log('Unlinking local file from temp location', tempLocalFile);
        fs.unlinkSync(tempLocalFile);
    }

}

/**
 * Convert the output of ImageMagick's `identify -verbose` command to a JavaScript Object.
 */
function imageMagickOutputToObject(output) {
    let previousLineIndent = 0;
    const lines = output.match(/[^\r\n]+/g);
    lines.shift(); // Remove First line
    lines.forEach((line, index) => {
      const currentIdent = line.search(/\S/);
      line = line.trim();
      if (line.endsWith(':')) {
        lines[index] = makeKeyFirebaseCompatible(`"${line.replace(':', '":{')}`);
      } else {
        const split = line.replace('"', '\\"').split(': ');
        split[0] = makeKeyFirebaseCompatible(split[0]);
        lines[index] = `"${split.join('":"')}",`;
      }
      if (currentIdent < previousLineIndent) {
        lines[index - 1] = lines[index - 1].substring(0, lines[index - 1].length - 1);
        lines[index] = new Array(1 + (previousLineIndent - currentIdent) / 2).join('}') + ',' + lines[index];
      }
      previousLineIndent = currentIdent;
    });
    output = lines.join('');
    output = '{' + output.substring(0, output.length - 1) + '}'; // remove trailing comma.
    output = JSON.parse(output);
    console.log('Metadata extracted from image', output);
    return output;
  }

/**
 * Makes sure the given string does not contain characters that can't be used as Firebase
 * Realtime Database keys such as '.' and replaces them by '*'.
 */
function makeKeyFirebaseCompatible(key) {
    return key.replace(/\./g, '*');
  }

function createFile(filePath) {
    // Create random filename with same extension as uploaded file.
  const randomFileName = crypto.randomBytes(20).toString('hex') + path.extname(filePath);
  const tempLocalFile = path.join(os.tmpdir(), randomFileName);

  console.log(`Creating temp file ${tempLocalFile}`);

  return tempLocalFile;
}

function downloadImage(img, tempLocalFile) {
    // TODO: download image
    console.log(`Downloading image ${img}`);

    return new Promise( (resolve, reject ) => {
      request
        .get(img, {time : true})
        .on('response', response => {
            console.log('RESPONSE: ', response.statusCode, response.headers);
        })
        .on('error', err => {
            console.log(err);
            reject(err);
        })
        .on('end', () => {
          console.log('Done downloading');

          let stats = fs.statSync(tempLocalFile);
          let statPretty = JSON.stringify(stats);

          console.log(`Downloaded ${statPretty}`);
          resolve(tempLocalFile);
          
        })
        .pipe(fs.createWriteStream(tempLocalFile));
    })
}

function findImageSources(htmlSource) {
    const $ = cheerio.load(htmlSource);

    let images = [];
    $('img').each(function(i, elem) {
        images[i] = $(this).attr('src');
    });

    console.log(`Found ${images.length} images.`);

    console.log(images);

    return images;
}
