const express = require('express');
const app = express();
const port = 3000;
const sharp = require('sharp');
const Canvas = require('canvas');
Canvas.registerFont('./Roboto-Bold.ttf', { family: 'Roboto' });
const fetch = require('node-fetch');
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
app.get('/owoActions', (req, res) => {
  res.json(Object.keys(owoInfo));
});
const gifResize = require('@gumlet/gif-resize');
app.get('/owoProxy.gif', async (req, res) => {
  if (
    !Object.values(owoInfo)
      .flatMap((n) => n.gifs)
      .includes(req.query.url)
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
  if (!req.query.url) res.status(400).send('Error: url not provided');
  try {
    res.contentType('image/png');
    res.send(
      await sharp(await (await fetch(req.query.url)).buffer())
        .resize({ height: 128, width: 128, fit: 'outside' })
        .png()
        .toBuffer()
    );
  } catch (e) {
    res.status(500).send(e.toString());
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
  console.log(
    `Caching ${Object.values(owoInfo).flatMap((n) => n.gifs).length} gifs`
  );
  for (const gif of Object.values(owoInfo).flatMap((n) => n.gifs))
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
app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
