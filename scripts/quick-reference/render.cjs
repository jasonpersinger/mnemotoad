// Electron renderer for the quick reference: loads the HTML in a hidden window and writes the PDF (Letter landscape) and a
// 2× PNG. Usage: electron scripts/quick-reference/render.cjs <html> <pdf> <png>
const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const [html, pdf, png] = process.argv.slice(-3);
app.commandLine.appendSwitch('force-device-scale-factor', '2');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1056, height: 816, useContentSize: true, webPreferences: { offscreen: false, javascript: false } });
  win.setContentSize(1056, 816); await win.loadFile(html);
  await new Promise(r => setTimeout(r, 400));
  writeFileSync(pdf, await win.webContents.printToPDF({ landscape: true, pageSize: 'Letter', printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } }));
  writeFileSync(png, (await win.webContents.capturePage({ x: 0, y: 0, width: 1056, height: 816 })).toPNG());
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
