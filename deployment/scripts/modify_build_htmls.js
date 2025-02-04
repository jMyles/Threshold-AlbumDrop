import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

const {
    PR_BUILD_DIR,
    COMMIT_SHA,
    CHANGE_URL,
    CHANGE_ID,
    CHANGE_BRANCH,
    CHANGE_FORK,
    CHANGE_TITLE,
    COMMIT_MESSAGE,
} = process.env;

const warningBanner = `
<div style='background-color: #510000; color: white; text-align: center; position: fixed; top: 0; left: 0; right: 0; z-index: 9999; height:80px;'>
    ⚠️ PULL REQUEST BUILD - Commit ${COMMIT_SHA} ⚠️<br>
    <a href='${CHANGE_URL}' style='color: white; text-decoration: underline;'>
        PR #${CHANGE_ID}: ${CHANGE_BRANCH} from ${CHANGE_FORK}
    </a><br>
    This is a preview build. Features may be incomplete, unstable, unaudited, and insecure.
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

            // Add warning banner at the top of the body
            content = content.replace(
                /<body([^>]*)>/i,
                `<body$1>${warningBanner}`
            );

            // Add CSS variable for content padding
            content = content.replace(
                /<\/head>/i,
                `<style>
                    :root { --warning-height: 80px; }
                    body { padding-top: var(--warning-height); }
                </style>
                </head>`
            );

            await fs.writeFile(file, content);
            console.log("Modified file: ", file);
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