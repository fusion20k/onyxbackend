const { Resend } = require('resend');

const fromEmail = process.env.FROM_EMAIL || 'noreply@onyx-project.com';

async function sendInviteEmail(to, token, inviteUrl) {
    try {
        if (!process.env.RESEND_API_KEY) {
            console.warn('RESEND_API_KEY not configured. Skipping email send.');
            return { success: false, message: 'Email service not configured' };
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: to,
            subject: 'Onyx Platform - Registration Approved',
            html: `
                <h2>Welcome to the Onyx Project.</h2>
                <p>Your application has been approved.</p>
                <p>Complete your registration to gain access to the platform:</p>
                <p><a href="${inviteUrl}">Complete Registration</a></p>
                <p><strong>This link expires in 72 hours.</strong></p>
                <p>Do not share this link.</p>
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

        const resend = new Resend(process.env.RESEND_API_KEY);
        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: to,
            subject: 'Onyx Platform - Account Created',
            html: `
                <h2>Welcome to the Onyx Project.</h2>
                <p>Your account is now active.</p>
                <p>You have access to the platform.</p>
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

async function sendAdminResponseEmail(to, messagePreview) {
    try {
        if (!process.env.RESEND_API_KEY) {
            console.warn('RESEND_API_KEY not configured. Skipping email send.');
            return { success: false, message: 'Email service not configured' };
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: to,
            subject: 'Onyx Platform - New Response',
            html: `
                <h2>You have a new response from the Onyx team.</h2>
                <p>${messagePreview}${messagePreview.length >= 100 ? '...' : ''}</p>
                <p>Log in to your workspace to view the full message and continue the conversation.</p>
            `
        });

        if (error) {
            console.error('Admin response email send error:', error);
            return { success: false, error };
        }

        console.log('Admin response email sent successfully:', data);
        return { success: true, data };
    } catch (error) {
        console.error('Admin response email send exception:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendInviteEmail,
    sendWelcomeEmail,
    sendAdminResponseEmail
};
