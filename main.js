const express = require('express');
const app = express();
const sharp = require('sharp');
const Canvas = require('canvas');
Canvas.registerFont('./Roboto-Bold.ttf', { family: 'Roboto' });
const fetch = require('node-fetch');
const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');

const blockedRanges = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
])
  blockedRanges.addSubnet(addr, prefix, 'ipv4');
for (const [addr, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
])
  blockedRanges.addSubnet(addr, prefix, 'ipv6');

function publicOnlyLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const blocked = addresses.find((a) =>
      blockedRanges.check(a.address, a.family === 6 ? 'ipv6' : 'ipv4')
    );
    if (blocked || addresses.length === 0)
      return callback(new Error('destination not allowed'));
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}
const httpAgent = new http.Agent({ lookup: publicOnlyLookup });
const httpsAgent = new https.Agent({ lookup: publicOnlyLookup });
const MAX_FETCH_BYTES = 8 * 1024 * 1024;
const ALLOWED_FORMATS = ['png', 'jpeg', 'webp', 'gif'];
const MAX_REDIRECTS = 3;
const MAX_INPUT_PIXELS = 4096 * 4096;

function assertAllowedUrl(target) {
  if (target.protocol !== 'http:' && target.protocol !== 'https:')
    throw new Error('unsupported scheme');
  const literal = target.hostname.replace(/^\[|\]$/g, '');
  const literalFamily = net.isIP(literal);
  if (literalFamily && blockedRanges.check(literal, literalFamily === 6 ? 'ipv6' : 'ipv4'))
    throw new Error('destination not allowed');
}

async function fetchPublicImage(rawUrl) {
  let target = new URL(rawUrl);
  const deadline = Date.now() + 10000;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertAllowedUrl(target);
    const response = await fetch(target.href, {
      agent: target.protocol === 'https:' ? httpsAgent : httpAgent,
      redirect: 'manual',
      compress: false,
      headers: { 'Accept-Encoding': 'identity' },
      size: MAX_FETCH_BYTES,
      timeout: Math.max(1, deadline - Date.now()),
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      target = new URL(response.headers.get('location'), target);
      continue;
    }
    if (!response.ok) throw new Error('upstream error ' + response.status);
    if ((response.headers.get('content-encoding') || 'identity') !== 'identity')
      throw new Error('encoded responses not accepted');
    const buffer = await response.buffer();
    const { format } = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!ALLOWED_FORMATS.includes(format)) throw new Error('unsupported image format');
    return buffer;
  }
  throw new Error('too many redirects');
}

