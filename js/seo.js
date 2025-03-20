export async function updateMetaTags(type, data) {
    const metaTags = {
        title: '',
        description: '',
        image: '',
        url: window.location.href
    };

    switch(type) {
        case 'artist':
            metaTags.title = `${data.name} - xM DiScover`;
            metaTags.description = data.bio?.substring(0, 160) || 
                `Listen to ${data.name}'s music on xM DiScover. Browse albums, songs, and more.`;
            metaTags.image = data.image_url;
            // Add schema.org markup
            addSchemaMarkup({
                "@context": "https://schema.org",
                "@type": "MusicGroup",
                "name": data.name,
                "image": data.image_url,
                "description": data.bio
            });
            break;

        case 'release':
            metaTags.title = `${data.title} by ${data.artists.name} - xM DiScover`;
            metaTags.description = `Stream ${data.title} by ${data.artists.name} on xM DiScover.`;
            metaTags.image = data.cover_url;
            // Add schema.org markup
            addSchemaMarkup({
                "@context": "https://schema.org",
                "@type": "MusicAlbum",
                "name": data.title,
                "byArtist": {
                    "@type": "MusicGroup",
                    "name": data.artists.name
                },
                "image": data.cover_url
            });
            break;

        case 'playlist':
            metaTags.title = `${data.name} - xM DiScover Playlist`;
            metaTags.description = data.description || 
                `Listen to ${data.name} playlist on xM DiScover.`;
            metaTags.image = data.cover_url;
            break;
    }

    // Update meta tags
    document.title = metaTags.title;
    updateMetaTag('description', metaTags.description);
    updateMetaTag('og:title', metaTags.title);
    updateMetaTag('og:description', metaTags.description);
    updateMetaTag('og:image', metaTags.image);
    updateMetaTag('og:url', metaTags.url);
    updateMetaTag('twitter:card', 'summary_large_image');
    updateMetaTag('twitter:title', metaTags.title);
    updateMetaTag('twitter:description', metaTags.description);
    updateMetaTag('twitter:image', metaTags.image);
}

function updateMetaTag(name, content) {
    let meta = document.querySelector(`meta[property="${name}"]`) || 
               document.querySelector(`meta[name="${name}"]`);
    
    if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(name.startsWith('og:') ? 'property' : 'name', name);
        document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
}

function addSchemaMarkup(schema) {
    let script = document.querySelector('#schema-markup');
    if (!script) {
        script = document.createElement('script');
        script.id = 'schema-markup';
        script.type = 'application/ld+json';
        document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(schema);
}
