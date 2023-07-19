<script>
    import DataFrame from 'dataframe-js';
    import { prettyPrintJson } from 'pretty-print-json';
    import LoadingAnimation from './lib/LoadingAnimation.svelte';
    import { settings } from './stores/main';


    const apiBaseUrl = 'https://www.ebi.ac.uk/biosamples/samples/';

    let idTypes = {
        biosamples: { type: 'biosamples', label: 'Biosamples-IDs'},
        acc: { type: 'acc', label: 'Accession Numbers'},
        lims: { type: 'lims', label: 'IPK-LIMS-IDs'},
    };

    let idsRawInput;
    let arrSampleIds = [];
    let data = [];
    let resultsRaw = {};
    let result = [];
    let dfInput = [];
    let df;
    let tableRows = [];
    let idsUnresolveable = [];
    let showLoadingAnimation = false;
    let itemsAlreadyLoaded = 0;
    let itemsToLoad = 0;
    let showHistoryModal = false;
    let showRawResultModal = false;

    let rawResultModal = {
        sampleId: '',
        rawResult: '',
    }


    function reset() {
        arrSampleIds = [];
        data = [];
        resultsRaw = {};
        result = [];
        dfInput = [];
        tableRows = [];
        idsUnresolveable = [];
        itemsAlreadyLoaded = 0;
        itemsToLoad = 0;
    }

    function fillExampleIDs() {
        let examples = {
            'biosamples': 'SAMEA104431476, SAMEA104431475, SAMEA104431474, SAMEA104431473, SAMEA104431472, SAMEA104431471',
            'acc': 'BCC 833 BRG, BCC 834 BRG, BCC 835 BRG, HOR 10350 BRG',
            'lims': 'IPK_LIMS:1432560, IPK_LIMS:1432561, IPK_LIMS:1432562',
        }
        idsRawInput = examples[$settings.idType];
    }

    function parseRawInput() {
        reset();

        $settings.idsRawInputHistory = [idsRawInput, ...$settings.idsRawInputHistory];
        
        let maxHistoricInputs = 20;
        if ($settings.idsRawInputHistory.length > maxHistoricInputs) {
            $settings.idsRawInputHistory = $settings.idsRawInputHistory.slice(0, maxHistoricInputs);
        }

        arrSampleIds = idsRawInput.split(/[\n,;]+/);
        arrSampleIds = arrSampleIds.map(str => str.trim()).filter(str => str.length > 0);

        showLoadingAnimation = true;

        createRequests();
    }

    function getValue(item, key) {
        let value = item?.characteristics?.[key]?.[0]?.['text'];
        if (!value) {
            value = item?.characteristics?.[key.toLowerCase()]?.[0]?.['text'];
        }
        if (!value) {
            value = 'n/a';
        }
        return value;
    }

    function mapResultToTab() {
        result.forEach(item => {
            if (item) {
                let items = [item];

                if (item._embedded) {
                    items = item._embedded.samples;
                }

                items.forEach(item => {

                    resultsRaw[item.accession] = item;

                    dfInput = [...dfInput, {
                        accession: item.accession,
                        name: item.name,
                        lims_id: getValue(item, 'sample id'),
                        annuality: getValue(item, 'annuality'),
                        biological_material_DOI: getValue(item, 'biological material DOI'),
                        biological_material_ID: getValue(item, 'biological material ID'),
                        material_source_DOI: getValue(item, 'material source DOI'),
                        material_source_ID: getValue(item, 'material source ID'),
                    }];

                });
            }
        });

        df = new DataFrame(dfInput);
        tableRows = df.toCollection();
        showLoadingAnimation = false;
    }

    function createFetchPromiseForSampleId(sampleId) {

        let apiUrlSuffixes = {
            'biosamples':    sampleId,
            'acc':          '?filter=name:' + encodeURI(sampleId),
            'lims':         '?filter=attr:sample%20id:' + encodeURI(sampleId)
        }

        let apiUrl = apiBaseUrl + apiUrlSuffixes[$settings.idType];

        return Promise.all([sampleId, fetch(apiUrl)]);
    }

    async function fulfillRequests(promises) {

        itemsToLoad = promises.length;

        await Promise.all(promises)
        .then(allResponses => Promise.all(allResponses.map(r => {
            if (r[1].ok) {
                return Promise.all([r[0], r[1].json()]);
            } else {
                return Promise.all([r[0], false]);
            }
        })))
        .then(_result => {
            result = _result.map(r => {
                if (r[1] && (r[1].accession || r[1]._embedded)) {
                    return r[1];
                } else {
                    idsUnresolveable = [...idsUnresolveable, r[0]]
                    return false;
                }
            });
        });
    }

    async function createRequests() {
        let promises = arrSampleIds.map(sampleId => createFetchPromiseForSampleId(sampleId)
        .then( (res) => { 
            itemsAlreadyLoaded = itemsAlreadyLoaded + 1;
            return res;
        } ) );

        await fulfillRequests(promises);
        mapResultToTab();
    }

    function saveResultAsCsv() {
        const strCSV = df.toCSV(true);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([strCSV], {
            type: 'text/csv'
        }));
        a.setAttribute('download', 'samples.csv');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function showHistory() {
        showHistoryModal = true;
    }

    function loadHistorySampleIds(i) {
        idsRawInput = $settings.idsRawInputHistory[i];
        showHistoryModal = false;
    }

    function showRawResults(sampleId) {
        rawResultModal = {
            sampleId: resultsRaw[sampleId].accession,
            //rawResult: JSON.stringify(resultsRaw[sampleId], null, 2),
            rawResult: prettyPrintJson.toHtml(resultsRaw[sampleId])
        }
        showRawResultModal = true;
    }

