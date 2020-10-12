const express = require('express');
const app = express();
const port = 3000;
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
  ctx.fillStyle = 'white';
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
    votes.up > 1_000_000 ||
    votes.down > 1_000_000 ||
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
    ctx.fillStyle = '#535353';
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
app.get('/owoJson', (req, res) => {
  if (Object.keys(owoInfo).indexOf(req.query.action) === -1) {
    res.status(404);
    res.json({});
    return;
  }
  res.json({
    imageURL: owoInfo[req.query.action].gifs.random(),
    authorName: req.query.authee
      ? owoInfo[req.query.action].titles
          .random()
          .split('authee')
          .join(req.query.authee)
          .split('author')
          .join(req.query.author)
      : owoInfo[req.query.action].titles
          .random()
          .split('author')
          .join(req.query.author)
          .split('authee')
          .join('somebody'),
  });
});
app.get('/owoActions', (req, res) => {
  res.json(Object.keys(owoInfo));
});
const gifResize = require('@gumlet/gif-resize');
app.get('/owoProxy.gif', async (req, res) => {
  res.setHeader('Content-Type', 'image/gif');
  if (myCache.get(`owoProxy.${decodeURIComponent(req.query.url)}`))
    res.send(myCache.get(`owoProxy.${decodeURIComponent(req.query.url)}`));
  else {
    myCache.set(
      `owoProxy.${decodeURIComponent(req.query.url)}`,
      await gifResize({
        height: 223,
        stretch: true,
        optimization: 3,
        resize_method: 'lanczos3',
      })(await (await fetch(decodeURIComponent(req.query.url))).buffer())
    );
    res.send(myCache.get(`owoProxy.${decodeURIComponent(req.query.url)}`));
  }
});
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
