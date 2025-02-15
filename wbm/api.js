const sleep = (waitTimeInMs) =>
  new Promise((resolve) => setTimeout(resolve, waitTimeInMs));
const puppeteer = require("puppeteer");
const qrcode = require("qrcode-terminal");
const { from, merge } = require("rxjs");
const { take } = require("rxjs/operators");
const path = require("path");
var rimraf = require("rimraf");

let browser = false;
let page = null;
let counter = { fails: 0, success: 0 };
const tmpPath = path.resolve(__dirname, "../tmp");

/**
 * Initialize browser, page and setup page desktop mode
 */
async function start({
  showBrowser = true,
  qrCodeData = false,
  session = true,
} = {}) {
  if (!session) {
    deleteSession(tmpPath);
  }

  const args = {
    headless: !showBrowser,
    userDataDir: tmpPath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };
  try {
    browser = await puppeteer.launch(args);
    page = await browser.newPage();
    // prevent dialog blocking page and just accept it(necessary when a message is sent too fast)
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    // fix the chrome headless mode true issues
    // https://gitmemory.com/issue/GoogleChrome/puppeteer/1766/482797370
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36"
    );
    page.setDefaultTimeout(60000);

    await page.goto("https://web.whatsapp.com");
    if (session && (await isAuthenticated())) {
      return;
    } else {
      if (qrCodeData) {
        console.log("Getting QRCode data...");
        console.log(
          "Note: You should use wbm.waitQRCode() inside wbm.start() to avoid errors."
        );
        return await getQRCodeData();
      } else {
        await generateQRCode();
      }
    }
  } catch (err) {
    deleteSession(tmpPath);
    throw err;
  }
}

/**
 * Check if needs to scan qr code or already is is inside the chat
 */
function isAuthenticated() {
  console.log("Authenticating...");
  return merge(needsToScan(page), isInsideChat(page)).pipe(take(1)).toPromise();
}

function needsToScan() {
  return from(
    page
      .waitForSelector("body > div > div > .landing-wrapper", {
        timeout: 0,
      })
      .then(() => false)
  );
}

function isInsideChat() {
  return from(
    page
      .waitForFunction(`document.getElementsByClassName('two')[0]`, {
        timeout: 0,
      })
      .then(() => true)
  );
}

function deleteSession() {
  rimraf.sync(tmpPath);
}
/**
 * return the data used to create the QR Code
 */
async function getQRCodeData() {
  await page.waitForSelector("div[data-ref]", { timeout: 60000 });
  const qrcodeData = await page.evaluate(() => {
    let qrcodeDiv = document.querySelector("div[data-ref]");
    return qrcodeDiv.getAttribute("data-ref");
  });
  return await qrcodeData;
}

/**
 * Access whatsapp web page, get QR Code data and generate it on terminal
 */
async function generateQRCode() {
  try {
    console.log("generating QRCode...");
    const qrcodeData = await getQRCodeData();
    qrcode.generate(qrcodeData, { small: true });
    console.log("QRCode generated! Scan it using Whatsapp App.");
  } catch (err) {
    throw await QRCodeExeption(
      "QR Code can't be generated(maybe your connection is too slow)."
    );
  }
  await waitQRCode();
}

/**
 * Wait 30s to the qrCode be hidden on page
 */
async function waitQRCode() {
  // if user scan QR Code it will be hidden]
 console.log("entrei no método de qr code")
  try {
    console.log("estou em waitQRCod")
    await page.waitForSelector("div[data-ref]", {
      timeout: 30000,
      hidden: true,
    });
  } catch (err) {
    throw await QRCodeExeption("Dont't be late to scan the QR Code.");
  }
}

/**
 * Close browser and show an error message
 * @param {string} msg
 */
async function QRCodeExeption(msg) {
  await browser.close();
  return "QRCodeException: " + msg;
}

/**
 * @param {string} phone phone number: '5535988841854'
 * @param {string} message Message to send to phone number
 * Send message to a phone number
 */
async function sendTo(phoneOrContact, message, ajustes) {
  let phone = phoneOrContact;
  let tempoEnvioMensagem = ajustes.tempoEnvioMensagem * 1000;
  console.log(ajustes.tempoEnvioMensagem);
  if (typeof phoneOrContact === "object") {
    console.log(phoneOrContact.nrTelefone);
    phone = phoneOrContact.nrTelefone;
    message = generateCustomMessage(phoneOrContact, message);
  }
  try {
    process.stdout.write("Sending Message...\r");
    console.log("número atual" + phone);
    await page.goto(
      `https://web.whatsapp.com/send?phone=55${phone}&text=${encodeURIComponent(
        message
      )}`
    );
    await page.waitForSelector("div#startup", { hidden: true, timeout: 60000 });
    await sleep(1000);
    await page.waitForSelector(".selectable-text", { timeout: 30000 });
    await sleep(1000);
    await page.click('#main span[data-testid=send]', {
      hidden: true,
      timeout: 30000,
    });
    console.log(tempoEnvioMensagem);
    await sleep(tempoEnvioMensagem);
    console.log(`${phone} Sent\n`);
    counter.success++;
  } catch (err) {
    console.error(err);
    console.log(`${phone} Failed\n`);
    counter.fails++;
  }
}

/*
 * @param {array} phones Array of phone numbers: ['5535988841854', ...]
 * @param {string} message Message to send to every phone number
 * Send same message to every phone number
 */
async function send(phoneOrContacts, message, ajustes) {
  console.log(phoneOrContacts, message);
  for (let phoneOrContact of phoneOrContacts) {
    await sendTo(phoneOrContact, message, ajustes);
  }
}

/*
 * @param {object} contact contact with several properties defined by the user
 * @param {string} messagePrototype Custom message to send to every phone number
 * @returns {string} message
 * Replace all text between {{}} to respective contact property
 */
function generateCustomMessage(contact, messagePrototype) {
  let message = messagePrototype;
  for (let property in contact) {
    console.log(property);
    message = message.replace(
      new RegExp(`{{${property}}}`, "g"),
      contact[property]
    );
  }
  return message;
}

/**
 * Close browser and show results(number of messages sent and failed)
 */
async function end() {
  await browser.close();
  console.log(`Result: ${counter.success} sent, ${counter.fails} failed`);
}

module.exports = {
  start,
  send,
  sendTo,
  end,
  waitQRCode,
};
