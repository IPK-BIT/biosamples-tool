import { writable } from 'svelte/store';

const key = 'biosamples-tool-settings-dev';

let storeFromLocalStorage = JSON.parse(localStorage.getItem(key));

if (!storeFromLocalStorage) {
    // init store if it was not saved to localstorage previously
    storeFromLocalStorage = {
        idType: 'biosamples',
        idsRawInputHistory: []
    }
}

export const settings = writable(storeFromLocalStorage);

settings.subscribe(value => {
    localStorage.setItem(key, JSON.stringify(value));
});