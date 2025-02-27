import { supabase } from './supabase-config.js';

class AdminPanel {
    constructor() {
        this.checkAdminAccess();
        this.initializeForms();
    }

    async checkAdminAccess() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.location.href = 'login.html';
                return;
            }

            console.log('Checking access for user:', user.id);

            const { data: profile, error } = await supabase
                .from('profiles')
                .select('id, role')
                .eq('id', user.id)
                .single();

            console.log('Profile data:', profile);
            console.log('Profile error:', error);

            if (error || !profile) {
                console.error('Error fetching profile:', error);
                document.getElementById('admin-unauthorized').style.display = 'block';
                document.getElementById('admin-panel').style.display = 'none';
                return;
            }

            if (profile.user_role !== 'admin') {
                console.log('User role is not admin:', profile.user_role);
                document.getElementById('admin-unauthorized').style.display = 'block';
                document.getElementById('admin-panel').style.display = 'none';
                return;
            }

            console.log('Admin access granted');
            document.getElementById('admin-unauthorized').style.display = 'none';
            document.getElementById('admin-panel').style.display = 'block';
            this.loadArtists();
            this.loadAlbums();
        } catch (error) {
            console.error('Admin check error:', error);
            document.getElementById('admin-unauthorized').style.display = 'block';
            document.getElementById('admin-panel').style.display = 'none';
        }
    }

    async initializeForms() {
        document.getElementById('artist-form').addEventListener('submit', (e) => this.handleArtistSubmit(e));
        document.getElementById('album-form').addEventListener('submit', (e) => this.handleAlbumSubmit(e));
        document.getElementById('song-form').addEventListener('submit', (e) => this.handleSongSubmit(e));
    }

    async handleArtistSubmit(e) {
        e.preventDefault();
        const name = document.getElementById('artist-name').value;
        const bio = document.getElementById('artist-bio').value;
        const imageFile = document.getElementById('artist-image').files[0];

        try {
            // Upload artist image
            const imagePath = `artist-images/${Date.now()}-${imageFile.name}`;
            await supabase.storage.from('artist-images').upload(imagePath, imageFile);
            const imageUrl = supabase.storage.from('artist-images').getPublicUrl(imagePath).data.publicUrl;

            // Create artist
            const { data, error } = await supabase
                .from('artists')
                .insert([{
                    name,
                    bio,
                    image_url: imageUrl,
                    created_at: new Date()
                }]);

            if (error) throw error;
            alert('Artist added successfully!');
            e.target.reset();
            this.loadArtists();
        } catch (error) {
            alert('Error adding artist: ' + error.message);
        }
    }

    async handleAlbumSubmit(e) {
        e.preventDefault();
        const title = document.getElementById('album-title').value;
        const artistId = document.getElementById('album-artist').value;
        const releaseDate = document.getElementById('album-date').value;
        const coverFile = document.getElementById('album-cover').files[0];

        try {
            // Upload album cover
            const coverPath = `album-covers/${Date.now()}-${coverFile.name}`;
            await supabase.storage.from('album-covers').upload(coverPath, coverFile);
            const coverUrl = supabase.storage.from('album-covers').getPublicUrl(coverPath).data.publicUrl;

            // Create album
            const { data, error } = await supabase
                .from('albums')
                .insert([{
                    title,
                    artist_id: artistId,
                    release_date: releaseDate,
                    cover_art_url: coverUrl,
                    created_at: new Date()
                }]);

            if (error) throw error;
            alert('Album added successfully!');
            e.target.reset();
            this.loadAlbums();
        } catch (error) {
            alert('Error adding album: ' + error.message);
        }
    }

    async handleSongSubmit(e) {
        e.preventDefault();
        const title = document.getElementById('song-title').value;
        const albumId = document.getElementById('song-album').value;
        const trackNumber = document.getElementById('song-track').value;
        const duration = document.getElementById('song-duration').value;
        const songFile = document.getElementById('song-file').files[0];

        try {
            // Upload song file
            const songPath = `songs/${Date.now()}-${songFile.name}`;
            await supabase.storage.from('songs').upload(songPath, songFile);
            const songUrl = supabase.storage.from('songs').getPublicUrl(songPath).data.publicUrl;

            // Get album's artist_id
            const { data: album } = await supabase
                .from('albums')
                .select('artist_id')
                .eq('id', albumId)
                .single();

            // Create song
            const { data, error } = await supabase
                .from('songs')
                .insert([{
                    title,
                    album_id: albumId,
                    artist_id: album.artist_id,
                    duration,
                    track_number: trackNumber,
                    stream_url: songUrl,
                    created_at: new Date()
                }]);

            if (error) throw error;
            alert('Song added successfully!');
            e.target.reset();
        } catch (error) {
            alert('Error adding song: ' + error.message);
        }
    }

    async loadArtists() {
        const { data: artists } = await supabase
            .from('artists')
            .select('id, name');

        const artistSelect = document.getElementById('album-artist');
        artistSelect.innerHTML = '<option value="">Select Artist</option>' +
            artists.map(artist => 
                `<option value="${artist.id}">${artist.name}</option>`
            ).join('');
    }

    async loadAlbums() {
        const { data: albums } = await supabase
            .from('albums')
            .select('id, title');

        const albumSelect = document.getElementById('song-album');
        albumSelect.innerHTML = '<option value="">Select Album</option>' +
            albums.map(album => 
                `<option value="${album.id}">${album.title}</option>`
            ).join('');
    }
}

new AdminPanel();
