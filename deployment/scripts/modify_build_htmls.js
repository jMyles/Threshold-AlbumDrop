import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

const {
    PR_BUILD_DIR,
    COMMIT_SHA,
    CHANGE_URL,
    CHANGE_ID,
    CHANGE_BRANCH,
    CHANGE_FORK
} = process.env;

const betaBanner = `
<div style='background-color: #ff6b6b; color: white; padding: 1em; text-align: center; position: absolute; top: 0; left: 0; right: 0; z-index: 9999;'>
    ⚠️ BETA VERSION - Commit ${COMMIT_SHA} ⚠️<br>
    See: <a href='${CHANGE_URL}'>Pull Request #${CHANGE_ID}, requesting merge of ${CHANGE_BRANCH} from ${CHANGE_FORK}</a><br>
    This is a preview build. Use at your own risk. Features may be incomplete or unstable.
</div>
`;

const indexPage = `
<html>
<head><title>PR Build ${COMMIT_SHA}</title></head>
<body>
    <h2>PR Build for ${COMMIT_SHA}</h2>
    <h3>BETA VERSIONS - Use at your own risk<h3>
    <h4>    See: <a href='${CHANGE_URL}'>Pull Request #${CHANGE_ID}, requesting merge of ${CHANGE_BRANCH} from ${CHANGE_FORK}</a></h4>
    <ul>
        <li><a href='justinholmes.com/'>justinholmes.com</a></li>
        <li><a href='cryptograss.live/'>cryptograss.live</a></li>
    </ul>
</body>
</html>
`;

async function modifyHtmlFiles() {
    try {
        // Find all HTML files
        const htmlFiles = await glob(`${PR_BUILD_DIR}/**/*.html`);

        for (const file of htmlFiles) {
            let content = await fs.readFile(file, 'utf8');

            // Fix asset paths
            content = content.replace(/\/assets\//g, './assets/');

            // Add beta banner
            content = content.replace(/<body([^>]*)>/i, `<body$1>${betaBanner}`);

            await fs.writeFile(file, content);
        }

        // Create index page
        await fs.writeFile(path.join(PR_BUILD_DIR, 'index.html'), indexPage);

        console.log('Successfully modified HTML files');
    } catch (error) {
        console.error('Error modifying HTML files:', error);
        process.exit(1);
    }
}

modifyHtmlFiles();