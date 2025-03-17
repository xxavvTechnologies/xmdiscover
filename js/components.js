import { supabase, getPagePath } from './supabase.js';
import { searchSong, getLyrics } from './services/genius.js';

// Helper function to normalize paths
function normalizePath(path) {
    // Remove leading slash and .html extension if present
    return path.replace(/^\//, '').replace(/\.html$/, '');
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Load components
        await Promise.all([
            loadComponent('header'),
            loadComponent('player'),
            loadComponent('footer')
        ]);

        // Initialize player functionality
        initializePlayer();

        // Helper function to add delay between operations
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

        await delay(100); // Add small delay between operations

        // Set active nav link with delay
        await delay(100);
        const currentPath = normalizePath(window.location.pathname);
        const currentPage = currentPath || 'index';
        
        // Update nav link selection logic
        document.querySelectorAll('nav a').forEach(link => {
            const linkPath = normalizePath(link.getAttribute('href'));
            if (linkPath === currentPage) {
                link.classList.add('active');
            }
        });

        // Set page title and subtitle
        const pageTitles = {
            'index': ['Welcome to xM DiScover', 'Your personal journey through millions of tracks'],
            'discover': ['Discover New Music', 'Explore new artists and genres'],
            'library': ['Your Library', 'Access your favorite music']
        };

        const [pageTitle, pageSubtitle] = pageTitles[currentPage] || ['', ''];
        document.title = pageTitle ? `${pageTitle} - xM DiScover` : 'xM DiScover';

        const titleElement = document.getElementById('page-title');
        const subtitleElement = document.getElementById('page-subtitle');
        
        if (titleElement && subtitleElement) {
            titleElement.textContent = pageTitle;
            subtitleElement.textContent = pageSubtitle;
        }

        // Add auth state handling
        const handleAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            
            // Get auth elements
            const loggedOutElements = document.querySelectorAll('[data-auth="logged-out"]');
            const loggedInElements = document.querySelectorAll('[data-auth="logged-in"]');
            
            if (session) {
                // Show logged in elements, hide logged out elements
                loggedOutElements.forEach(el => el.style.display = 'none');
                loggedInElements.forEach(el => el.style.display = 'flex');

                // Get user profile
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();

                if (profile) {
                    // Update profile elements
                    const avatarImg = document.querySelector('.profile-avatar');
                    const nameSpan = document.querySelector('.profile-name');
                    
                    if (avatarImg) {
                        avatarImg.src = profile.avatar_url || 'https://juywatmqwykgdjfqexho.supabase.co/storage/v1/object/public/images/system/default%20user.png';
                        avatarImg.onerror = () => {
                            avatarImg.src = 'https://juywatmqwykgdjfqexho.supabase.co/storage/v1/object/public/images/system/default%20user.png';
                        };
                        avatarImg.alt = profile.display_name || 'Profile';
                    }
                    if (nameSpan) {
                        nameSpan.textContent = profile.display_name || profile.username;
                    }

                    // Add admin link if admin
                    if (profile.role === 'admin') {
                        const dropdown = document.querySelector('.profile-dropdown');
                        if (dropdown) {
                            dropdown.insertAdjacentHTML('afterbegin', '<a href="../admin/index.html">Admin Dashboard</a>');
                        }
                    }
                }

                // Setup logout handler
                document.querySelector('.logout-btn')?.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await supabase.auth.signOut();
                    window.location.reload();
                });

            } else {
                // Show logged out elements, hide logged in elements
                loggedOutElements.forEach(el => el.style.display = 'flex');
                loggedInElements.forEach(el => el.style.display = 'none');
            }
        };

        // Initial auth check
        await handleAuth();

        // Listen for auth changes
        supabase.auth.onAuthStateChange(() => handleAuth());

        // Add profile menu toggle
        document.querySelector('.profile-trigger')?.addEventListener('click', (e) => {
            e.currentTarget.parentElement.classList.toggle('active');
        });

        // Close profile menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.profile-menu')) {
                document.querySelector('.profile-menu')?.classList.remove('active');
            }
        });

    } catch (error) {
        console.error('Error loading components:', error);
    }
});

async function loadComponent(name) {
    const response = await fetch(`../components/${name}.html`);
    const html = await response.text();
    const position = name === 'footer' ? 'beforeend' : 'afterbegin';
    document.body.insertAdjacentHTML(position, html);
}