</script>

<main>

    <h1 style="margin-bottom:0; padding-bottom: 0;">IPK BioSamples Query Tool</h1>
    <p style="margin:0; padding:0;font-size:75%;color:rgb(100,100,100);">
        A tool for convenient querying of the BioSamples database.<br />
        Developed by Patrick König;
        Source code: <a href="https://github.com/IPK-BIT/biosamples-tool" target="_blank">Github</a>
    </p>

    <div style="margin-top: 30px; border: 1px solid black; display: inline-block; padding: 10px; background: rgb(240,240,240);">
        <strong>Input mode:</strong>
        {#each Object.entries(idTypes) as [typeId, type]}
        <label class="type" for="{type.type}"><input type="radio" bind:group={$settings.idType} name="{type.type}" id="{type.type}" value={type.type}> {type.label}</label>
        {/each}
    </div>

    <p style="margin-top: 40px;">
        Enter <span class="type">{idTypes[$settings.idType].label}</span> delimitted by comma <span class="delimiter">,</span> 
        or semicolon <span class="delimiter">;</span>
        or newline <span class="delimiter">\n</span>
        <br> in the text field below and click the Query button.
    </p>

    <textarea bind:value={idsRawInput} style="width: 500px; height: 100px;"></textarea><br />
    <a href="#" on:click={fillExampleIDs} style="font-size:75%;">Example IDs</a> | <a href="#" on:click={showHistory} style="font-size:75%;">History</a>
    <br /><br />

    <button on:click|preventDefault={() => parseRawInput()}>Query</button>

    {#if showLoadingAnimation}
        <div style="margin-top: 20px;">
            <LoadingAnimation />
        </div>
        
        <p>{itemsAlreadyLoaded} of {itemsToLoad} loaded!</p>
    {/if}
    
    <br /><br />

    {#if idsUnresolveable.length > 0}
    <div style="border: 0px solid black; font-size:12px; padding:0; text-align: left; margin-bottom: 20px;">
        <strong style="color: red;">The following input IDs could not be resolved. (Please keep in mind that non-public accessions are not queryable via the BioSamples API.)</strong><br />
        <textarea style="width: 99%; height: 100px; margin-top: 5px;">{idsUnresolveable.join('\n') }</textarea>
    </div>
    {/if}

    {#if tableRows.length > 0}
    <div style="text-align: left;">

        <div style="margin-bottom: 10px;">
            <button on:click|preventDefault={() => saveResultAsCsv()}>Download result as CSV</button>
        </div>

        <div style="height: 400px; overflow-y: scroll;padding:3px;">
            <table class="fixed_header">
                <thead>
                <tr>
                    <th>Accession</th>
                    <th>Name</th>
                    <th>LIMS-ID</th>
                    <th>Annuality</th>
                    <th>Biol. Material DOI</th>
                    <th>Biol. Material ID</th>
                    <th>Material Source DOI</th>
                    <th>Material Source ID</th>
                    <th>RAW Result</th>
                </tr>
                </thead>
                <tbody>
                {#each tableRows as row}
                <tr>
                    <td>{row.accession}</td>
                    <td>{row.name}</td>
                    <td>{row.lims_id}</td>
                    <td>{row.annuality}</td>
                    <td><a href="https://doi.org/{row.biological_material_DOI}" target="_blank">{row.biological_material_DOI}</a></td>
                    <td>{row.biological_material_ID}</td>
                    <td><a href="https://doi.org/{row.material_source_DOI}" target="_blank">{row.material_source_DOI}</a></td>
                    <td>{row.material_source_ID}</td>
                    <td><a href="#" on:click={() => showRawResults(row.accession)}>show</a></td>
                </tr>
                {/each}
                </tbody>
            </table>
        </div>
    </div>
    {/if}

    {#if showHistoryModal}
    <div class="modal-window">
        <div>
            <a href="#" title="Close" class="modal-close" on:click={() => {showHistoryModal = false}}>Close</a>
            <h2>Your history of Sample-ID inputs</h2>
            
            <div style="height: 500px; overflow-y: scroll;">
            {#each $settings.idsRawInputHistory as historicInput, i}
            <p style="border: 1px solid rgb(50,50,50);padding: 5px; font-size:75%; overflow-wrap: break-word;">
                <a href="#" on:click={() => loadHistorySampleIds(i)}>Load Sample-IDs again</a><br />
                {historicInput}
            </p>
            {/each}
            </div>
    
        </div>
    </div>
    <div class="modal-background"></div>
    {/if}


    {#if showRawResultModal}
    <div class="modal-window">
        <div>
            <a href="#" title="Close" class="modal-close" on:click={() => {showRawResultModal = false}}>Close</a>
            <h2>BioSamples API RAW Result for: {rawResultModal['sampleId']}</h2>
            
            <div style="text-align: left;  max-height: 60vh; overflow: scroll; border: 1px solid rgb(50,50,50); padding: 0px 5px 5px 5px; background: white;">
                <pre class="json-container" style="font-size: 75%;">{@html rawResultModal['rawResult']}</pre>
            </div>
    
        </div>
    </div>
    <div class="modal-background"></div>
    {/if}


</main>


<style>

</style>
