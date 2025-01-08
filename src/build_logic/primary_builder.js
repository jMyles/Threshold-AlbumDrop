import { slugify } from "./utils/text_utils.js";
import { renderPage } from "./utils/rendering_utils.js";
import { dataDir, outputPrimaryRootDir, templateDir, fetchedAssetsDir } from "./constants.js";
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { songs, shows, songsByProvenance, pickers } from "./show_and_set_data.js";
import { marked } from 'marked';
import { gatherAssets, unusedImages, imageMapping } from './asset_builder.js';
import { deserializeChainData, serializeChainData } from './chaindata_db.js';
import { execSync } from 'child_process';
import { generateSetStonePages, renderSetStoneImages } from './setstone_utils.js';
import { registerHelpers } from './utils/template_helpers.js';
import { appendChainDataToShows, fetch_chaindata } from './chain_reading.js';
import nunjucks from "nunjucks";
import { blueRailroadContractAddress } from '../js/constants.js';

async function verifyBlueRailroadVideos() {
    const chainId = '10';
    const metadataPath = path.join(fetchedAssetsDir, `${chainId}-${blueRailroadContractAddress}.json`);

    if (!fs.existsSync(metadataPath)) {
        throw new Error(
            'Blue Railroad metadata not found! Please run:\n' +
            'npm run fetch-video-metadata\n' +
            'npm run download-videos'
        );
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath));
    const missingVideos = [];

    for (const [tokenId, data] of Object.entries(metadata)) {
        if (!data.video_url) continue; // Skip entries without videos

        const expectedVideoPath = path.join(
            fetchedAssetsDir,
            `${chainId}-${blueRailroadContractAddress}-${tokenId}.mp4`
        );

        if (!fs.existsSync(expectedVideoPath)) {
            missingVideos.push(tokenId);
        }
    }

    if (missingVideos.length > 0) {
        throw new Error(
            `Missing videos for tokens: ${missingVideos.join(', ')}\n` +
            'Please run: npm run download-videos'
        );
    }

    // Sort by latest first.
    return Object.entries(metadata).reverse()
}

const ensureDirectories = () => {
    const dirs = [
        path.resolve(outputPrimaryRootDir, 'cryptograss/assets'),
        path.resolve(outputPrimaryRootDir, 'setstones'),
        path.resolve(outputPrimaryRootDir, 'cryptograss/tools'),
        path.resolve(outputPrimaryRootDir, 'cryptograss/bazaar'),
    ];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
};

const getTemplateDir = (site) => {
    return path.join(templateDir, site);
};

