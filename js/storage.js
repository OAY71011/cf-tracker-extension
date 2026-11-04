class StorageManager {
    async get(key, defaultValue = null) {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                resolve(result[key] !== undefined ? result[key] : defaultValue);
            });
        });
    }

    async set(key, value) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, resolve);
        });
    }

    async getCredentials() {
        const apiKey = await this.get('cf_apiKey', '');
        const apiSecret = await this.get('cf_apiSecret', '');
        return { apiKey, apiSecret };
    }

    async saveCredentials(apiKey, apiSecret) {
        await this.set('cf_apiKey', apiKey);
        await this.set('cf_apiSecret', apiSecret);
    }
}