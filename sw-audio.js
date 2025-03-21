let currentTrack = null;
let currentQueue = [];
let autoQueueEnabled = false;

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('message', async (event) => {
    const { type, payload } = event.data;

    switch (type) {
        case 'PLAY_TRACK':
            currentTrack = payload;
            broadcastToAll({
                type: 'PLAY_AUDIO',
                payload
            });
            break;

        case 'TOGGLE_PLAYBACK':
            broadcastToAll({
                type: 'TOGGLE_AUDIO'
            });
            break;

        case 'SET_QUEUE':
            currentQueue = payload;
            broadcastToAll({
                type: 'QUEUE_UPDATED',
                payload: currentQueue
            });
            break;

        case 'TOGGLE_AUTO_QUEUE':
            autoQueueEnabled = payload;
            broadcastToAll({
                type: 'AUTO_QUEUE_STATE',
                payload: autoQueueEnabled
            });
            break;

        case 'TRACK_ENDED':
            if (autoQueueEnabled && currentQueue.length > 0) {
                const nextTrack = currentQueue.shift();
                broadcastToAll({
                    type: 'PLAY_AUDIO',
                    payload: nextTrack
                });
                broadcastToAll({
                    type: 'QUEUE_UPDATED',
                    payload: currentQueue
                });
            }
            break;

        case 'UPDATE_STATE':
            // Forward playback state updates to all clients
            broadcastToAll({
                type: 'PLAYBACK_STATE',
                payload
            });
            break;
    }
});

async function broadcastToAll(message) {
    const clients = await self.clients.matchAll();
    clients.forEach(client => client.postMessage(message));
}
