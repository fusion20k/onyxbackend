const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.FROM_EMAIL || 'noreply@onyx-project.com';

async function sendInviteEmail(to, token, inviteUrl) {
    try {
        if (!process.env.RESEND_API_KEY) {
            console.warn('RESEND_API_KEY not configured. Skipping email send.');
            return { success: false, message: 'Email service not configured' };
        }

        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: to,
            subject: 'Welcome to Onyx - Complete Your Registration',
            html: `
                <h2>Welcome to Onyx!</h2>
                <p>You've been invited to join the Onyx platform.</p>
                <p>Click the link below to complete your registration:</p>
                <p><a href="${inviteUrl}?token=${token}">Complete Registration</a></p>
                <p>This link will expire in 7 days.</p>
                <p>If you didn't request this invitation, you can safely ignore this email.</p>
            `
        });

        if (error) {
            console.error('Email send error:', error);
            return { success: false, error };
        }

        console.log('Email sent successfully:', data);
        return { success: true, data };
    } catch (error) {
        console.error('Email send exception:', error);
        return { success: false, error: error.message };
    }
}

async function sendWelcomeEmail(to, displayName) {
    try {
        if (!process.env.RESEND_API_KEY) {
            console.warn('RESEND_API_KEY not configured. Skipping email send.');
            return { success: false, message: 'Email service not configured' };
        }

        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: to,
            subject: 'Welcome to Onyx!',
            html: `
                <h2>Welcome to Onyx, ${displayName || 'there'}!</h2>
                <p>Your account has been successfully created.</p>
                <p>You can now log in and start using the platform.</p>
                <p>If you have any questions, feel free to reach out to our support team.</p>
            `
        });

        if (error) {
            console.error('Welcome email send error:', error);
            return { success: false, error };
        }

        console.log('Welcome email sent successfully:', data);
        return { success: true, data };
    } catch (error) {
        console.error('Welcome email send exception:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendInviteEmail,
    sendWelcomeEmail
};