function initializePlayer() {
    const player = {
        audioElement: new Audio(),
        currentTrack: null,
        loading: false,
        progressBar: document.querySelector('.progress-bar'),
        progressCurrent: document.querySelector('.progress-current'),
        timeDisplay: document.querySelector('.time-current'),
        timeTotalDisplay: document.querySelector('.time-total'),
        isDraggingProgress: false,
        volumeBar: document.querySelector('.volume-bar'),
        volumeCurrent: document.querySelector('.volume-current'),
        volumeButton: document.querySelector('.volume'),
        isDraggingVolume: false,
        lastVolume: 1,

        async loadLyrics(trackInfo) {
            const lyricsPanel = document.querySelector('.lyrics-panel .lyrics-content');
            lyricsPanel.innerHTML = '<p>Loading lyrics...</p>';
            
            try {
                const geniusUrl = await searchSong(trackInfo.title, trackInfo.artist);
                if (!geniusUrl) {
                    throw new Error('No lyrics found');
                }
                
                const lyrics = await getLyrics(geniusUrl);
                if (!lyrics) {
                    throw new Error('Could not extract lyrics');
                }
                
                lyricsPanel.innerHTML = `
                    <div class="lyrics-text">
                        ${lyrics.split('\n').map(line => `<p>${line || '&nbsp;'}</p>`).join('')}
                    </div>
                    <div class="lyrics-source">
                        Lyrics provided by <a href="${geniusUrl}" target="_blank">Genius</a>
                    </div>
                `;
            } catch (error) {
                console.error('Failed to load lyrics:', error);
                lyricsPanel.innerHTML = '<p>No lyrics available</p>';
            }
        },

        async playTrack(trackInfo, autoplay = true) {
            try {
                if (this.loading) return;
                this.loading = true;

                if (!trackInfo.audioUrl) {
                    throw new Error('No audio URL provided');
                }

                // Handle podcasts differently - they don't need signed URLs
                const audioUrl = trackInfo.type === 'podcast' 
                    ? trackInfo.audioUrl
                    : await this.getSignedUrl(trackInfo.audioUrl);

                if (!audioUrl) {
                    throw new Error('Could not access audio file');
                }

                // Store track info and update state
                this.currentTrack = trackInfo;
                localStorage.setItem('playerState', JSON.stringify({
                    track: trackInfo,
                    currentTime: 0,
                    isPlaying: autoplay
                }));

                // Update UI before loading audio
                this.updatePlayerUI(trackInfo);

                // Load audio
                this.audioElement.src = audioUrl;
                await this.audioElement.load();

                if (autoplay) {
                    try {
                        await this.audioElement.play();
                        const playIcon = document.querySelector('.play-pause i');
                        playIcon?.classList.remove('fa-play');
                        playIcon?.classList.add('fa-pause');
                    } catch (playError) {
                        console.warn('Playback interrupted:', playError);
                    }
                }

                // For non-podcasts, load lyrics
                if (trackInfo.type !== 'podcast') {
                    this.loadLyrics(trackInfo);
                }

                this.audioElement.addEventListener('loadedmetadata', () => {
                    this.timeTotalDisplay.textContent = this.formatTime(this.audioElement.duration);
                });

            } catch (error) {
                console.error('Playback failed:', error);
                alert('Sorry, this content is not available for playback');
                this.clearPlayer();
            } finally {
                this.loading = false;
            }
        },

        async getSignedUrl(audioPath) {
            // Extract storage path from full URL
            const path = audioPath.split('/').slice(-2).join('/');
            
            const { data, error } = await supabase
                .storage
                .from('audio')
                .createSignedUrl(path, 3600);

            if (error) throw error;
            return data?.signedUrl;
        },

        updatePlayerUI(trackInfo) {
            const coverEl = document.querySelector('.current-cover');
            const titleEl = document.querySelector('.current-title');
            const artistEl = document.querySelector('.current-artist');
            const typeEl = document.querySelector('.content-type');
            
            coverEl.style.backgroundImage = `url('${trackInfo.coverUrl || ''}')`;
            titleEl.textContent = trackInfo.title;

            if (trackInfo.type === 'podcast') {
                artistEl.textContent = trackInfo.artist;
                typeEl.textContent = 'Podcast Episode';
                document.querySelector('.lyrics')?.classList.add('hidden');
            } else {
                artistEl.innerHTML = `
                    <a href="${getPagePath('/pages/artist')}?id=${trackInfo.artistId}">${trackInfo.artist}</a>
                `;
                typeEl.textContent = '';
                document.querySelector('.lyrics')?.classList.remove('hidden');
            }

            const playIcon = document.querySelector('.play-pause i');
            playIcon?.classList.remove('fa-play');
            playIcon?.classList.add('fa-pause');
        },

        clearPlayer() {
            localStorage.removeItem('currentTrack');
            this.audioElement.src = '';
            this.currentTrack = null;
            
            const coverEl = document.querySelector('.current-cover');
            const titleEl = document.querySelector('.current-info h4');
            const artistEl = document.querySelector('.current-info p');
            
            coverEl.style.backgroundImage = '';
            titleEl.textContent = 'Select a track';
            artistEl.textContent = '-';

            const playIcon = document.querySelector('.play-pause i');
            playIcon?.classList.remove('fa-pause');
            playIcon?.classList.add('fa-play');
        },

        async togglePlayPause() {
            if (!this.currentTrack || !this.audioElement.src) {
                return;
            }

            const playIcon = document.querySelector('.play-pause i');
            
            try {
                if (this.audioElement.paused) {
                    await this.audioElement.play();
                    playIcon?.classList.replace('fa-play', 'fa-pause');
                } else {
                    this.audioElement.pause();
                    playIcon?.classList.replace('fa-pause', 'fa-play');
                }

                // Update stored state
                if (this.currentTrack) {
                    localStorage.setItem('playerState', JSON.stringify({
                        track: this.currentTrack,
                        currentTime: this.audioElement.currentTime,
                        isPlaying: !this.audioElement.paused
                    }));
                }
            } catch (error) {
                console.error('Playback toggle failed:', error);
            }
        },

        // Save playback position before unloading
        setupUnloadHandler() {
            window.addEventListener('beforeunload', () => {
                if (this.currentTrack) {
                    localStorage.setItem('currentTrack', JSON.stringify({
                        ...this.currentTrack,
                        currentTime: this.audioElement.currentTime
                    }));
                }
            });
        },

        // Restore previous playback state
        async restorePlaybackState() {
            const savedTrack = localStorage.getItem('currentTrack');
            if (savedTrack) {
                const trackInfo = JSON.parse(savedTrack);
                await this.playTrack(trackInfo);
                this.audioElement.currentTime = trackInfo.currentTime;
            }
        },

        savePlayerState() {
            if (this.currentTrack) {
                localStorage.setItem('playerState', JSON.stringify({
                    track: this.currentTrack,
                    currentTime: this.audioElement.currentTime,
                    isPlaying: !this.audioElement.paused
                }));
            }
        },

        async restorePlayerState() {
            const savedState = localStorage.getItem('playerState');
            if (savedState) {
                const state = JSON.parse(savedState);
                await this.playTrack(state.track, false); // Keep autoplay false
                this.audioElement.currentTime = state.currentTime;
                
                // Don't automatically play, just update UI
                const playIcon = document.querySelector('.play-pause i');
                playIcon?.classList.remove('fa-pause');
                playIcon?.classList.add('fa-play');
                
                // Add click handler to start playback
                const playBtn = document.querySelector('.play-pause');
                const clickHandler = async () => {
                    await this.audioElement.play();
                    playIcon?.classList.replace('fa-play', 'fa-pause');
                    playBtn.removeEventListener('click', clickHandler);
                };
                playBtn.addEventListener('click', clickHandler);
            }
        },

        updateProgress() {
            if (!this.isDraggingProgress && this.audioElement.duration) {
                const percent = (this.audioElement.currentTime / this.audioElement.duration) * 100;
                this.progressCurrent.style.width = `${percent}%`;
                this.timeDisplay.textContent = this.formatTime(this.audioElement.currentTime);
            }
        },

        formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        },

        setupProgressBar() {
            // Set up progress bar interactions
            this.progressBar.addEventListener('mousedown', (e) => {
                this.isDraggingProgress = true;
                this.updateProgressFromEvent(e);
            });

            document.addEventListener('mousemove', (e) => {
                if (this.isDraggingProgress) {
                    this.updateProgressFromEvent(e);
                }
            });

            document.addEventListener('mouseup', () => {
                if (this.isDraggingProgress) {
                    this.isDraggingProgress = false;
                }
            });

            // Handle direct clicks
            this.progressBar.addEventListener('click', (e) => {
                this.updateProgressFromEvent(e);
            });
        },

        updateProgressFromEvent(e) {
            const rect = this.progressBar.getBoundingClientRect();
            const percent = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
            
            if (this.audioElement.duration) {
                this.audioElement.currentTime = this.audioElement.duration * percent;
                this.progressCurrent.style.width = `${percent * 100}%`;
            }
        },

        setupVolumeControl() {
            this.volumeBar.addEventListener('mousedown', (e) => {
                this.isDraggingVolume = true;
                this.updateVolumeFromEvent(e);
            });

            document.addEventListener('mousemove', (e) => {
                if (this.isDraggingVolume) {
                    this.updateVolumeFromEvent(e);
                }
            });

            document.addEventListener('mouseup', () => {
                this.isDraggingVolume = false;
            });

            this.volumeBar.addEventListener('click', (e) => {
                this.updateVolumeFromEvent(e);
            });

            this.volumeButton.addEventListener('click', () => {
                if (this.audioElement.volume > 0) {
                    this.lastVolume = this.audioElement.volume;
                    this.updateVolume(0);
                    this.volumeButton.querySelector('i').className = 'ri-volume-mute-line';
                } else {
                    this.updateVolume(this.lastVolume);
                    this.updateVolumeIcon(this.lastVolume);
                }
            });
        },

        updateVolumeFromEvent(e) {
            const rect = this.volumeBar.getBoundingClientRect();
            const volume = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
            this.updateVolume(volume);
        },

        updateVolume(volume) {
            this.audioElement.volume = volume;
            this.volumeCurrent.style.width = `${volume * 100}%`;
            this.updateVolumeIcon(volume);
        },

        updateVolumeIcon(volume) {
            const icon = this.volumeButton.querySelector('i');
            if (volume === 0) {
                icon.className = 'ri-volume-mute-line';
            } else if (volume < 0.5) {
                icon.className = 'ri-volume-down-line';
            } else {
                icon.className = 'ri-volume-up-line';
            }
        }
    };

    // Setup event listeners
    player.setupUnloadHandler();
    
    // Restore previous playback state
    player.restorePlayerState();

    // Save state before unloading
    window.addEventListener('beforeunload', () => {
        player.savePlayerState();
    });

    // Update currentTime periodically
    player.audioElement.addEventListener('timeupdate', () => {
        player.savePlayerState();
        player.updateProgress();
    });

    // Listen for play track events
    document.addEventListener('xm-play-track', (e) => {
        player.playTrack(e.detail);
    });

    // Play/Pause button
    document.querySelector('.play-pause')?.addEventListener('click', () => {
        player.togglePlayPause();
    });

    // Toggle sidebar
    document.querySelectorAll('[data-panel]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const panelName = e.currentTarget.dataset.panel;
            const sidebar = document.querySelector('.player-sidebar');
            const panels = document.querySelectorAll('.panel');
            
            panels.forEach(panel => {
                panel.classList.toggle('active', 
                    panel.classList.contains(`${panelName}-panel`)
                );
            });
            
            sidebar.classList.add('active');
        });
    });

    // Close sidebar
    document.querySelector('.close-sidebar')?.addEventListener('click', () => {
        document.querySelector('.player-sidebar').classList.remove('active');
    });

    // Handle play/pause
    document.querySelector('.play-pause')?.addEventListener('click', (e) => {
        const icon = e.currentTarget.querySelector('i');
        icon.classList.toggle('fa-play');
        icon.classList.toggle('fa-pause');
    });

    // Update currentTime in localStorage periodically
    player.audioElement.addEventListener('timeupdate', () => {
        if (player.currentTrack) {
            localStorage.setItem('currentTrack', JSON.stringify({
                ...player.currentTrack,
                currentTime: player.audioElement.currentTime
            }));
        }
    });

    // Add error handling for audio element
    player.audioElement.addEventListener('error', (e) => {
        console.error('Audio error:', e.target.error);
        player.clearPlayer();
    });

    // Set up progress tracking
    player.setupProgressBar();

    // Set up volume control
    player.setupVolumeControl();
}
