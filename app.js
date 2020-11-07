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

async function prepareDownload(sessionCookie, course, section, filename, url) {
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
    return;
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
  if (fse.pathExistsSync(downloadedFilePath)) {
    return false;
  }

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
            const aria2cInputFileBlocks = [];
            const downloadLogPrefix = config.downloader !== "internal" ? "Preparazione download" : "Download";

            for (const courseId in r.contents) {
              if (r.contents.hasOwnProperty(courseId)) {
                logger.info(`${downloadLogPrefix} del corso con ID: ${courseId}...`);
                let course = r.contents[courseId];
                let courseName = course.courseName;
                logger.debug(`└─ ${downloadLogPrefix} corso: "${courseName}"...`);

                for (const sectionName in course.sections) {
                  if (course.sections.hasOwnProperty(sectionName)) {
                    logger.debug(`   └─ ${downloadLogPrefix} sezione: "${sectionName}"...`);
                    let section = course.sections[sectionName];

                    for (const resourceName in section) {
                      if (section.hasOwnProperty(resourceName)) {
                        let filename = `${section[resourceName].prefix}. ${resourceName}`;
                        let url = section[resourceName].url;

                        logger.debug(`      └─ ${downloadLogPrefix} risorsa: "${filename}" @ "${url}"...`);
                        const downloadMetadata = await prepareDownload(r.sessionCookie, courseName, sectionName, filename, url);
                        if (downloadMetadata) {
                          switch (config.downloader) {
                            case "aria2":
                              aria2cInputFileBlocks.push(aria2c(downloadMetadata));
                              break;
                            case "internal":
                            default:
                              logger.silly(`Download file in: ${downloadMetadata.path}${path.sep}${downloadMetadata.filename}`);
                              const wasDownloaded = await download(downloadMetadata);
                              if (!wasDownloaded) {
                                logger.silly(`Download skipped! File exists or an error has been handled.`);
                              }
                              break;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }

            if (config.downloader === "aria2" && aria2cInputFileBlocks.length > 0) {
              fse.writeFileSync(path.resolve(path.join(__dirname, "aria2c_input.txt")), aria2cInputFileBlocks.join('\n'));
              logger.info("File di input per aria2c scritto in \"aria2c_input.txt\".");
              logger.info("Esempio di comando di download: \"aria2c -x 16 -s 16 -c -i aria2c_input.txt\"");
            }
          })
          .catch(e => panic(e, false));
      })
      .catch(e => panic(e, false));
  })
  .catch(e => panic(e, false));
