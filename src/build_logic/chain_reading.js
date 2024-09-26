// @ts-check
import {createConfig, http, readContract, fetchBlockNumber, fetchEnsName, getBlock} from '@wagmi/core';
import {mainnet, optimism, optimismSepolia, arbitrum} from '@wagmi/core/chains';
import {brABI as abi} from "../abi/blueRailroadABI.js";
import {setStoneABI} from "../abi/setStoneABI.js";
import {setStoneContractAddress, blueRailroadContractAddress} from "../js/constants.js";
import {getVowelsoundContributions} from "./revealer_utils.js";
import Web3 from 'web3';

const web3 = new Web3();
import {config as dotenvConfig} from 'dotenv';
import {fileURLToPath} from "url";
import path from "path";
import fs from "fs";
import {showsDir} from "./constants.js";

const env = process.env.NODE_ENV || 'development';
dotenvConfig({path: `.env`});

// Use the environment-specific variables
const apiKey = process.env.INFURA_API_KEY;

export const config = createConfig({
    chains: [mainnet, optimism, optimismSepolia, arbitrum],
    transports: {
        [mainnet.id]: http(`https://mainnet.infura.io/v3/${apiKey}`),
        [optimism.id]: http(`https://optimism-mainnet.infura.io/v3/${apiKey}`),
        [optimismSepolia.id]: http(`https://optimism-sepolia.infura.io/v3/${apiKey}`),
        [arbitrum.id]: http(`https://arbitrum-mainnet.infura.io/v3/${apiKey}`),
    },
    ssr: true,
})


export async function fetchChainDataForShows(shows) {
    console.time("chain-data-for-shows");
    // We expect shows to be the result of iterating through the show YAML files.
    // Now we'll add onchain data from those shows.

    let showsChainData = {};

    // Iterate through show IDs and parse the data.
    for (let [show_id, show] of Object.entries(shows)) {
        // Split ID by "-" into artist_id and blockheight
        const [artist_id, _blockheight] = show_id.split('-');
        const blockheight = parseInt(_blockheight);

        let singleShowChainData = {"sets": []};
        showsChainData[show_id] = singleShowChainData;

        // Read the contract using the getShowData function
        const showData = await readContract(config, {
            abi: setStoneABI,
            address: setStoneContractAddress,
            functionName: 'getShowData',
            chainId: arbitrum.id,
            args: [artist_id, blockheight],
        });

        // If number of sets and stone price are both zero, and there are no rabbits, we'll take that to mean the show doesn't exist onchain.
        if (showData[1] === 0 && showData[2] === 0n && showData[3].length === 0) {
            singleShowChainData['has_set_stones_available'] = false;
            continue;
        } else {
            singleShowChainData['has_set_stones_available'] = true;
        }

        // (bytes32 showBytes1, uint16 stonesPossible1, uint8 numberOfSets1, uint256 stonePrice1, bytes32[] memory rabbitHashes1)
        // This is the return type of the solidity getShowData function
        // unpack the showData
        const unpackedShowData = {
            showBytes: showData[0],  // This is actually just artist_id and blockheight again
            numberOfSets: showData[1],
            stonePrice: showData[2],
            rabbitHashes: showData[3],
            setShapeBySetId: showData[4],
        };

        singleShowChainData["rabbit_hashes"] = unpackedShowData.rabbitHashes;
        singleShowChainData["stone_price"] = unpackedShowData.stonePrice;


        // integrity check: the number of sets on chain is the same as the number of sets in the yaml, raise an error if not
        if (unpackedShowData.numberOfSets !== Object.keys(show.sets).length) {
            // throw new Error(`Number of sets on chain (${unpackedShowData.numberOfSets}) does not match the number of sets in the yaml (${show.sets.length}) for show ID ${show_id}`);
            console.log(`Error: Number of sets on chain (${unpackedShowData.numberOfSets}) does not match the number of sets in the yaml (${Object.keys(show.sets).length}) for show ID ${show_id}`);
        }

        // unpack setShapeBySetId
        for (let i = 0; i < Object.keys(show["sets"]).length; i++) {
            singleShowChainData["sets"].push({"shape": unpackedShowData.setShapeBySetId[i]});
        }

    }
    console.timeEnd("chain-data-for-shows");

    return showsChainData;
}

