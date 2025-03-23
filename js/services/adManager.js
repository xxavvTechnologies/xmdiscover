import { AdService } from './ads.js';

export class AdManager {
    constructor() {
        this.lastAdTime = Date.now();
        this.skippedTracks = 0;
        this.adBreakInProgress = false;
        this.AD_INTERVAL = 30 * 60 * 1000; // 30 minutes
        this.SKIP_THRESHOLD = 5; // Number of skips before triggering ads
        this.skipTimer = null;
    }

    async checkForAds(reason = 'interval') {
        if (this.adBreakInProgress) return false;

        const now = Date.now();
        const timeSinceLastAd = now - this.lastAdTime;

        let shouldPlayAds = false;

        switch (reason) {
            case 'interval':
                shouldPlayAds = timeSinceLastAd >= this.AD_INTERVAL;
                break;
            case 'skip':
                this.skippedTracks++;
                clearTimeout(this.skipTimer);
                this.skipTimer = setTimeout(() => this.skippedTracks = 0, 60000); // Reset after 1 minute
                shouldPlayAds = this.skippedTracks >= this.SKIP_THRESHOLD;
                break;
            case 'force':
                shouldPlayAds = true;
                break;
        }

        if (shouldPlayAds) {
            this.adBreakInProgress = true;
            await AdService.playAdBreak();
            this.lastAdTime = Date.now();
            this.skippedTracks = 0;
            this.adBreakInProgress = false;
            return true;
        }

        return false;
    }

    reset() {
        this.lastAdTime = Date.now();
        this.skippedTracks = 0;
        clearTimeout(this.skipTimer);
    }
}