function roundRect(ctx, x, y, width, height, rradius, fill, stroke) {
  const radius = { tl: rradius, tr: rradius, br: rradius, bl: rradius };
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + width - radius.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  ctx.lineTo(x + width, y + height - radius.br);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius.br,
    y + height
  );
  ctx.lineTo(x + radius.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();
  if (fill) {
    ctx.fill();
  }
  if (stroke) {
    ctx.stroke();
  }
}
function createPollAttachment(votes) {
  const canvas = Canvas.createCanvas(320, 194);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2F3136';
  ctx.rect(0, 0, 320, 194);
  ctx.fill();
  if (votes.up == 0 && votes.down == 0) {
    ctx.fillStyle = '#4397C7';
    roundRect(ctx, 40, 74, 240, 46, 5, true, false);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '500 27px Roboto';
    ctx.fillText('No Votes', 320 / 2, 107);
  } else if (
    isNaN(votes.up) ||
    isNaN(votes.down) ||
    votes.up > 1000000 ||
    votes.down > 1000000 ||
    votes.up < 0 ||
    votes.down < 0
  ) {
    ctx.fillStyle = '#C74343';
    roundRect(ctx, 114, 74, 92, 46, 5, true, false);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '500 27px Roboto';
    ctx.fillText('Error', 320 / 2, 107);
  } else {
    ctx.fillStyle = '#45CE39';
    roundRect(ctx, 40, 74, 240, 46, 5, true, false);
    if (votes.down !== 0) {
      ctx.fillStyle = '#CE3939';
      roundRect(
        ctx,
        40,
        74,
        240 * (votes.down / (votes.down + votes.up)),
        46,
        5,
        true,
        false
      );
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 20px Roboto';
    if (votes.up >= votes.down)
      ctx.fillText(
        Math.round((votes.up / (votes.down + votes.up)) * 100) + '% In Favor',
        320 / 2,
        60
      );
    else
      ctx.fillText(
        Math.round((votes.down / (votes.down + votes.up)) * 100) + '% Against',
        320 / 2,
        60
      );
    ctx.textAlign = 'left';
    ctx.fillText(votes.down + ' Against', 40, 145);
    ctx.textAlign = 'right';
    ctx.fillText(votes.up + ' In Favor', 278, 145);
  }
  return canvas;
}
app.get('/poll', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  createPollAttachment({
    up: parseInt(req.query.up),
    down: parseInt(req.query.down),
  })
    .pngStream()
    .pipe(res);
});
Array.prototype.random = function () {
  return this[Math.floor(Math.random() * this.length)];
};
const NodeCache = require('node-cache');
const myCache = new NodeCache();
const owoInfo = require('./owoInfo.json');
const coinFlipGifs = require('./coinFlipGifs.json');
const getColors = require('get-image-colors');
const chroma = require('chroma-js');
app.get('/owoJson', async (req, res) => {
  if (Object.keys(owoInfo).indexOf(req.query.action) === -1) {
    res.status(404);
    res.json({});
    return;
  }
  const gif = owoInfo[req.query.action].gifs.random();
  const color = (
    await getColors(
      await sharp(
        myCache.get(`owoProxy.${gif}`) || (await (await fetch(gif)).buffer())
      )
        .png()
        .toBuffer(),
      'image/png'
    )
  ).filter((c) => chroma.deltaE(c.hex(), '#FFFFFF') > 15);
  res.json({
    imageURL: gif,
    authorName: owoInfo[req.query.action].titles
      .random()
      .split('authee')
      .join(req.query.authee || 'somebody')
      .split('author')
      .join(req.query.author || 'somebody'),
    color: color[0] ? color[0].hex() : '#FFFFFF',
  });
});
app.get('/coinFlip', async (req, res) => {
  const gif = coinFlipGifs.random();
  res.json({
    imageURL: gif,
    length: gifDuration(await (await fetch(gif)).buffer()),
  });
});
function gifDuration(data) {
  var d = new Uint8Array(data);
  // Thanks to http://justinsomnia.org/2006/10/gif-animation-duration-calculation/
  // And http://www.w3.org/Graphics/GIF/spec-gif89a.txt
  var duration = 0;
  for (var i = 0; i < d.length; i++) {
    // Find a Graphic Control Extension hex(21F904__ ____ __00)
    if (
      d[i] == 0x21 &&
      d[i + 1] == 0xf9 &&
      d[i + 2] == 0x04 &&
      d[i + 7] == 0x00
    ) {
      // Swap 5th and 6th bytes to get the delay per frame
      var delay = (d[i + 5] << 8) | (d[i + 4] & 0xff);

      // Should be aware browsers have a minimum frame delay
      // e.g. 6ms for IE, 2ms modern browsers (50fps)
      duration += delay < 2 ? 10 : delay;
    }
  }
  return duration * 10;
}
app.get('/owoActions', (req, res) => {
  res.json(Object.keys(owoInfo));
});
const gifResize = require('@gumlet/gif-resize');
app.get('/owoProxy.gif', async (req, res) => {
  if (
    !Object.values(owoInfo)
      .flatMap((n) => n.gifs)
      .includes(req.query.url) &&
    !coinFlipGifs.includes(req.query.url)
  ) {
    noFreeConversions(res);
    return;
  }
  res.setHeader('Content-Type', 'image/gif');
  if (myCache.get(`owoProxy.${decodeURIComponent(req.query.url)}`))
    res.send(myCache.get(`owoProxy.${decodeURIComponent(req.query.url)}`));
  else {
    myCache.set(
      `owoProxy.${decodeURIComponent(req.query.url)}`,
      await resizeGif(decodeURIComponent(req.query.url))
    );
    res.send(myCache.get(`owoProxy.${decodeURIComponent(req.query.url)}`));
  }
});
app.get('/emojiResize.png', async (req, res) => {
  if (typeof req.query.url !== 'string')
    return res.status(400).send('Error: url not provided');
  try {
    const image = await fetchPublicImage(req.query.url);
    const resized = await sharp(image, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ height: 128, width: 128, fit: 'outside' })
      .png()
      .toBuffer();
    res.contentType('image/png');
    res.send(resized);
  } catch (e) {
    console.error('emojiResize failed:', e.message);
    res.status(422).send('Error: could not process image');
  }
});
async function resizeGif(url) {
  return await gifResize({
    height: 223,
    stretch: true,
    optimization: 3,
    resize_method: 'lanczos3',
  })(await (await fetch(url)).buffer());
}
(async () => {
  console.log(`Caching gifs`);
  for (const gif of Object.values(owoInfo).flatMap((n) => n.gifs))
    myCache.set(`owoProxy.${gif}`, await resizeGif(gif));
  for (const gif of coinFlipGifs)
    myCache.set(`owoProxy.${gif}`, await resizeGif(gif));

  console.log('Cached all gifs');
})();
function noFreeConversions(res) {
  res.setHeader('Content-Type', 'image/png');
  const canvas = Canvas.createCanvas(320, 194);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.rect(0, 0, 320, 194);
  ctx.fill();
  ctx.fillStyle = '#333333';
  ctx.textAlign = 'center';
  ctx.font = '500 27px Roboto';
  ctx.fillText('No Free Conversions!', 320 / 2, 107);
  canvas.pngStream().pipe(res);
  res.status(404);
}
app.get('/online', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  const canvas = Canvas.createCanvas(320, 194);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.rect(0, 0, 320, 194);
  ctx.fill();
  ctx.fillStyle = '#333333';
  ctx.textAlign = 'center';
  ctx.font = '500 27px Roboto';
  ctx.fillText('Howdy!', 320 / 2, 107);
  ctx.font = '500 20px Roboto';
  ctx.fillText('From ' + 'scratchyone!', 320 / 2, 70);
  canvas.pngStream().pipe(res);
});
app.get('/', (req, res) => {
  res.send('Online');
});
app.use((err, req, res, next) => {
  console.error(err);
  if (!res.headersSent) res.status(500).send('Error');
});
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
app.listen(process.env.PORT, () => {
  console.log(`Example app listening at http://localhost:${process.env.PORT}`);
});
