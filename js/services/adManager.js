import { AdService } from './ads.js';
import { supabase } from '../supabase.js';

export class AdManager {
    constructor() {
        this.lastAdTime = Date.now();
        this.skippedTracks = 0;
        this.adBreakInProgress = false;
        this.AD_INTERVAL = 30 * 60 * 1000; // 30 minutes
        this.SKIP_THRESHOLD = 5; // Number of skips before triggering ads
        this.skipTimer = null;
        this.failedAttempts = 0;
        this.MAX_FAILURES = 3;
        this.MIN_AD_BREAK = 15 * 1000; // 15 seconds
        this.MAX_AD_BREAK = 30 * 1000; // 30 seconds
        this.GRACE_PERIOD = 30 * 60 * 1000; // 30 minutes uninterrupted 
        this.lastAdBreakEnd = 0;
        this.DEBUG = true; // Enable debug logging
        this.userId = null;
        this.initSession();
    }

    async initSession() {
        const { data: { session } } = await supabase.auth.getSession();
        this.userId = session?.user?.id;
        if (this.userId) {
            await this.syncAdState();
        }
    }

    async syncAdState() {
        try {
            // Get or create user's ad tracking record
            const { data, error } = await supabase
                .from('ad_tracking')
                .select('*')
                .eq('user_id', this.userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') { // Record not found
                    await this.createAdTracking();
                } else {
                    throw error;
                }
            } else if (data) {
                this.lastAdTime = new Date(data.last_ad_time).getTime();
                this.lastAdBreakEnd = new Date(data.grace_period_end).getTime();
                this.failedAttempts = data.ad_attempts;
            }
        } catch (err) {
            console.error('[AdManager] Failed to sync state:', err);
        }
    }

    async createAdTracking() {
        const now = new Date().toISOString();
        await supabase
            .from('ad_tracking')
            .insert([{
                user_id: this.userId,
                last_ad_time: now,
                grace_period_end: now,
                ad_attempts: 0,
                updated_at: now
            }]);
    }

    async updateAdState(success = true) {
        if (!this.userId) return;

        const now = new Date().toISOString();
        await supabase
            .from('ad_tracking')
            .update({
                last_ad_time: now,
                grace_period_end: success ? 
                    new Date(Date.now() + this.GRACE_PERIOD).toISOString() : now,
                ad_attempts: success ? 0 : this.failedAttempts,
                updated_at: now
            })
            .eq('user_id', this.userId);
    }

    log(message) {
        if (this.DEBUG) {
            console.log(`[AdManager] ${message}`);
        }
    }

    getTimeLeft() {
        const timeSinceLastBreak = Date.now() - this.lastAdBreakEnd;
        const timeLeft = Math.max(0, this.GRACE_PERIOD - timeSinceLastBreak);
        return Math.round(timeLeft / 1000); // Return seconds
    }

    async checkForAds(reason = 'interval') {
        if (this.adBreakInProgress) {
            this.log('Ad break already in progress, skipping check');
            return false;
        }

        if (this.failedAttempts >= this.MAX_FAILURES) {
            this.log(`Too many failed attempts (${this.failedAttempts}/${this.MAX_FAILURES}), skipping ads`);
            return false;
        }

        const timeLeft = this.getTimeLeft();
        this.log(`Time left in grace period: ${timeLeft}s`);

        if (timeLeft > 0 && reason !== 'force') {
            this.log(`Still in grace period (${timeLeft}s remaining)`);
            return false;
        }

        let shouldPlayAds = false;
        const now = Date.now();
        const timeSinceLastAd = now - this.lastAdTime;

        switch (reason) {
            case 'interval':
                shouldPlayAds = timeSinceLastAd >= this.AD_INTERVAL;
                this.log(`Interval check: ${shouldPlayAds ? 'Due' : 'Not due'} for ads (${Math.round(timeSinceLastAd/1000)}s elapsed)`);
                break;
            case 'skip':
                this.skippedTracks++;
                clearTimeout(this.skipTimer);
                this.skipTimer = setTimeout(() => this.skippedTracks = 0, 60000);
                shouldPlayAds = this.skippedTracks >= this.SKIP_THRESHOLD;
                this.log(`Skip check: ${this.skippedTracks}/${this.SKIP_THRESHOLD} skips`);
                break;
            case 'force':
                shouldPlayAds = true;
                this.log('Force playing ads');
                break;
        }

        if (shouldPlayAds) {
            this.log('Starting ad break');
            this.adBreakInProgress = true;

            try {
                const adBreakSuccess = await AdService.playAdBreak(this.MIN_AD_BREAK, this.MAX_AD_BREAK);
                
                if (adBreakSuccess) {
                    this.failedAttempts = 0;
                    this.lastAdBreakEnd = Date.now();
                    this.lastAdTime = Date.now();
                    await this.updateAdState(true);
                    const duration = Math.round((Date.now() - now) / 1000);
                    this.log(`Ad break completed successfully (${duration}s). Starting grace period.`);
                } else {
                    this.failedAttempts++;
                    await this.updateAdState(false);
                    this.log(`Ad break failed. Attempts: ${this.failedAttempts}/${this.MAX_FAILURES}`);
                }

                this.adBreakInProgress = false;
                this.skippedTracks = 0;
                return adBreakSuccess;

            } catch (error) {
                this.log(`Ad break error: ${error.message}`);
                this.failedAttempts++;
                await this.updateAdState(false);
                this.adBreakInProgress = false;
                return false;
            }
        }

        return false;
    }

    shouldPlayAdsBeforeTrack() {
        const timeLeft = this.getTimeLeft();
        if (timeLeft > 0) {
            this.log(`Playback allowed - ${timeLeft}s remaining in grace period`);
            return false;
        }
        
        const timeSinceLastAd = Date.now() - this.lastAdTime;
        const shouldPlay = timeSinceLastAd >= this.AD_INTERVAL;
        const timeUntilNextAd = Math.max(0, this.AD_INTERVAL - timeSinceLastAd);
        
        // Log the check result
        if (shouldPlay) {
            this.log(`Pre-playback check: Ads needed (${Math.round(timeSinceLastAd/1000)}s elapsed)`);
        } else {
            this.log(`Pre-playback check: No ads needed (${Math.round(timeUntilNextAd/1000)}s until next ad)`);
        }
        
        return shouldPlay;
    }

    reset() {
        this.lastAdTime = Date.now();
        this.skippedTracks = 0;
        clearTimeout(this.skipTimer);
        this.failedAttempts = 0;
        this.log('Ad manager reset');
    }
}
