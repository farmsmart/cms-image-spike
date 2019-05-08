const admin = require('firebase-admin');
const functions = require('firebase-functions');

const cheerio = require('cheerio');


try {
  admin.initializeApp();
} catch (err) {
  // firebase already initialised
}

// exports = module.exports = functions.firestore
//   .document('things/{id}')
//   .onWrite(handleCloudFunction);

function handleCloudFunction(change, context) {
    // Ignore deletes
  if (change.after.exists) {
    const data = change.after.data();

    let urlSet = findImageSources(data.html);

    
    const db = admin.firestore();
    const saveUrls = [];
    for(const url of urlSet) {
        let query = db.collection('fs_cms_content_images').where('url', '==', url);
        let docRef = db.collection('fs_cms_content_images').doc(); 
        // saveUrls.add(db.runTransaction(tx => {
        //     let result = tx.get(query);

        //     // if (result.numChildren() === 0) {
        //     //     let ref = tx.get(docRef);
        //     //     tx.set()
        //     // }

        //     return Promise.resolve(url);
        // }));
    }

    if (saveUrls.length > 0) {

       
        return Promise.all(saveUrls);
    }

  }

  return Promise.resolve(true);
}

function findImageSources(htmlSource) {
    const $ = cheerio.load(htmlSource);

    let images = new Set();
    $('img').each(function(i, elem) {
        images.add($(this).attr('src'));
    });

    console.log(`Found ${images.length} images.`);

    console.log(images);

    return images;
}