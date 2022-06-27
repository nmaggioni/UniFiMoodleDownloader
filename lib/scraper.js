const logger = require('./logging').createConsoleLogger('Scraper');

const url = require('url');
const path = require('path');
const { sanitizePath } = require('./utils');

const puppeteer = require('puppeteer');
const headless = process.env['HEADLESS'] !== 'false';

async function getCookie(page, name) {
  let cookies = await page.cookies();
  for (const cookie of cookies) {
    if (cookie.name === name) {
      return cookie.value;
    }
  }
  return null;
}

/**
 * @param page Puppeteer page instance
 * @param {String} courseId
 * @return {Promise<*>}
 */
async function scrapeCourse(page, courseId) {
  await page.goto(`https://e-l.unifi.it/course/view.php?id=${courseId}`, {
    waitUntil: 'networkidle2'
  });

  // noinspection JSUnresolvedVariable
  let courseName = await page.$eval('h1', el => el.innerText);
  logger.debug(`└─ Trovato corso "${courseName}"`);

  let sectionContents = {};
  let sections = await page.$$('li.section[id^="section-"]');
  for (let [sectionIndex, section] of sections.entries()) {
    sectionIndex += 1;  // Start from 1 instead of 0
    section = section.asElement();
    let sectionName = await section.$eval('h3.sectionname', el => el.innerText);
    logger.debug(`   └─ Trovata sezione #${sectionIndex}: "${sectionName}"`);
    let sectionKey = sanitizePath(`${sectionIndex}. ${sectionName}`.trim());

    // Section attachments
    let sectionResources = {};
    let resources = await section.$$('ul.section.img-text li.resource div.activityinstance');
    for (let [i, resource] of resources.entries()) {
      resource = resource.asElement();
      let resourceName = await resource.$eval('span.instancename', el => el.childNodes[0].nodeValue);
      let isResourceClickable = await resource.$('a span.instancename');
      if (isResourceClickable != null) {
        let resourceViewUrl = await resource.$eval('a', el => el.href);
        logger.debug(`      └─ Trovata risorsa "${resourceName}" @ "${resourceViewUrl}"`);
        resourceName = sanitizePath(resourceName);
        sectionResources[resourceName] = { prefix: `${i + 1}`, url: resourceViewUrl };
      } else {
        let restrictedCause = 'ignota';
        let accessRestricted = await resource.$('div.availabilityinfo.isrestricted');
        if (accessRestricted != null) {
          let activityLink = await resource.$('a');
          if (activityLink != null) {
            restrictedCause = await resource.$eval('a', el => el.innerText);
          }
        }
        logger.warning(`      └─ Risorsa non accessibile "${resourceName}" causa attività mancante "${restrictedCause}"`);
      }
    }
    sectionContents[sectionKey] = {};
    sectionContents[sectionKey].files = sectionResources;

    // Files plugin
    let altSectionResources = {};
    let altResources = await section.$$('div.summary a');
    for (let [i, resource] of altResources.entries()) {
      resource = resource.asElement();
      let resourceViewUrl = await page.evaluate(el => {
        return el.href.startsWith('https://e-l.unifi.it/pluginfile.php') ? el.href : null;
      }, resource);
      if (resourceViewUrl) {
        let resourceName = await page.evaluate(el => el.childNodes.length ? el.childNodes[0].nodeValue : null, resource);
        if (resourceName === null) {
          resourceName = path.basename(url.parse(resourceViewUrl).path);
          let paramIndex = resourceName.lastIndexOf('?');
          if (paramIndex !== -1) {
            resourceName = resourceName.substring(0, paramIndex);
          }
          resourceName = decodeURI(resourceName);
          resourceName = resourceName.substring(0, resourceName.lastIndexOf('.'));
        }
        logger.debug(`      └─ Trovata risorsa alternativa "${resourceName}" @ "${resourceViewUrl}"`);
        resourceName = sanitizePath(resourceName);
        altSectionResources[resourceName] = { prefix: `ALT-${i + 1}`, url: resourceViewUrl };
      }
    }
    Object.assign(sectionContents[sectionKey].files, altSectionResources);

    // Folders
    let sectionFolders = {};
    let folders = await section.$$('ul.section.img-text li.folder div.activityinstance');
    for (let [i, folder] of folders.entries()) {
      folder = folder.asElement();
      let folderName = await folder.$eval('span.instancename', el => el.childNodes[0].nodeValue);
      let isFolderClickable = await folder.$('a span.instancename');
      if (isFolderClickable != null) {
        let folderUrl = await folder.$eval('a', el => el.href);
        logger.debug(`      └─ Trovata cartella "${folderName}" @ "${folderUrl}"`);
        folderName = sanitizePath(`${i + 1}. ${folderName}`);
        sectionFolders[folderName] = {};
        const folderPage = await page.browser().newPage();
        await folderPage.goto(folderUrl, {
          waitUntil: 'networkidle2'
        });
        let folderContents = await folderPage.$$('span.fp-filename-icon');
        for (let [j, content] of folderContents.entries()) {
          content = content.asElement();
          let contentName = await content.$eval('span.fp-filename', el => el.innerText);
          let contentUrl = await content.$eval('a', el => el.href);
          logger.debug(`        └─ Trovato contenuto "${contentName}" @ "${contentUrl}"`);
          contentName = sanitizePath(contentName);
          sectionFolders[folderName][contentName] = { prefix: j + 1, url: contentUrl };
        }
        await folderPage.close();
      } else {
        logger.warning(`      └─ Cartella non accessibile "${folderName}"`);
      }
    }
    sectionContents[sectionKey].folders = sectionFolders;
  }

  return { courseName: courseName, sections: sectionContents };
}

/**
 * @param {{ moodle_username: String, moodle_password: String }} secrets
 * @param {{ courseIDs: String[], headless: boolean }} config
 * @return {Promise<*>}
 */
async function scrape(secrets, config) {
  logger.info(`Inizializzando Puppeteer...`);
  const browser = await puppeteer.launch({
    headless: headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Moodle login
  logger.info(`Facendo il login a Moodle...`);
  await page.goto('https://e-l.unifi.it/login/index.php', {
    waitUntil: 'networkidle2'
  });
  await page.waitForSelector('a[title="Login utenti"]');
  await page.click('a[title="Login utenti"]');
  await page.waitForSelector('input#username');
  await page.type('input#username', String(secrets.moodle_username));
  await page.type('input#password', String(secrets.moodle_password));
  await page.waitForSelector('button[name="submit"][type="submit"]');
  (await page.$('button[name="submit"][type="submit"]')).evaluate(el => el.click());  // Puppeteer's own `click` API sometimes fails
  await page.waitForSelector('a[title="Dashboard"][href="/my/"]');

  if (await page.$('div.alert.alert-danger') !== null) {
    let err = await page.$eval('div.alert.alert-danger', (div) => (div.innerText === 'Login errato, riprova'));
    if (err) {
      throw 'Le credenziali Moodle che hai impostato non sono valide.';
    }
  }

  let contents = {};
  for (const courseId of config.courseIDs) {
    logger.info(`Scraping del corso con ID: ${courseId}...`);
    contents[courseId] = await scrapeCourse(page, courseId);
  }

  await page.goto('https://e-l.unifi.it/', {
    waitUntil: 'networkidle2'
  });
  let ret = { sessionCookie: await getCookie(page, 'MoodleSession'), contents: contents };

  await browser.close();
  return ret;
}

function delay(time) {
  return new Promise(function(resolve) {
    setTimeout(resolve, time)
  });
}

module.exports = {
  scrape: scrape
};
