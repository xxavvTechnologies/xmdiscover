const ANIMATION_DURATION = 300; // ms
const DISPLAY_DURATION = 5000; // ms

export class NotificationService {
    static instance = null;
    
    constructor() {
        if (NotificationService.instance) {
            return NotificationService.instance;
        }
        
        this.container = null;
        this.queue = [];
        this.isProcessing = false;
        NotificationService.instance = this;
    }

    async init() {
        // Wait for notifications container to be available
        while (!document.getElementById('notifications')) {
            if (document.readyState === 'complete') {
                // Create container if it doesn't exist after page load
                const container = document.createElement('div');
                container.id = 'notifications';
                container.className = 'notifications-container';
                document.body.appendChild(container);
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        this.container = document.getElementById('notifications');
        this.processQueue();
    }

    show(message, type = 'info') {
        this.queue.push({ message, type });
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    update(message, type = 'info') {
        // Find existing notification with same type and update it
        const existingNotification = this.container?.querySelector(`.notification-${type}`);
        if (existingNotification) {
            const messageEl = existingNotification.querySelector('p');
            if (messageEl) {
                messageEl.textContent = message;
                return;
            }
        }
        // If no existing notification found, show new one
        this.show(message, type);
    }

    async processQueue() {
        if (!this.container || this.isProcessing || this.queue.length === 0) return;
        
        this.isProcessing = true;
        const { message, type } = this.queue.shift();

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="notification-icon"></i>
            <p>${message}</p>
            <button class="notification-close">×</button>
        `;

        // Add appropriate icon class based on type
        const icon = notification.querySelector('.notification-icon');
        switch (type) {
            case 'success':
                icon.className += ' ri-checkbox-circle-fill';
                break;
            case 'error':
                icon.className += ' ri-error-warning-fill';
                break;
            case 'warning':
                icon.className += ' ri-alert-fill';
                break;
            default:
                icon.className += ' ri-information-fill';
        }

        // Add close button handler
        notification.querySelector('.notification-close').addEventListener('click', () => {
            this.dismiss(notification);
        });

        // Add to container
        this.container.appendChild(notification);
        
        // Trigger animation
        await new Promise(resolve => setTimeout(resolve, 10));
        notification.classList.add('show');

        // Auto dismiss after delay
        setTimeout(() => {
            this.dismiss(notification);
        }, DISPLAY_DURATION);

        this.isProcessing = false;
        if (this.queue.length > 0) {
            setTimeout(() => this.processQueue(), ANIMATION_DURATION);
        }
    }

    dismiss(notification) {
        if (!notification) return;
        
        notification.classList.remove('show');
        setTimeout(() => {
            notification?.remove();
        }, ANIMATION_DURATION);
    }
}

// Export singleton instance
export const notifications = new NotificationService();