export async function appendSetStoneDataToShows(showsChainData) {
    console.time("set-stone-chaindata");
    // should be called after the shows data has been appended to the shows object

    let number_of_stones_in_sets = 0;

    for (let [show_id, show] of Object.entries(showsChainData)) {
        // Split ID by "-" into artist_id and blockheight
        const [artist_id, blockheight] = show_id.split('-');

        for (let [set_order, set] of Object.entries(show.sets)) {
            set.setstones = [];

            const setStoneIds = await readContract(config, {
                abi: setStoneABI,
                address: setStoneContractAddress,
                functionName: 'getStonesBySetId',
                chainId: arbitrum.id,
                args: [artist_id, blockheight, set_order],
            });


            for (let setStoneId of setStoneIds) {
                let setstone = {}
                number_of_stones_in_sets++;

                // call getStoneColor, getCrystalizationMsg, getPaidAmountWei to get the stone metadata
                setstone["tokenId"] = setStoneId;

                const stoneColor = await readContract(config, {
                    abi: setStoneABI,
                    address: setStoneContractAddress,
                    functionName: 'getStoneColor',
                    chainId: arbitrum.id,
                    args: [setStoneId],
                });

                setstone["color"] = [stoneColor.color1, stoneColor.color2, stoneColor.color3];

                const crystalizationMsg = await readContract(config, {
                    abi: setStoneABI,
                    address: setStoneContractAddress,
                    functionName: 'getCrystalizationMsg',
                    chainId: arbitrum.id,
                    args: [setStoneId],
                });

                setstone["crystalizationMsg"] = crystalizationMsg;

                const favoriteSong = await readContract(config, {
                    abi: setStoneABI,
                    address: setStoneContractAddress,
                    functionName: 'getFavoriteSong',
                    chainId: arbitrum.id,
                    args: [setStoneId],
                });
                setstone["favoriteSong"] = favoriteSong;


                const paidAmountWei = await readContract(config, {
                    abi: setStoneABI,
                    address: setStoneContractAddress,
                    functionName: 'getPaidAmountWei',
                    chainId: arbitrum.id,
                    args: [setStoneId],
                });

                setstone["paidAmountWei"] = paidAmountWei;
                setstone["paidAmountEth"] = web3.utils.fromWei(paidAmountWei, 'ether');

                let ownerOfThisToken = await readContract(config, {
                    abi: setStoneABI,
                    address: setStoneContractAddress,
                    functionName: 'ownerOf',
                    chainId: arbitrum.id,
                    args: [setStoneId],
                });

                let ensName = await fetchEnsName(config, {address: ownerOfThisToken, chainId: 1});
                if (ensName == undefined) {
                    ensName = ownerOfThisToken;
                }

                setstone["owner"] = ensName;

                let tokenURI = await readContract(config, {
                    abi: setStoneABI,
                    address: setStoneContractAddress,
                    functionName: 'tokenURI',
                    chainId: arbitrum.id,
                    args: [setStoneId],
                });

                setstone["tokenURI"] = tokenURI;

                set.setstones.push(setstone);
            }
        }

    }

    const setStoneCountOnChain = await readContract(config,
        {
            abi: setStoneABI,
            address: setStoneContractAddress,
            functionName: 'totalSupply',
            chainId: arbitrum.id,
        })


    if (number_of_stones_in_sets != setStoneCountOnChain) {
        console.log("Error: Number of stones in sets on chain does not match the number of stones in the sets object");
        console.log("Number of stones in sets on chain: ", setStoneCountOnChain);
        console.log("Number of stones in sets object: ", number_of_stones_in_sets);
    }

    console.timeEnd("set-stone-chaindata");
    return showsChainData;
}


///////////////////////////
/// VowelSounds artifact
///////////////////////////
// const vowelSoundContributions = await getVowelsoundContributions();


///////////BACK TO TONY