export const runPrimaryBuild = async (skip_chain_data_fetch, site = "justinholmes.com") => {
    const siteTemplateDir = getTemplateDir(site);
    ensureDirectories();
    console.time('primary-build');

    // TODO: Do we need to make sure the root output directory exists?

    // ...now, same for the site-specific output directory.
    const outputSiteDir = path.resolve(outputPrimaryRootDir, site);
    if (fs.existsSync(outputSiteDir)) {
        fs.rmSync(outputSiteDir, { recursive: true });
    }
    fs.mkdirSync(outputSiteDir, { recursive: true });

    /////////////////////////
    ///// Chapter one: chain data
    ////////////////////////////
    console.time("chain-data");
    if (skip_chain_data_fetch) {
        console.log("Skipping chain data retrieval.");
    } else {
        const fetchedchainData = await fetch_chaindata(shows);
        serializeChainData(fetchedchainData);
    }

    let chainData

    try {
        chainData = deserializeChainData();
    } catch (e) {
        // If the error is that the directory wasn't found, make a suggestion.
        if (e.code === 'ENOENT' && skip_chain_data_fetch) {
            throw new Error("Chain data not found, and you're running with 'skip_chain_data_fetch'. You probably need to fetch chain data.");
        } else {
            throw e;
        }
    }

    // Verify videos early
    const blueRailroadMetadata = await verifyBlueRailroadVideos();
    chainData.blueRailroads = blueRailroadMetadata;

    console.timeEnd("chain-data");

    //////////////////////////////////
    ///// Chapter two: assets
    //////////////////////////////////
    gatherAssets();


    ////////////////////////////////////////////////
    ///// Chapter three: One-off Pages
    /////////////////////////////////////////////
    console.time('pages-yaml-read');

    ////////
    /// Chapter 3.1: Register helpers, partials, and context
    //////

    // We'll need helpers....
    registerHelpers(site);

    // ...and processed context...
    appendChainDataToShows(shows, chainData); // Mutates shows.
    const dataAvailableAsContext = {
        "songs": songs,
        "shows": shows,
        'songsByProvenance': songsByProvenance,
        'latest_git_commit': execSync('git rev-parse HEAD').toString().trim(),
        'chainData': chainData,
    };

    // Copy client-side partials to the output directory
    fs.cpSync(path.join(templateDir, 'client_partials'), path.join(outputSiteDir, 'client_partials'), { recursive: true });


    ////////////////////
    // Chapter 3.2: Render one-off pages from YAML
    ///////////////////////

    let pageyamlFile = fs.readFileSync(`src/data/${site}.pages.yaml`);
    let pageyaml = yaml.load(pageyamlFile);

    let contextFromPageSpecificFiles = {};
    Object.keys(pageyaml).forEach(page => {
        let pageInfo = pageyaml[page];

        // See if there is a directory in data/page_specifc for this page.
        const pageSpecificDataPath = `src/data/page_specific/${page}`;
        if (fs.existsSync(pageSpecificDataPath)) {
            // Add an entry to the context for this page.
            contextFromPageSpecificFiles[page] = {};

            // Iterate through files in this directory.
            const pageSpecificFiles = fs.readdirSync(pageSpecificDataPath);

            pageSpecificFiles.forEach(file => {
                const fileContents = fs.readFileSync(path.join(pageSpecificDataPath, file), 'utf8');

                // If it's markdown, render it with marked.
                if (file.endsWith('.md')) {
                    contextFromPageSpecificFiles[page][file.replace(/\.md$/, '')] = marked(fileContents);
                }
                // If it's yaml, load it as yaml.
                if (file.endsWith('.yaml')) {
                    contextFromPageSpecificFiles[page][file.replace(/\.yaml$/, '')] = yaml.load(fileContents);
                }
                // TODO: Handle failure case if there are two files with the same name but different extensions.

            });
        }

        let specified_context;

        if (pageInfo['context_from_yaml'] === true) {
            // Load specified context from yaml
            let yaml_for_this_page = fs.readFileSync(`src/data/${page}.yaml`);
            specified_context = { [page]: yaml.load(yaml_for_this_page) };
        } else {
            specified_context = {};
        }

        // TODO: Why is this special?  Can't this be generalized with other data sections for context inclusion?
        if (pageInfo['include_chaindata_as_context'] !== undefined) {
            for (let chainDataSection of pageInfo['include_chaindata_as_context']) {
                specified_context[chainDataSection] = chainData[chainDataSection];
            }
        }

        if (pageInfo['include_data_in_context'] !== undefined) {
            for (let dataSection of pageInfo['include_data_in_context']) {
                let dataSectionToInclude = dataAvailableAsContext[dataSection];
                if (dataSectionToInclude === undefined) {
                    throw new Error(`Data section ${dataSection} requested for page ${page} but not found in dataAvailableAsContext.`);
                }
                specified_context[dataSection] = dataSectionToInclude;
            }
        }

        let context = {
            page_name: page,
            ...pageInfo['context'],
            ...specified_context,
            imageMapping,
            chainData,
        };

        if (contextFromPageSpecificFiles[page]) {
            context = Object.assign({}, context, contextFromPageSpecificFiles[page])
        }
        const template_path = "pages/" + pageInfo["template"];

        const output_path = path.join(pageInfo["template"]).replace(/\.njk$/, '.html');

        renderPage({
            template_path: template_path,
            output_path: output_path,
            context: context,
            layout: pageInfo["base_template"],
            site: site,
        });

    });

    console.timeEnd('pages-yaml-read');

    ///////////////////////////////////////////
    // Chapter 4: Factory pages (individual shows, songs, etc)  and JSON files
    /////////////////////////////////////////////

    // Render things that we'll need later.

    if (site === "cryptograss.live") {
        generateSetStonePages(shows, path.resolve(outputSiteDir, 'setstones'));
    }


    renderSetStoneImages(shows, path.resolve(outputSiteDir, 'assets/images/setstones'));

    //////////////////////
    // Chapter 4.1: Show pages
    ////////////////////

    if (site === "justinholmes.com") { // TODO: This is a hack.  We need to make this more general.

        Object.entries(shows).forEach(([show_id, show]) => {
            const page = `show_${show_id}`;

            let context = {
                page_name: page,
                page_title: show.title,
                show,
                imageMapping,
                chainData,
            };

            renderPage({
                template_path: 'reuse/single-show.njk',
                output_path: `shows/${show_id}.html`,
                context: context,
                site: site,
            }
            );

        });

    }

    ///////////////////////////
    // Chapter 4.2: Song pages
    ///////////////////////////

    if (site === "justinholmes.com") { // TODO: This is a hack.  We need to make this more general.

    Object.entries(songs).forEach(([song_slug, song]) => {
        const page = `song_${song_slug}`;

        let context = {
            page_name: page,
            page_title: song.title,
            song,
            imageMapping,
            chainData,
        };

        // See if we have a MD file with long-form description.
        let commentary;
        const commentary_path = path.resolve(dataDir, `songs_and_tunes/${song_slug}.md`);
        if (fs.existsSync(commentary_path)) {
            const commentary_raw = fs.readFileSync(commentary_path, 'utf8');
            const commentary_njk_rendered = nunjucks.renderString(commentary_raw, context)
            commentary = marked(commentary_njk_rendered);
        }

        context.commentary = commentary;

        renderPage({
            template_path: 'reuse/single-song.njk',
            output_path: `songs/${song_slug}.html`,
            context: context,
            site: site,
        }
        );

    });

    }

    ///////////////////////////
    // Chapter 4.2a: Lists of songs
    ///////////////////////////

    if (site === "justinholmes.com") { // TODO: This is a hack.  We need to make this more general.

    // TODO: Not jazzed to do this here instead of just making this available in the context.

    // Make a new array of songs, sorted by song.plays.length
    let songs_sorted_by_plays = Object.values(songs);
    songs_sorted_by_plays.sort((a, b) => {
        return b.plays.length - a.plays.length;
    });

    let context = {
        page_name: "songs-by-plays",
        page_title: "Songs sorted by plays",
        songs: songs_sorted_by_plays,
        imageMapping,
        chainData,
    };

    renderPage({
        template_path: 'pages/songs/songs-by-plays.njk',
        output_path: `songs/songs-by-plays.html`,
        context: context,
        site: site,
    }
    );

    }


    ///////////////////////////
    // Chapter 4.2: Musician pages
    ///////////////////////////

    if (site === "justinholmes.com") { // TODO: This is a hack.  We need to make this more general.

    Object.entries(pickers).forEach(([picker, picker_data]) => {

        let picker_slug = slugify(picker);

        let shows_played_by_this_picker = []
        let show_list = picker_data['shows'];
        for (let [show_id, instruments] of Object.entries(show_list)) {

            // Sanity check: if we don't know about this show, this will fail later.
            if (!shows[show_id]) {
                throw new Error(`Show ${show_id} not found when trying to populate shows for ${picker}`);
            }

            shows_played_by_this_picker.push({
                show_id,
                show: shows[show_id],
                instruments
            });
        }

        let context = {
            page_name: picker,
            page_title: picker,
            picker,
            shows_played_by_this_picker,
            imageMapping,
            chainData,
        };

        renderPage({
            template_path: 'reuse/single-picker.njk',
            output_path: `pickers/${picker_slug}.html`,
            context: context,
            site: site,
        }
        );

    });

    }

    ///////////////////////////
    // Chapter 5: Cleanup
    ///////////////////////////

    // Warn about each unused image.
    console.log(unusedImages.size, 'images were not used.');
    unusedImages.forEach(image => {
        console.warn(`Image not used: ${image}`);
    });

    console.timeEnd('primary-build');
    return outputSiteDir;
}
