import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {globSync} from 'glob';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imagesSourceDir = path.join(__dirname, 'src');
const imageDirPattern = `${imagesSourceDir}/**/*.{png,jpg,jpeg,gif,svg}`
const outputDir = path.join(__dirname, '_prebuild_output/assets/images');
const mappingFilePath = path.join(__dirname, 'src/assets/imageMapping.json');

// Ensure the output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, {recursive: true});
}

let imageMapping = {};

function gatherAssets() {

    let imageFiles = globSync(imageDirPattern);


    imageFiles.forEach(file => {
        const buffer = fs.readFileSync(file);
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        const ext = path.extname(file);
        const hashedFilename = `${hash}${ext}`;
        const outputPath = path.join(outputDir, hashedFilename);

        // Optional: Process images with sharp here if needed

        fs.writeFileSync(outputPath, buffer);

        // Create mapping
        const originalPath = path.relative(imagesSourceDir, file).replace(/\\/g, '/');
        imageMapping[originalPath] = `assets/images/${hashedFilename}`;
    });

    // Write the mapping to a JSON file
    fs.writeFileSync(mappingFilePath, JSON.stringify(imageMapping, null, 2));
    console.log('Image processing complete. Mapping saved to:', mappingFilePath, 'Found', Object.keys(imageMapping).length, 'images.');
}

export default gatherAssets;