async function getBlueRailroads() {
    console.time("blue-railroads");
    const blueRailroadCount = await readContract(config,
        {
            abi,
            address: blueRailroadContractAddress,
            functionName: 'totalSupply',
            chainId: optimism.id,
        })

    let blueRailroads = {};

    for (let i = 0; i < blueRailroadCount; i++) {
        let tokenId = await readContract(config, {
            abi,
            address: blueRailroadContractAddress,
            functionName: 'tokenByIndex',
            chainId: optimism.id,
            args: [i],
        });

        let ownerOfThisToken = await readContract(config, {
            abi,
            address: blueRailroadContractAddress,
            functionName: 'ownerOf',
            chainId: optimism.id,
            args: [tokenId],
        });

        let uriOfVideo = await readContract(config, {
            abi,
            address: blueRailroadContractAddress,
            functionName: 'tokenURI',
            chainId: optimism.id,
            args: [tokenId],
        });

        blueRailroads[tokenId] = {
            owner: ownerOfThisToken,
            uri: uriOfVideo,
            id: tokenId
        };

    }
    console.timeEnd("blue-railroads");
    return blueRailroads;
}

export function appendChainDataToShows(shows, chainData) {
    const showsChainData = chainData["showsWithChainData"];
    for (let [show_id, show] of Object.entries(shows)) {
        let chainDataForShow = showsChainData[show_id];
        // TODO: Handle the show not being in the chain data at all - emit a warning that it's time to refresh chain data?  And an error in prod?
        if (chainDataForShow === undefined) {

        } else if (chainDataForShow['has_set_stones_available'] === false) {

        } else {

            show["has_set_stones_available"] = true;
            show["rabbit_hashes"] = chainDataForShow["rabbit_hashes"]
            show["stone_price"] = chainDataForShow["stone_price"]

            // integrity check: the number of sets on chain is the same as the number of sets in the yaml, raise an error if not
            if (chainDataForShow.sets.length !== Object.keys(show.sets).length) {
                throw new Error(`Number of sets on chain (${chainDataForShow.numberOfSets}) does not match the number of sets in the yaml (${show.sets.length}) for show ID ${show_id}`);
            }

            // unpack setShapeBySetId
            for (let i = 0; i < Object.keys(show["sets"]).length; i++) {
                let set = show['sets'][i]
                set["shape"] = chainDataForShow['sets'][i]['shape'];
                const set_stones_for_this_Set = chainDataForShow['sets'][i]['setstones'];

                // TODO: Iterate through songs and note that this set stone is present.
                // TODO: Note if the song is favorited.
                set['setstones'] = set_stones_for_this_Set;
            }
        }
    }
}

export async function fetch_chaindata(shows) {

    console.time("block-numbers");
    const mainnetBlockNumber = await fetchBlockNumber(config, {chainId: mainnet.id});
    const optimismBlockNumber = await fetchBlockNumber(config, {chainId: optimism.id});
    const optimismSepoliaBlockNumber = await fetchBlockNumber(config, {chainId: optimismSepolia.id});
    console.timeEnd("block-numbers");

    const blueRailroads = await getBlueRailroads();
    let showsWithChainData = await fetchChainDataForShows(shows);
    let showsWithSetStoneData = await appendSetStoneDataToShows(showsWithChainData);
    const vowelSoundContributions = await getVowelsoundContributions();


    const chainData = {
        blueRailroads: blueRailroads,
        mainnetBlockNumber: mainnetBlockNumber,
        optimismBlockNumber: optimismBlockNumber,
        optimismSepoliaBlockNumber: optimismSepoliaBlockNumber,
        showsWithChainData: showsWithSetStoneData,
        vowelSoundContributions: vowelSoundContributions,
    }
    return chainData;
}

export async function get_times_for_shows() {
    const liveShowYAMLs = fs.readdirSync(showsDir);

    let times_for_shows = {};
    for (let i = 0; i < liveShowYAMLs.length; i++) {
        let showYAML = liveShowYAMLs[i];
        let showID = showYAML.split('.')[0];
        const block_number = showID.split('-')[1];
        const block = await getBlock(config,
            {chainId: mainnet.id, blockNumber: block_number});
        times_for_shows[showID] = block.timestamp;
    }
    return times_for_shows;
}