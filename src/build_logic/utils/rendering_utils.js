import path from "path";
import fs from "fs";
import nunjucks from "nunjucks";
import { getProjectDirs } from "../dirs.js";

export function renderPage({ template_path, context, output_path, layout = "base.njk", site }) {
    const { outputPrimaryRootDir, templateDir } = getProjectDirs();
    const outputFilePath = path.join(outputPrimaryRootDir, site, output_path);

    if (!fs.existsSync(outputFilePath)) {
        fs.mkdirSync(path.dirname(outputFilePath), {recursive: true});
    }
    const template = path.join(templateDir, template_path);
    let rendered_page = nunjucks.render(template, context);
    fs.writeFileSync(outputFilePath, rendered_page);
    return rendered_page;
}