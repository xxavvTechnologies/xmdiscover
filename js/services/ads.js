import { supabase } from '../supabase.js';

export class AdService {
    static async playAdBreak() {
        try {
            // Get 3-5 random active ads
            const { data: ads, error } = await supabase
                .from('ads')
                .select('*')
                .eq('status', 'active')
                .order('play_count', { ascending: true })
                .limit(5);

            if (error) throw error;
            if (!ads?.length) {
                console.warn('No ads available');
                return true;
            }

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

            // Play ads sequentially
            let adCount = Math.min(4, ads.length); // Play 4 ads max
            for (let i = 0; i < adCount; i++) {
                await this.playAd(ads[i], adContainer);

                // Update play count after each ad
                await supabase
                    .from('ads')
                    .update({ play_count: ads[i].play_count + 1 })
                    .eq('id', ads[i].id);
            }

            // Clean up
            adContainer.remove();
            return true;

        } catch (error) {
            console.error('Ad break failed:', error);
            return false;
        }
    }

    static async playAd(ad, container) {
        return new Promise((resolve) => {
            const audio = new Audio(ad.audio_url);
            
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
        });
    }
}
