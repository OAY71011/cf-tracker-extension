class CFAPI {
    constructor(storage) {
        this.storage = storage;
        this.baseUrl = 'https://codeforces.com/api';
        this.lastRequestTime = 0;
    }

    // Generates CF compliant API Signature
    async generateSignature(method, params, apiKey, apiSecret) {
        const rand = Math.random().toString(36).substring(2, 8);
        const time = Math.floor(Date.now() / 1000);
        params.apiKey = apiKey;
        params.time = time;

        const sortedKeys = Object.keys(params).sort();
        const paramString = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
        const text = `${rand}/${method}?${paramString}#${apiSecret}`;

        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-512', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return `${rand}${hashHex}`;
    }

    // Respect 1 req/sec rate limit
    async waitRateLimit() {
        const now = Date.now();
        const timeSinceLast = now - this.lastRequestTime;
        if (timeSinceLast < 1000) {
            await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLast));
        }
        this.lastRequestTime = Date.now();
    }

    async fetch(method, params = {}) {
        await this.waitRateLimit();
        const creds = await this.storage.getCredentials();

        let urlParams = new URLSearchParams(params);

        if (creds.apiKey && creds.apiSecret) {
            const sig = await this.generateSignature(method, params, creds.apiKey, creds.apiSecret);
            urlParams = new URLSearchParams(params); // Re-init because params object was mutated with time & key
            urlParams.append('apiSig', sig);
        }

        const response = await window.fetch(`${this.baseUrl}/${method}?${urlParams.toString()}`);
        const data = await response.json();

        if (data.status !== 'OK') {
            throw new Error(data.comment || `API Error on ${method}`);
        }
        return data.result;
    }

    async getContestStandings(contestId) {
        // showUnofficial=true fetches everyone including managers/out-of-comp, crucial for catching all students
        return this.fetch('contest.standings', { contestId, showUnofficial: true });
    }
}