const fse = require('fs-extra');
const path = require('path');
const request = require('request-promise-native');
const logger = require('./lib/logging').createConsoleLogger('Main');
const Secrets = require('./lib/secrets');
const Config = require('./lib/config');
const { scrape } = require('./lib/scraper');

function panic(e, exit) {
  logger.error(e);
  if (exit) process.exit(1);
}

function escapeRegExp(str) {
  return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}

function replaceAll(str, find, replace) {
  return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
}

function removeParamsFromUrl(url) {
  let urlParamIndex = url.indexOf('?');
  return (urlParamIndex !== -1 && url.indexOf('=') > urlParamIndex) ? url.substring(0, urlParamIndex) : url;
}

async function prepareDownload(sessionCookie, course, section, filename, url, tryCounter) {
  if (tryCounter === 3) {
    return;
  }

  const downloadPath = path.resolve(__dirname, 'downloads', course, section);
  fse.mkdirpSync(downloadPath);

  let r;
  try {
    r = await request.get({
      url: url,
      headers: {
        "cookie": `MoodleSession=${sessionCookie};`,
      },
      resolveWithFullResponse: true,
      encoding: null,
      timeout: 30000,
    });
  } catch (err) {
    logger.error("Error in preflight filename extension extraction", err);
    return prepareDownload(sessionCookie, course, section, filename, url, tryCounter !== undefined ? ++tryCounter : 1);
  }
  let uriHref = removeParamsFromUrl(r.request.uri.href);
  let urlExtension = uriHref.substring(uriHref.lastIndexOf('.') + 1);

  filename = filename.trim();
  if (!filename.endsWith(urlExtension)) {
      filename = `${filename}.${urlExtension}`;
  }

  return {
    sessionCookie,
    url,
    filename: replaceAll(filename, path.sep, '_'),
    path: downloadPath,
  };
}

async function download(downloadMetadata) {
  const downloadedFilePath = path.resolve(downloadMetadata.path, downloadMetadata.filename);

  await request.get({
    url: downloadMetadata.url,
    headers: {
      "cookie": `MoodleSession=${downloadMetadata.sessionCookie};`,
    },
    resolveWithFullResponse: true,
    encoding: null,
    timeout: 30000,
  })
    .then(r => {
      /*
      let uriHref = removeParamsFromUrl(r.request.uri.href);
      let urlExtension = uriHref.substring(uriHref.lastIndexOf('.') + 1);
      fse.writeFileSync(path.resolve(downloadMetadata.path, replaceAll(
        `${downloadMetadata.filename}.${urlExtension}`,
        path.sep, '_'
      )), r.body);
      */
      fse.writeFileSync(downloadedFilePath, r.body);
    })
    .catch(e => panic(e, false));

    return true;
}

function aria2c(downloadMetadata) {
  let inputFileBlockLines = [downloadMetadata.url];
  inputFileBlockLines.push(`  header=Cookie:MoodleSession=${downloadMetadata.sessionCookie}`);
  inputFileBlockLines.push(`  dir=${downloadMetadata.path}`);
  inputFileBlockLines.push(`  out=${downloadMetadata.filename}`);
  inputFileBlockLines.push("");
  return inputFileBlockLines.join("\n");
}

Config.load()
  .then((config) => {
    Secrets.load()
      .then((secrets) => {
        scrape(secrets, config)
          .then(async (r) => {
            const toBeDownloaded = [];
            const aria2cInputFileBlocks = [];
            const downloadLogPrefix = config.downloader !== "internal" ? "Preparazione download" : "Download";

            function downloadIfMissing(downloadMetadata) {
              if (downloadMetadata) {
                if (fse.pathExistsSync(path.join(downloadMetadata.path, downloadMetadata.filename))) {
                  logger.silly(`        └─ Risorsa ignorata, esiste già`);
                } else {
                  toBeDownloaded.push(downloadMetadata);
                }
              }
            }

            for (const courseId in r.contents) {
              if (r.contents.hasOwnProperty(courseId)) {
                logger.info(`${downloadLogPrefix} del corso con ID: ${courseId}...`);
                let course = r.contents[courseId];
                let courseName = course.courseName;
                logger.debug(`└─ ${downloadLogPrefix} corso: "${courseName}"...`);

                for (const sectionName in course.sections) {
                  if (course.sections.hasOwnProperty(sectionName)) {
                    logger.debug(`   └─ ${downloadLogPrefix} sezione: "${sectionName}"...`);
                    const sectionFiles = course.sections[sectionName].files;
                    const sectionFolders = course.sections[sectionName].folders;

                    for (const resourceName in sectionFiles) {
                      if (sectionFiles.hasOwnProperty(resourceName)) {
                        let filename = `${sectionFiles[resourceName].prefix}. ${resourceName}`;
                        let url = sectionFiles[resourceName].url;
                        logger.debug(`      └─ Analisi risorsa: "${filename}" @ "${url}"...`);

                        const downloadMetadata = await prepareDownload(r.sessionCookie, courseName, sectionName, filename, url);
                        downloadIfMissing(downloadMetadata);
                      }
                    }

                    for (const folderName in sectionFolders) {
                      if (sectionFolders.hasOwnProperty(folderName)) {
                        const folder = sectionFolders[folderName];
                        for (const resourceName in folder) {
                          if (folder.hasOwnProperty(resourceName)) {
                            let suffixedSectionName = `${sectionName}/${folderName}`;
                            let filename = `${folder[resourceName].prefix}. ${resourceName}`;
                            let url = folder[resourceName].url;
                            logger.debug(`      └─ Analisi risorsa in cartella "${folderName}": "${filename}" @ "${url}"...`);

                            const downloadMetadata = await prepareDownload(r.sessionCookie, courseName, suffixedSectionName, filename, url);
                            downloadIfMissing(downloadMetadata);
                          }
                        }
                      }
                    }

                    for (const downloadMetadata of toBeDownloaded) {
                      logger.debug(`      └─ ${downloadLogPrefix} risorsa: "${downloadMetadata.filename}" @ "${downloadMetadata.url}"...`);
                      switch (config.downloader) {
                        case "aria2":
                          aria2cInputFileBlocks.push(aria2c(downloadMetadata));
                          break;
                        case "internal":
                        default:
                          logger.silly(`Download file in: ${downloadMetadata.path}${path.sep}${downloadMetadata.filename}`);
                          const wasDownloaded = await download(downloadMetadata);
                          if (!wasDownloaded) {
                            logger.silly(`        └─ Download skipped! An error has occurred.`);
                          }
                          break;
                      }
                    }
                  }

                  toBeDownloaded.splice(0, toBeDownloaded.length); // Clear in place
                }
              }
            }

            if (config.downloader === "aria2" && aria2cInputFileBlocks.length > 0) {
              fse.writeFileSync(path.resolve(path.join(__dirname, "aria2c_input.txt")), aria2cInputFileBlocks.join('\n'));
              const resourcesCount = aria2cInputFileBlocks.length;
              logger.warn(`${resourcesCount} nuov${resourcesCount > 1 ? 'e' : 'a'} risors${resourcesCount > 1 ? 'e' : 'a'} da scaricare.`);
              logger.info("File di input per aria2c scritto in \"aria2c_input.txt\".");
              logger.info("Esempio di comando di download: \"aria2c -x 16 -s 16 -c -i aria2c_input.txt\"");
            } else {
              logger.warn("Nessuna nuova risorsa da scaricare.");
            }
          })
          .catch(e => panic(e, false));
      })
      .catch(e => panic(e, false));
  })
  .catch(e => panic(e, false));
