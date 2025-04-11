import { supabase } from '../supabase.js';

export class AdService {
    // Add default test ad
    static defaultAd = {
        id: 'test-ad',
        title: 'Get DiScover Premier',
        advertiser: 'xM DiScover',
        audio_url: 'https://d2zcpib8duehag.cloudfront.net/ads/test-ad.mp3',
        status: 'active',
        play_count: 0,
        click_count: 0
    };

    static async playAdBreak(minDuration = 15000, maxDuration = 30000) {
        try {
            // Check if ads are being blocked
            const player = window.xmPlayer;
            if (player?.adblockDetected) {
                await this.handleBlockedAds();
                return false;
            }

            // Get active ads
            const { data: ads, error } = await supabase
                .from('ads')
                .select('*')
                .eq('status', 'active')
                // Only get ads that haven't exceeded their budget
                .filter('daily_budget', 'gte', 0)
                .filter('total_budget', 'gte', 0)
                .order('play_count', { ascending: true })
                .limit(5);

            if (error) {
                console.error('Failed to fetch ads:', error);
                return this.handleNoAds(minDuration);
            }

            // Use fallback ad if no ads available
            let activeAds = ads?.length ? ads : [this.defaultAd];
            
            console.log(`Found ${activeAds.length} active ads`);

            // Filter ads by region and budget
            activeAds = activeAds.filter(ad => {
                const validRegion = !ad.regions?.length || this.isValidRegion(ad.regions);
                return validRegion;
            });

            // Create ad container
            const adContainer = document.createElement('div');
            adContainer.className = 'ad-overlay';
            adContainer.innerHTML = `
                <div class="ad-content">
                    <div class="ad-info">
                        <h3>Advertisement</h3>
                        <p class="ad-title"></p>
                        <p class="ad-advertiser"></p>
                    </div>
                    <div class="ad-progress">
                        <div class="ad-progress-bar"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(adContainer);

            let totalDuration = 0;
            let playedCount = 0;
            const startTime = Date.now();

            // Play ads until we hit minimum duration
            for (let i = 0; i < activeAds.length; i++) {
                if (totalDuration >= maxDuration) break;
                
                try {
                    const adStart = Date.now();
                    await this.playAd(activeAds[i], adContainer);
                    const adDuration = Date.now() - adStart;
                    totalDuration += adDuration;
                    playedCount++;

                    if (totalDuration >= minDuration) {
                        if (i < activeAds.length - 1) {
                            const nextAdEstDuration = 15000;
                            if (totalDuration + nextAdEstDuration > maxDuration) break;
                        }
                    }

                    // Update play count and impression
                    if (activeAds[i].id !== 'test-ad') {
                        await supabase.from('ads')
                            .update({ 
                                play_count: (activeAds[i].play_count || 0) + 1,
                                impressions: (activeAds[i].impressions || 0) + 1 
                            })
                            .eq('id', activeAds[i].id);
                    }
                } catch (err) {
                    console.error(`Failed to play ad ${i + 1}:`, err);
                }
            }

            // Clean up
            adContainer.remove();
            const totalTime = (Date.now() - startTime) / 1000;
            console.log(`Ad break complete: ${playedCount} ads in ${totalTime.toFixed(1)}s`);
            return playedCount > 0;

        } catch (error) {
            console.error('Ad break failed:', error);
            return this.handleNoAds(minDuration);
        }
    }

    static isValidRegion(adRegions) {
        // Get user's region from browser or saved preference
        const userRegion = localStorage.getItem('user_region') || 'global';
        return adRegions.includes('global') || adRegions.includes(userRegion);
    }

    static async handleNoAds(minDuration) {
        console.warn('No ads available, using development ad');
        try {
            const adContainer = document.createElement('div');
            adContainer.className = 'ad-overlay';
            adContainer.innerHTML = `
                <div class="ad-content">
                    <div class="ad-info">
                        <h3>Advertisement</h3>
                        <p class="ad-title"></p>
                        <p class="ad-advertiser"></p>
                    </div>
                    <div class="ad-progress">
                        <div class="ad-progress-bar"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(adContainer);
            await this.playAd(this.defaultAd, adContainer);
            await new Promise(resolve => setTimeout(resolve, minDuration));
            adContainer.remove();
            return true;
        } catch (err) {
            console.error('Failed to play fallback ad:', err);
            return false;
        }
    }

    static async handleBlockedAds() {
        // Show persistent warning about blocked ads
        const warning = document.createElement('div');
        warning.className = 'ad-block-warning';
        warning.innerHTML = `
            <div class="warning-content">
                <h3>Ad Blocker Detected</h3>
                <p>We rely on advertising to keep our service free. Please disable your ad blocker to continue.</p>
            </div>
        `;
        document.body.appendChild(warning);

        // Wait for a few seconds before removing
        await new Promise(resolve => setTimeout(resolve, 5000));
        warning.remove();
        return false;
    }

    static async playAd(ad, container) {
        return new Promise(async (resolve) => {
            // Get fresh signed URL for ad audio
            let audioUrl = ad.audio_url;
            if (audioUrl.includes('supabase.co/storage/v1/object/sign/ads')) {
                const pathMatch = audioUrl.match(/\/ads\/(.+?)\?/);
                if (pathMatch) {
                    const { data } = await supabase.storage
                        .from('ads')
                        .createSignedUrl(pathMatch[1], 300); // 5 min expiry
                    if (data?.signedUrl) {
                        audioUrl = data.signedUrl;
                    }
                }
            }

            const audio = new Audio(audioUrl);
            
            // Prevent seeking
            audio.addEventListener('seeking', () => {
                audio.currentTime = audio.duration * (audio.currentTime / audio.duration);
            });
            
            // Block keyboard shortcuts
            const keyHandler = (e) => {
                if (e.code === 'Space') {
                    e.preventDefault();
                    audio.paused ? audio.play() : audio.pause();
                } else if (['ArrowLeft', 'ArrowRight', 'MediaTrackNext', 'MediaTrackPrevious'].includes(e.code)) {
                    e.preventDefault();
                }
            };
            
            document.addEventListener('keydown', keyHandler);

            // Update UI
            const titleEl = container.querySelector('.ad-title');
            const advertiserEl = container.querySelector('.ad-advertiser');
            const progressBar = container.querySelector('.ad-progress-bar');
            
            titleEl.innerHTML = ad.click_url ? 
                `<a href="${ad.click_url}" target="_blank">${ad.title}</a>` :
                ad.title;
            advertiserEl.textContent = `By ${ad.advertiser}`;

            // Track ad progress
            audio.addEventListener('timeupdate', () => {
                const progress = (audio.currentTime / audio.duration) * 100;
                progressBar.style.width = `${progress}%`;
            });

            // Handle click tracking
            if (ad.click_url) {
                titleEl.querySelector('a').addEventListener('click', async () => {
                    await supabase
                        .from('ads')
                        .update({ click_count: ad.click_count + 1 })
                        .eq('id', ad.id);
                });
            }

            // Handle completion
            audio.addEventListener('ended', () => {
                document.removeEventListener('keydown', keyHandler);
                audio.remove();
                resolve();
            });

            // Start playback
            audio.play();

            // Update impression count
            if (ad.id !== 'test-ad') {
                await supabase
                    .from('ads')
                    .update({ 
                        impressions: (ad.impressions || 0) + 1
                    })
                    .eq('id', ad.id);
            }
        });
    }
}
