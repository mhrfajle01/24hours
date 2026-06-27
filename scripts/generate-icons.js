import { Jimp } from 'jimp';
import path from 'path';

const srcImage = '/data/data/com.termux/files/home/.gemini/antigravity-cli/brain/a288dbdf-5b9f-40ae-8a08-9a6e28964cae/hourlog_app_icon_1782599760678.jpg';
const publicDir = '/data/data/com.termux/files/home/24hours/public';

async function main() {
  console.log('Reading source image...', srcImage);
  const image = await Jimp.read(srcImage);
  
  console.log('Generating 192x192 icon...');
  await image.clone().resize({ w: 192, h: 192 }).write(path.join(publicDir, 'pwa-192x192.png'));
  
  console.log('Generating 512x512 icon...');
  await image.clone().resize({ w: 512, h: 512 }).write(path.join(publicDir, 'pwa-512x512.png'));
  
  console.log('Generating 180x180 apple touch icon...');
  await image.clone().resize({ w: 180, h: 180 }).write(path.join(publicDir, 'apple-touch-icon.png'));
  
  console.log('All icons generated successfully!');
}

main().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
