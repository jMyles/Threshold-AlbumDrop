import fs from 'fs';
import ora from 'ora';
import { getProjectDirs, initProjectDirs } from './locations.js';
import { fetch_chaindata, get_times_for_shows } from './chain_reading.js';
import { getShowAndSetData } from './show_and_set_data.js';
import { serializeChainData } from './chaindata_db.js';
import { fileURLToPath } from 'url';
import path from 'path';
import { stringify } from "./utils.js";


async function updateChainData() {
    const { dataDir, chainDataDir, showsDir } = getProjectDirs();

    const time_data_json_path = path.resolve(dataDir, 'time_data.json');
    const times_for_shows = await get_times_for_shows();
    const times_for_shows_json = stringify(times_for_shows);

    fs.writeFileSync(time_data_json_path, times_for_shows_json);

    console.log("Wrote time data to " + time_data_json_path);


    let spinner_text;
    try {
        // Ensure chain data directory exists
        if (!fs.existsSync(chainDataDir)) {
            fs.mkdirSync(chainDataDir, { recursive: true });
            spinner_text = `Creating chain data directory at ${chainDataDir}...`
        } else {
            spinner_text = `Updating chain data at ${chainDataDir}...`
        }
        const spinner = ora(spinner_text).start();

        // Get show data
        const { shows } = getShowAndSetData();

        // Fetch chain data
        spinner.text = 'Fetching chain data...';
        const fetchedChainData = await fetch_chaindata(shows);

        // Serialize to disk
        spinner.text = 'Saving chain data...';
        serializeChainData(fetchedChainData);

        spinner.succeed('Chain data updated successfully');
        return fetchedChainData;
    } catch (error) {
        spinner.fail('Chain data update failed');
        console.error(error);
        process.exit(1);
    }
}

// If this file is run directly (not imported)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    initProjectDirs("cryptograss.live"); // TODO: Make this dynamic or... something.  Why do we presume it's cryptograss?
    updateChainData();
}

export { updateChainData }; 