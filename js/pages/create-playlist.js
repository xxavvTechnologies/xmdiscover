import { supabase } from '../supabase.js';
import { uploadImage } from '../storage.js';

class CreatePlaylistPage {
    constructor() {
        this.form = document.getElementById('playlist-form');
        this.setupForm();
    }

    async setupForm() {
        // Auth check
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            window.location.href = '/auth/login.html';
            return;
        }

        // Handle form submission
        this.form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = this.form.querySelector('.submit-btn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating...';

            try {
                const formData = new FormData(this.form);
                const coverFile = this.form.querySelector('#playlist-cover').files[0];

                let coverUrl = null;
                if (coverFile) {
                    coverUrl = await uploadImage(coverFile, 'playlists');
                }

                const { data: playlist, error } = await supabase
                    .from('playlists')
                    .insert([{
                        name: formData.get('playlist-name'),
                        description: formData.get('playlist-description'),
                        cover_url: coverUrl,
                        creator_id: session.user.id,
                        is_public: formData.get('playlist-public') === 'on',
                        status: 'published'
                    }])
                    .select()
                    .single();

                if (error) throw error;

                window.location.href = `/pages/playlist.html?id=${playlist.id}`;
            } catch (error) {
                console.error('Failed to create playlist:', error);
                alert('Failed to create playlist: ' + error.message);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Playlist';
            }
        });

        // Handle cover image preview
        const coverInput = this.form.querySelector('#playlist-cover');
        const previewDiv = this.form.querySelector('.cover-preview');

        coverInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewDiv.style.backgroundImage = `url('${e.target.result}')`;
                    previewDiv.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CreatePlaylistPage();
});
