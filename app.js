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

async function download(sessionCookie, course, section, filename, url) {
  const downloadPath = path.resolve(__dirname, 'downloads', course, section);
  fse.mkdirpSync(downloadPath);
  logger.silly(`Download file in: ${downloadPath}`);
  await request.get({
    url: url,
    headers: {
      "cookie": `MoodleSession=${sessionCookie};`,
    },
    resolveWithFullResponse: true,
    encoding: null
  })
    .then(r => {
      let uriHref = removeParamsFromUrl(r.request.uri.href);
      let urlExtension = uriHref.substring(uriHref.lastIndexOf('.') + 1);
      fse.writeFileSync(path.resolve(downloadPath, replaceAll(
        `${filename}.${urlExtension}`,
        path.sep, '_'
      )), r.body);
    })
    .catch(e => panic(e, false));
}

function removeParamsFromUrl(url) {
  let urlParamIndex = url.indexOf('?');
  return (urlParamIndex != -1 && url.indexOf('=') > urlParamIndex) ? url.substring(0, urlParamIndex) : url;
}

Config.load()
  .then((config) => {
    Secrets.load()
      .then((secrets) => {
        scrape(secrets, config)
          .then((r) => {
            //logger.silly(JSON.stringify(r.contents));
            for (const courseId in r.contents) {
              if (r.contents.hasOwnProperty(courseId)) {
                logger.info(`Download del corso con ID: ${courseId}...`);
                let course = r.contents[courseId];
                let courseName = course.courseName;
                logger.debug(`└─ Download corso: "${courseName}"...`);

                for (const sectionName in course.sections) {
                  if (course.sections.hasOwnProperty(sectionName)) {
                    logger.debug(`   └─ Download sezione: "${sectionName}"...`);
                    let section = course.sections[sectionName];

                    for (const resourceName in section) {
                      if (section.hasOwnProperty(resourceName)) {
                        let resourceUrl = section[resourceName];

                        logger.debug(`      └─ Download risorsa: "${resourceName}" @ "${resourceUrl}"...`);
                        download(r.sessionCookie, courseName, sectionName, resourceName, resourceUrl);
                      }
                    }
                  }
                }
              }
            }
          })
          .catch(e => panic(e, false));
      })
      .catch(e => panic(e, false));
  })
  .catch(e => panic(e, false));
