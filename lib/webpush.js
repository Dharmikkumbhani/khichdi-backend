const webpush = require('web-push');

let isConfigured = false;

function configureWebPush() {
    if (isConfigured) {
        return true;
    }

    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
        console.warn('Web push disabled: VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is missing.');
        return false;
    }

    try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        isConfigured = true;
        return true;
    } catch (error) {
        console.error('Web push disabled: invalid VAPID configuration.', error.message);
        return false;
    }
}

module.exports = {
    webpush,
    configureWebPush,
};
