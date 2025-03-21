import { supabase, getPagePath } from '../supabase.js';
import { updateMetaTags } from '../seo.js';

class ArtistPage {
    constructor() {
        this.artistId = new URLSearchParams(window.location.search).get('id');
        if (!this.artistId) {
            window.location.href = '/discover.html';
            return;
        }
        this.loadArtist();
    }

    async loadArtist() {
        try {
            const { data: artist } = await supabase
                .from('artists')
                .select('*')
                .eq('id', this.artistId)
                .single();

            if (!artist) throw new Error('Artist not found');

            await updateMetaTags('artist', artist);
            this.updateUI(artist);
            await Promise.all([
                this.loadReleases(),
                this.loadTracks()
            ]);
        } catch (error) {
            console.error('Failed to load artist:', error);
            alert('Artist not found');
            window.location.href = '/discover.html';
        }
    }

    updateUI(artist) {
        // Update existing elements
        document.title = `${artist.name} - xM DiScover`;
        document.querySelector('.artist-name').textContent = artist.name;
        document.querySelector('.artist-genres').textContent = artist.genres?.join(', ');
        document.querySelector('.bio-text').textContent = artist.bio || 'No biography available';
        document.querySelector('.artist-image').style.backgroundImage = `url('${artist.image_url}')`;

        // Add meta tags for SEO
        const metaTags = {
            'description': artist.bio?.substring(0, 160) || `Listen to ${artist.name} on xM DiScover. Browse their albums, tracks, and more.`,
            'og:title': `${artist.name} - xM DiScover`,
            'og:description': artist.bio?.substring(0, 160) || `Listen to ${artist.name} on xM DiScover`,
            'og:image': artist.image_url,
            'og:url': `https://xmdiscover.netlify.app/pages/artist?id=${this.artistId}`,
            'twitter:title': `${artist.name} - xM DiScover`,
            'twitter:description': artist.bio?.substring(0, 160) || `Listen to ${artist.name} on xM DiScover`,
            'twitter:image': artist.image_url,
            'twitter:card': 'summary_large_image'
        };

        // Update or create meta tags
        Object.entries(metaTags).forEach(([name, content]) => {
            let meta = document.querySelector(`meta[property="${name}"]`) || 
                      document.querySelector(`meta[name="${name}"]`);
            
            if (!meta) {
                meta = document.createElement('meta');
                meta.setAttribute(name.startsWith('og:') || name.startsWith('twitter:') ? 'property' : 'name', name);
                document.head.appendChild(meta);
            }
            meta.setAttribute('content', content);
        });
    }

    async loadReleases() {
        const { data: releases } = await supabase
            .from('albums')
            .select('*')
            .eq('artist_id', this.artistId)
            .order('release_date', { ascending: false });

        const container = document.querySelector('.release-grid');
        if (container && releases) {
            container.innerHTML = releases.map(release => `
                <div class="release-card" onclick="window.location.href='${getPagePath('/pages/release')}?id=${release.id}'">
                    <div class="release-img" style="background-image: url('${release.cover_url}')"></div>
                    <h3>${release.title}</h3>
                    <p>${new Date(release.release_date).getFullYear()}</p>
                </div>
            `).join('');
        }
    }

    async loadTracks() {
        const { data: tracks } = await supabase
            .from('songs')
            .select(`
                id,
                title,
                duration,
                audio_url,
                cover_url,
                track_number,
                artists!inner (
                    id,
                    name
                )
            `)
            .eq('artist_id', this.artistId)
            .order('track_number', { ascending: true })
            .limit(10);

        if (!tracks?.length) return;

        // Get signed URLs for all tracks
        const processedTracks = await Promise.all(tracks.map(async (track) => {
            if (track.audio_url?.includes('supabase.co/storage')) {
                const urlParts = track.audio_url.split('/storage/v1/object/');
                if (urlParts.length === 2) {
                    const pathPart = urlParts[1].replace(/^(public|sign)\//, '');
                    const cleanPath = pathPart.split('?')[0];
                    
                    const { data } = await supabase.storage
                        .from(cleanPath.split('/')[0])
                        .createSignedUrl(
                            cleanPath.split('/').slice(1).join('/'),
                            3600
                        );
                    
                    if (data?.signedUrl) {
                        track.audio_url = data.signedUrl;
                    }
                }
            }
            return track;
        }));

        const container = document.querySelector('.track-list');
        if (container) {
            container.innerHTML = processedTracks.map((track, index) => `
                <div class="track-item" data-track-id="${track.id}">
                    <span class="track-number">${index + 1}</span>
                    <img src="${track.cover_url}" alt="${track.title}" width="40" height="40">
                    <div class="track-info">
                        <h4>${track.title}</h4>
                        <p>${track.artists.name}</p>
                    </div>
                    <span class="track-duration">${track.duration}</span>
                </div>
            `).join('');

            // Add click handlers for tracks
            container.querySelectorAll('.track-item').forEach((item, index) => {
                item.addEventListener('click', () => {
                    const track = processedTracks[index];
                    if (!track) return;
                    
                    const playEvent = new CustomEvent('xm-play-track', {
                        detail: {
                            id: track.id,
                            title: track.title,
                            artist: track.artists.name,
                            audioUrl: track.audio_url,
                            coverUrl: track.cover_url,
                            artistId: track.artists.id
                        }
                    });
                    document.dispatchEvent(playEvent);
                });
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ArtistPage();
});
